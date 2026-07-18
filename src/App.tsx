import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  BookCheck, BookOpen, Check, ChevronRight, CircleHelp, Download, Home, LibraryBig,
  MapPin, Pencil, Plus, RotateCcw, Search, Settings, SlidersHorizontal, Trash2, Upload, X,
} from "lucide-react";
import {
  ACTIVE_VIEW_KEY, createMarkdown, formatRanges, latestOwnedVolume, loadData, missingRanges,
  needsReview, nextOwnedCandidate, normalizeData, parseRanges, remainingVolumes, saveData,
} from "./data";
import type { MangaSeries, OwnedMedium, PaperLocation, PublicationStatus, UndoState } from "./types";
import "./styles.css";

type View = "shelf" | "settings";
type Filter = "all" | "continue" | "remaining" | "owned" | "missing" | "finished" | "planned" | "review";
type Modal =
  | { kind: "detail"; id: string }
  | { kind: "edit"; id: string | null; reviewMode?: boolean }
  | { kind: "read"; id: string }
  | { kind: "owned"; id: string }
  | { kind: "import" }
  | null;

interface Draft {
  title: string;
  kana: string;
  editionLabel: string;
  publicationStatus: PublicationStatus;
  totalVolumes: string;
  bibliographyCheckedAt: string;
  readProgressKnown: boolean;
  readUpTo: string;
  ownershipKnown: boolean;
  ownedMedium: OwnedMedium;
  paperLocation: PaperLocation;
  ownedRanges: string;
  planned: boolean;
  legacyNote: string;
  memo: string;
}

interface ImportPreview {
  valid: boolean;
  incoming: MangaSeries[];
  newSeries: MangaSeries[];
  duplicateCount: number;
  titleWarnings: string[];
  errors: string[];
  migratedV1: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const normalizedTitle = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s・!！:：]/g, "");

const mediumLabel: Record<Exclude<OwnedMedium, null>, string> = {
  paper: "紙",
  kindle: "Kindle",
  jump_plus: "少年ジャンプ＋",
};

const locationLabel: Record<Exclude<PaperLocation, null>, string> = {
  home: "自宅",
  parents_home: "実家",
  both: "自宅・実家",
  unknown: "場所要確認",
};

const publicationLabel: Record<PublicationStatus, string> = {
  ongoing: "連載中",
  completed: "完結",
  unknown: "刊行状況 要確認",
};

const emptyDraft = (): Draft => ({
  title: "", kana: "", editionLabel: "", publicationStatus: "unknown", totalVolumes: "",
  bibliographyCheckedAt: "", readProgressKnown: false, readUpTo: "", ownershipKnown: false,
  ownedMedium: null, paperLocation: null, ownedRanges: "", planned: false, legacyNote: "", memo: "",
});

const draftFromSeries = (item: MangaSeries): Draft => ({
  title: item.title,
  kana: item.kana,
  editionLabel: item.editionLabel ?? "",
  publicationStatus: item.publicationStatus,
  totalVolumes: item.totalVolumes?.toString() ?? "",
  bibliographyCheckedAt: item.bibliographyCheckedAt ?? "",
  readProgressKnown: item.readProgressKnown,
  readUpTo: item.readUpTo?.toString() ?? "",
  ownershipKnown: item.ownershipKnown,
  ownedMedium: item.ownedMedium,
  paperLocation: item.paperLocation,
  ownedRanges: formatRanges(item.ownedRanges),
  planned: item.planned,
  legacyNote: item.legacyNote,
  memo: item.memo,
});

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <header className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="閉じる"><X /></button></header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function SeriesCard({ item, onOpen }: { item: MangaSeries; onOpen: () => void }) {
  const remaining = remainingVolumes(item);
  const missing = missingRanges(item);
  const nextOwned = nextOwnedCandidate(item);
  return (
    <button className="series-card" onClick={onOpen}>
      <div className="card-top">
        <div>
          <h2>{item.title}</h2>
          {item.editionLabel && <p className="edition">{item.editionLabel}</p>}
        </div>
        <ChevronRight className="chevron" aria-hidden="true" />
      </div>
      <div className="badges">
        <span className={`badge ${item.publicationStatus}`}>{publicationLabel[item.publicationStatus]}{item.totalVolumes ? `・全${item.totalVolumes}巻` : ""}</span>
        {item.ownedMedium && <span className="badge quiet">{mediumLabel[item.ownedMedium]}</span>}
        {item.ownedMedium === "paper" && item.paperLocation && <span className="badge quiet">{locationLabel[item.paperLocation]}</span>}
        {item.planned && <span className="badge planned">買う予定</span>}
        {needsReview(item) && <span className="badge review">要確認</span>}
      </div>
      <div className="answer-grid">
        <div className="answer primary-answer">
          <span>読む</span>
          <strong>{item.finishedAt ? "全巻読了済み" : item.readProgressKnown ? `${(item.readUpTo ?? 0) + 1}巻から` : "要確認"}</strong>
          {item.readProgressKnown && !item.finishedAt && <small>{item.readUpTo ? `${item.readUpTo}巻まで読了` : "まだ読んでいない"}</small>}
        </div>
        <div className="answer">
          <span>残り</span>
          <strong>{item.publicationStatus === "completed" ? remaining === null ? "要確認" : `${remaining}巻` : "—"}</strong>
          {item.finishedAt && <small>{item.finishedAt.replaceAll("-", "/")} 読了</small>}
        </div>
      </div>
      <div className="ownership-line">
        <span>所持</span>
        <strong>{item.ownershipKnown ? item.ownedRanges.length ? formatRanges(item.ownedRanges) : "なし" : "要確認"}</strong>
      </div>
      {item.ownershipKnown && missing.length > 0 && <p className="sub-line">未所持：{formatRanges(missing)}</p>}
      {item.ownershipKnown && nextOwned !== null && <p className="sub-line">次にそろえる候補：{nextOwned}巻</p>}
    </button>
  );
}

function App() {
  const [series, setSeries] = useState<MangaSeries[]>(() => loadData().series);
  const [view, setView] = useState<View>(() => localStorage.getItem(ACTIVE_VIEW_KEY) === "settings" ? "settings" : "shelf");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [quickValue, setQuickValue] = useState("");
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [message, setMessage] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveData(series), [series]);
  useEffect(() => localStorage.setItem(ACTIVE_VIEW_KEY, view), [view]);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const reviewItems = useMemo(() => series.filter(needsReview).sort((a, b) => a.kana.localeCompare(b.kana, "ja")), [series]);
  const visibleSeries = useMemo(() => {
    const term = query.trim().normalize("NFKC").toLocaleLowerCase("ja");
    return [...series]
      .filter((item) => !term || item.title.normalize("NFKC").toLocaleLowerCase("ja").includes(term) || item.kana.normalize("NFKC").toLocaleLowerCase("ja").includes(term))
      .filter((item) => {
        if (filter === "continue") return item.readProgressKnown && !item.finishedAt;
        if (filter === "remaining") return remainingVolumes(item) !== null && remainingVolumes(item)! > 0;
        if (filter === "owned") return item.ownershipKnown && item.ownedRanges.length > 0;
        if (filter === "missing") return missingRanges(item).length > 0;
        if (filter === "finished") return Boolean(item.finishedAt);
        if (filter === "planned") return item.planned;
        if (filter === "review") return needsReview(item);
        return true;
      })
      .sort((a, b) => a.kana.localeCompare(b.kana, "ja"));
  }, [series, query, filter]);

  const selected = modal && "id" in modal ? series.find((item) => item.id === modal.id) ?? null : null;

  const replaceSeries = (next: MangaSeries[], undoMessage?: string) => {
    if (undoMessage) setUndo({ message: undoMessage, before: series });
    setSeries(next);
  };

  const openEdit = (item: MangaSeries | null, reviewMode = false) => {
    setDraft(item ? draftFromSeries(item) : emptyDraft());
    setFormError("");
    setModal({ kind: "edit", id: item?.id ?? null, reviewMode });
  };

  const saveDraft = (event: FormEvent) => {
    event.preventDefault();
    const title = draft.title.trim();
    const kana = draft.kana.trim();
    const totalVolumes = draft.totalVolumes ? Number(draft.totalVolumes) : null;
    const readUpTo = draft.readUpTo ? Number(draft.readUpTo) : null;
    const ranges = parseRanges(draft.ownedRanges);
    if (!title || !kana) return setFormError("タイトルとよみがなを入力してください");
    if (draft.publicationStatus === "completed" && (!totalVolumes || totalVolumes < 1)) return setFormError("完結作品は全巻数を入力してください");
    if (readUpTo !== null && (!Number.isInteger(readUpTo) || readUpTo < 1)) return setFormError("既読巻は1以上の整数で入力してください");
    if (ranges === null) return setFormError("所持巻は「1-5, 7-10」の形式で入力してください");
    if (draft.ownershipKnown && ranges.length > 0 && !draft.ownedMedium) return setFormError("所持媒体を選んでください");
    if (draft.ownedMedium === "paper" && !draft.paperLocation) return setFormError("紙の所在地を選んでください");
    const existing = modal?.kind === "edit" && modal.id ? series.find((item) => item.id === modal.id) : null;
    const timestamp = now();
    const item: MangaSeries = {
      id: existing?.id ?? crypto.randomUUID(), title, kana, editionLabel: draft.editionLabel.trim() || null,
      publicationStatus: draft.publicationStatus, totalVolumes,
      bibliographyCheckedAt: draft.bibliographyCheckedAt || null,
      readProgressKnown: draft.readProgressKnown, readUpTo: draft.readProgressKnown ? readUpTo : null,
      finishedAt: existing?.finishedAt && draft.publicationStatus === "completed" && totalVolumes === readUpTo ? existing.finishedAt : null,
      ownershipKnown: draft.ownershipKnown, ownedMedium: draft.ownedMedium,
      paperLocation: draft.ownedMedium === "paper" ? draft.paperLocation : null,
      ownedRanges: draft.ownershipKnown ? ranges : [], planned: draft.planned,
      legacyNote: draft.legacyNote.trim(), memo: draft.memo.trim(),
      createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp,
    };
    const next = existing ? series.map((entry) => entry.id === item.id ? item : entry) : [...series, item];
    replaceSeries(next, existing ? `${title}の変更を保存しました` : `${title}を追加しました`);
    const nextReview = modal?.kind === "edit" && modal.reviewMode ? reviewItems.find((entry) => entry.id !== item.id) : null;
    if (nextReview) openEdit(nextReview, true);
    else setModal({ kind: "detail", id: item.id });
  };

  const saveRead = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const value = quickValue ? Number(quickValue) : null;
    if (value !== null && (!Number.isInteger(value) || value < 1)) return setFormError("1以上の整数で入力してください");
    replaceSeries(series.map((item) => item.id === selected.id ? { ...item, readProgressKnown: true, readUpTo: value, finishedAt: null, updatedAt: now() } : item), `${selected.title}の既読巻を更新しました`);
    setModal({ kind: "detail", id: selected.id });
  };

  const saveOwned = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const ranges = parseRanges(quickValue);
    if (ranges === null) return setFormError("「1-5, 7-10」の形式で入力してください");
    if (ranges.length > 0 && !selected.ownedMedium) return setFormError("先に「すべて編集」で所持媒体を選んでください");
    if (selected.ownedMedium === "paper" && !selected.paperLocation) return setFormError("先に「すべて編集」で紙の所在地を選んでください");
    replaceSeries(series.map((item) => item.id === selected.id ? { ...item, ownershipKnown: true, ownedRanges: ranges, updatedAt: now() } : item), `${selected.title}の所持巻を更新しました`);
    setModal({ kind: "detail", id: selected.id });
  };

  const markFinished = (item: MangaSeries) => {
    if (item.publicationStatus !== "completed" || !item.totalVolumes) {
      setMessage("先に刊行状況を完結にし、全巻数を入力してください");
      return;
    }
    replaceSeries(series.map((entry) => entry.id === item.id ? { ...entry, readProgressKnown: true, readUpTo: item.totalVolumes, finishedAt: today(), updatedAt: now() } : entry), `${item.title}を全巻読了にしました`);
  };

  const deleteSeries = (item: MangaSeries) => {
    if (!window.confirm(`「${item.title}」を削除しますか？`)) return;
    replaceSeries(series.filter((entry) => entry.id !== item.id), `${item.title}を削除しました`);
    setModal(null);
  };

  const readImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const normalized = normalizeData(raw);
      const ids = new Set(series.map((item) => item.id));
      const titles = new Map(series.map((item) => [normalizedTitle(item.title), item.title]));
      const newSeries = normalized.series.filter((item) => !ids.has(item.id));
      const titleWarnings = newSeries.flatMap((item) => {
        const match = titles.get(normalizedTitle(item.title));
        return match ? [`「${item.title}」は既存の「${match}」と同名候補です。自動統合はしません`] : [];
      });
      setImportPreview({ valid: true, incoming: normalized.series, newSeries, duplicateCount: normalized.series.length - newSeries.length, titleWarnings, errors: [], migratedV1: raw.version !== 2 });
      setModal({ kind: "import" });
    } catch (error) {
      setImportPreview({ valid: false, incoming: [], newSeries: [], duplicateCount: 0, titleWarnings: [], errors: [error instanceof Error ? error.message : "ファイルを読み込めませんでした"], migratedV1: false });
      setModal({ kind: "import" });
    } finally {
      event.target.value = "";
    }
  };

  const applyImport = () => {
    if (!importPreview?.valid) return;
    replaceSeries([...series, ...importPreview.newSeries], `${importPreview.newSeries.length}作品を追加しました`);
    setMessage(`${importPreview.newSeries.length}作品を取り込み、${importPreview.duplicateCount}作品を重複としてスキップしました`);
    setModal(null);
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "すべて" }, { id: "continue", label: "続きあり" }, { id: "remaining", label: "残りあり" },
    { id: "owned", label: "所持あり" }, { id: "missing", label: "未所持あり" }, { id: "finished", label: "読了" },
    { id: "planned", label: "買う予定" }, { id: "review", label: `要確認 ${reviewItems.length}` },
  ];

  return (
    <div className="app-shell">
      <main>
        {view === "shelf" ? <>
          <header className="app-header">
            <div><p className="eyebrow">どこまで読んだ？ 何巻持ってる？</p><h1>マンガ棚</h1></div>
            <button className="round-add" onClick={() => openEdit(null)} aria-label="作品を追加"><Plus /></button>
          </header>
          {reviewItems.length > 0 && <button className="review-banner" onClick={() => openEdit(reviewItems[0], true)}>
            <CircleHelp /><span><strong>要確認が{reviewItems.length}作品あります</strong><small>使う作品から少しずつ整理できます</small></span><ChevronRight />
          </button>}
          <div className="search-row">
            <label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="作品名・よみがなで検索" /></label>
            <button className={`filter-button ${filtersOpen ? "active" : ""}`} onClick={() => setFiltersOpen(!filtersOpen)} aria-label="絞り込み"><SlidersHorizontal /></button>
          </div>
          {filtersOpen && <div className="filter-chips">{filters.map((item) => <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>}
          <div className="result-meta"><span>{visibleSeries.length}作品</span>{filter !== "all" && <button onClick={() => setFilter("all")}>絞り込み解除</button>}</div>
          <div className="series-list">
            {visibleSeries.map((item) => <SeriesCard key={item.id} item={item} onOpen={() => setModal({ kind: "detail", id: item.id })} />)}
            {visibleSeries.length === 0 && <div className="empty-state"><LibraryBig /><h2>該当する作品はありません</h2><p>検索語や絞り込みを変えてください。</p></div>}
          </div>
        </> : <>
          <header className="app-header"><div><p className="eyebrow">データを安全に持ち出す</p><h1>設定</h1></div></header>
          <section className="settings-card">
            <h2>バックアップ</h2><p>JSONは復元用、Markdownは読み返し用です。</p>
            <div className="settings-actions">
              <button className="primary" onClick={() => downloadText(`manga-shelf-backup-${today()}.json`, JSON.stringify({ version: 2, series, exportedAt: now() }, null, 2), "application/json")}><Download />JSONエクスポート</button>
              <button onClick={() => downloadText(`manga-shelf-export-${today()}.md`, createMarkdown(series), "text/markdown")}><Download />Markdownエクスポート</button>
            </div>
          </section>
          <section className="settings-card">
            <h2>追加インポート</h2><p>既存データは消さず、IDが新しい作品だけ追加します。v1は要確認状態へ安全に変換します。</p>
            <button onClick={() => fileInputRef.current?.click()}><Upload />JSONを選ぶ</button>
            <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={readImport} />
          </section>
          <section className="settings-card compact-stats"><h2>現在のデータ</h2><div><span>全作品<strong>{series.length}</strong></span><span>要確認<strong>{reviewItems.length}</strong></span><span>全巻読了<strong>{series.filter((item) => item.finishedAt).length}</strong></span></div></section>
          {message && <p className="inline-message">{message}</p>}
        </>}
      </main>

      <nav className="bottom-nav">
        <button className={view === "shelf" ? "active" : ""} onClick={() => setView("shelf")}><Home /><span>棚</span></button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings /><span>設定</span></button>
      </nav>

      {modal?.kind === "detail" && selected && <Sheet title={selected.title} onClose={() => setModal(null)}>
        <div className="detail-summary">
          <div><span>次に読む</span><strong>{selected.finishedAt ? "全巻読了済み" : selected.readProgressKnown ? `${(selected.readUpTo ?? 0) + 1}巻から` : "要確認"}</strong></div>
          <div><span>残り</span><strong>{selected.publicationStatus === "completed" ? remainingVolumes(selected) === null ? "要確認" : `${remainingVolumes(selected)}巻` : "—"}</strong></div>
        </div>
        <div className="quick-actions">
          <button className="primary" onClick={() => { setQuickValue(selected.readUpTo?.toString() ?? ""); setFormError(""); setModal({ kind: "read", id: selected.id }); }}><BookOpen />ここまで読んだ</button>
          <button onClick={() => { setQuickValue(formatRanges(selected.ownedRanges)); setFormError(""); setModal({ kind: "owned", id: selected.id }); }}><LibraryBig />所持巻を編集</button>
          <button onClick={() => markFinished(selected)} disabled={Boolean(selected.finishedAt)}><BookCheck />{selected.finishedAt ? "全巻読了済み" : "今日全巻読了した"}</button>
        </div>
        <dl className="detail-list">
          <div><dt>刊行</dt><dd>{publicationLabel[selected.publicationStatus]}{selected.totalVolumes ? `・全${selected.totalVolumes}巻` : ""}</dd></div>
          <div><dt>既読</dt><dd>{selected.readProgressKnown ? selected.readUpTo ? `${selected.readUpTo}巻まで` : "未読" : "要確認"}</dd></div>
          <div><dt>所持</dt><dd>{selected.ownershipKnown ? selected.ownedRanges.length ? formatRanges(selected.ownedRanges) : "なし" : "要確認"}</dd></div>
          <div><dt>媒体</dt><dd>{selected.ownedMedium ? mediumLabel[selected.ownedMedium] : "—"}{selected.ownedMedium === "paper" && selected.paperLocation ? `・${locationLabel[selected.paperLocation]}` : ""}</dd></div>
          {selected.legacyNote && <div><dt>元情報</dt><dd>{selected.legacyNote}</dd></div>}
          {selected.memo && <div><dt>メモ</dt><dd>{selected.memo}</dd></div>}
        </dl>
        <div className="detail-footer"><button onClick={() => openEdit(selected)}><Pencil />すべて編集</button><button className="danger-text" onClick={() => deleteSeries(selected)}><Trash2 />削除</button></div>
      </Sheet>}

      {modal?.kind === "edit" && <Sheet title={modal.id ? modal.reviewMode ? "作品を確認" : "作品を編集" : "作品を追加"} onClose={() => setModal(null)}>
        {modal.reviewMode && <p className="review-progress">要確認 {reviewItems.length}作品・保存すると次へ進みます</p>}
        <form className="edit-form" onSubmit={saveDraft}>
          <label><span>タイトル</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label><span>よみがな</span><input value={draft.kana} onChange={(event) => setDraft({ ...draft, kana: event.target.value })} placeholder="ひらがな" /></label>
          <label><span>版（必要な作品だけ）</span><input value={draft.editionLabel} onChange={(event) => setDraft({ ...draft, editionLabel: event.target.value })} placeholder="通常版、完全版など" /></label>
          <div className="two-columns">
            <label><span>刊行状況</span><select value={draft.publicationStatus} onChange={(event) => setDraft({ ...draft, publicationStatus: event.target.value as PublicationStatus })}><option value="unknown">要確認</option><option value="ongoing">連載中</option><option value="completed">完結</option></select></label>
            <label><span>全巻数</span><input type="number" min="1" value={draft.totalVolumes} onChange={(event) => setDraft({ ...draft, totalVolumes: event.target.value })} placeholder="完結作品は必須" /></label>
          </div>
          <label><span>書誌確認日</span><input type="date" value={draft.bibliographyCheckedAt} onChange={(event) => setDraft({ ...draft, bibliographyCheckedAt: event.target.value })} /></label>
          <fieldset><legend>読書状況</legend><label className="check-row"><input type="checkbox" checked={draft.readProgressKnown} onChange={(event) => setDraft({ ...draft, readProgressKnown: event.target.checked })} /><span>どこまで読んだか確認済み</span></label>{draft.readProgressKnown && <label><span>何巻まで読んだ</span><input type="number" min="1" value={draft.readUpTo} onChange={(event) => setDraft({ ...draft, readUpTo: event.target.value })} placeholder="未読なら空欄" /></label>}</fieldset>
          <fieldset><legend>所持状況</legend><label className="check-row"><input type="checkbox" checked={draft.ownershipKnown} onChange={(event) => setDraft({ ...draft, ownershipKnown: event.target.checked })} /><span>所持巻を確認済み</span></label><label><span>媒体</span><select value={draft.ownedMedium ?? ""} onChange={(event) => setDraft({ ...draft, ownedMedium: (event.target.value || null) as OwnedMedium, paperLocation: event.target.value === "paper" ? draft.paperLocation : null })}><option value="">所持なし／要確認</option><option value="paper">紙</option><option value="kindle">Kindle</option><option value="jump_plus">少年ジャンプ＋</option></select></label>{draft.ownedMedium === "paper" && <label><span>紙の所在地</span><select value={draft.paperLocation ?? ""} onChange={(event) => setDraft({ ...draft, paperLocation: (event.target.value || null) as PaperLocation })}><option value="">選択してください</option><option value="home">自宅</option><option value="parents_home">実家</option><option value="both">自宅・実家</option><option value="unknown">要確認</option></select></label>}{draft.ownershipKnown && <label><span>所持巻</span><input value={draft.ownedRanges} onChange={(event) => setDraft({ ...draft, ownedRanges: event.target.value })} placeholder="例：1-5, 7-10（所持なしは空欄）" /></label>}</fieldset>
          <label className="check-row"><input type="checkbox" checked={draft.planned} onChange={(event) => setDraft({ ...draft, planned: event.target.checked })} /><span>買う予定として残す</span></label>
          {draft.legacyNote && <label><span>元情報</span><textarea rows={2} value={draft.legacyNote} onChange={(event) => setDraft({ ...draft, legacyNote: event.target.value })} /></label>}
          <label><span>メモ</span><textarea rows={2} value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} placeholder="実家で確認、アニメで途中まで等" /></label>
          {formError && <p className="form-error">{formError}</p>}
          <div className="sticky-submit"><button type="submit" className="primary"><Check />保存{modal.reviewMode ? "して次へ" : ""}</button>{modal.reviewMode && <button type="button" onClick={() => { const next = reviewItems.find((item) => item.id !== modal.id); next ? openEdit(next, true) : setModal(null); }}>後で確認</button>}</div>
        </form>
      </Sheet>}

      {modal?.kind === "read" && selected && <Sheet title="ここまで読んだ" onClose={() => setModal({ kind: "detail", id: selected.id })}><form className="quick-form" onSubmit={saveRead}><p>{selected.title}</p><label><span>何巻まで読みましたか？</span><input autoFocus type="number" min="1" value={quickValue} onChange={(event) => setQuickValue(event.target.value)} placeholder="未読なら空欄" /></label>{formError && <p className="form-error">{formError}</p>}<button className="primary" type="submit"><Check />更新する</button></form></Sheet>}
      {modal?.kind === "owned" && selected && <Sheet title="所持巻を編集" onClose={() => setModal({ kind: "detail", id: selected.id })}><form className="quick-form" onSubmit={saveOwned}><p>{selected.title}</p><label><span>持っている巻</span><input autoFocus value={quickValue} onChange={(event) => setQuickValue(event.target.value)} placeholder="例：1-5, 7-10" /></label><small>所持なしなら空欄で保存します。</small>{formError && <p className="form-error">{formError}</p>}<button className="primary" type="submit"><Check />更新する</button></form></Sheet>}
      {modal?.kind === "import" && importPreview && <Sheet title="インポート確認" onClose={() => setModal(null)}>{importPreview.valid ? <><div className="import-stats"><span>読込<strong>{importPreview.incoming.length}</strong></span><span>新規<strong>{importPreview.newSeries.length}</strong></span><span>重複<strong>{importPreview.duplicateCount}</strong></span><span>警告<strong>{importPreview.titleWarnings.length + (importPreview.migratedV1 ? 1 : 0)}</strong></span></div>{importPreview.migratedV1 && <p className="warning-box">v1データです。旧巻表記は所持・既読へ確定せず、要確認の元情報として取り込みます。</p>}{importPreview.titleWarnings.map((warning) => <p className="warning-box" key={warning}>{warning}</p>)}<button className="primary full-button" onClick={applyImport}><Upload />新規{importPreview.newSeries.length}作品を追加</button></> : importPreview.errors.map((error) => <p className="form-error" key={error}>{error}</p>)}</Sheet>}

      {undo && <div className="snackbar"><span>{undo.message}</span><button onClick={() => { setSeries(undo.before); setUndo(null); }}><RotateCcw />元に戻す</button></div>}
    </div>
  );
}

export default App;
