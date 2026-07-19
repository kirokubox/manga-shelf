import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BookCheck, BookOpen, Check, CircleHelp, Download, Home, LibraryBig,
  Pencil, Plus, RefreshCw, RotateCcw, Search, Settings, ShoppingBag, SlidersHorizontal, Trash2, Upload,
} from "lucide-react";
import {
  ACTIVE_VIEW_KEY, createMarkdown, formatRanges, isFullyRead, isRereading, loadData, missingRanges,
  needsReview, normalizeData, parseRanges, remainingVolumes, saveData, sortKey,
} from "./data";
import type { MangaSeries, OwnedMedium, PublicationStatus, UndoState } from "./types";
import { Sheet } from "./components/Sheet";
import { ShelfCard, ShoppingCard } from "./components/cards";
import { AddSheet, type AddResult } from "./components/AddSheet";
import { BiblioSheet, type BiblioChange } from "./components/BiblioSheet";
import { mediumLabel, publicationLabel } from "./labels";
import "./styles.css";

type View = "shelf" | "shopping" | "settings";
type Filter = "all" | "continue" | "finished";
type Modal =
  | { kind: "detail"; id: string }
  | { kind: "edit"; id: string; reviewMode?: boolean }
  | { kind: "read"; id: string }
  | { kind: "owned"; id: string }
  | { kind: "add" }
  | { kind: "import" }
  | { kind: "biblio" }
  | null;

interface Draft {
  title: string;
  kana: string;
  publicationStatus: PublicationStatus;
  totalVolumes: string;
  readProgressKnown: boolean;
  readUpTo: string;
  ownershipKnown: boolean;
  ownedMedium: OwnedMedium;
  ownedRanges: string;
  planned: boolean;
  memo: string;
}

interface ImportPreview {
  valid: boolean;
  incoming: MangaSeries[];
  newSeries: MangaSeries[];
  updatedSeries: MangaSeries[];
  unchangedCount: number;
  titleWarnings: string[];
  errors: string[];
  migratedV1: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const normalizedTitle = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s・!！:：]/g, "");

const loadView = (): View => {
  const stored = localStorage.getItem(ACTIVE_VIEW_KEY);
  return stored === "shopping" || stored === "settings" ? stored : "shelf";
};

const draftFromSeries = (item: MangaSeries): Draft => ({
  title: item.title,
  kana: item.kana,
  publicationStatus: item.publicationStatus,
  totalVolumes: item.totalVolumes?.toString() ?? "",
  readProgressKnown: item.readProgressKnown,
  readUpTo: item.readUpTo?.toString() ?? "",
  ownershipKnown: item.ownershipKnown,
  ownedMedium: item.ownedMedium,
  ownedRanges: formatRanges(item.ownedRanges),
  planned: item.planned,
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

function App() {
  const [series, setSeries] = useState<MangaSeries[]>(() => loadData().series);
  const [view, setView] = useState<View>(loadView);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
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

  const reviewItems = useMemo(() => series.filter(needsReview).sort((a, b) => sortKey(a).localeCompare(sortKey(b), "ja")), [series]);
  const biblioTargets = useMemo(() => series.filter((item) => item.anilistId !== null && item.publicationStatus === "ongoing"), [series]);

  const visibleSeries = useMemo(() => {
    const term = query.trim().normalize("NFKC").toLocaleLowerCase("ja");
    return [...series]
      .filter((item) => view !== "shopping" || item.planned)
      .filter((item) => !term || item.title.normalize("NFKC").toLocaleLowerCase("ja").includes(term) || item.kana.normalize("NFKC").toLocaleLowerCase("ja").includes(term))
      .filter((item) => {
        if (view === "shopping") return true;
        if (filter === "continue") return item.readProgressKnown && !isFullyRead(item);
        if (filter === "finished") return isFullyRead(item);
        return true;
      })
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b), "ja"));
  }, [series, query, filter, view]);

  const selected = modal && "id" in modal ? series.find((item) => item.id === modal.id) ?? null : null;

  const replaceSeries = (next: MangaSeries[], undoMessage?: string) => {
    if (undoMessage) setUndo({ message: undoMessage, before: series });
    setSeries(next);
  };

  const openEdit = (item: MangaSeries, reviewMode = false) => {
    setDraft(draftFromSeries(item));
    setFormError("");
    setModal({ kind: "edit", id: item.id, reviewMode });
  };

  const addSeries = ({ title, kana, entry }: AddResult) => {
    const timestamp = now();
    const item: MangaSeries = {
      id: crypto.randomUUID(),
      title,
      kana,
      editionLabel: null,
      publicationStatus: entry?.status ?? "unknown",
      totalVolumes: entry?.volumes ?? null,
      bibliographyCheckedAt: entry ? today() : null,
      readProgressKnown: false,
      readUpTo: null,
      finishedAt: null,
      everCompleted: false,
      ownershipKnown: false,
      ownedMedium: null,
      paperLocation: null,
      ownedRanges: [],
      planned: false,
      anilistId: entry?.id ?? null,
      legacyNote: "",
      memo: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    replaceSeries([...series, item], `${title}を追加しました`);
    setModal({ kind: "detail", id: item.id });
  };

  const saveDraft = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || modal?.kind !== "edit") return;
    const existing = series.find((item) => item.id === modal.id);
    if (!existing) return;
    const title = draft.title.trim();
    const totalVolumes = draft.totalVolumes ? Number(draft.totalVolumes) : null;
    const readUpTo = draft.readUpTo ? Number(draft.readUpTo) : null;
    const ranges = parseRanges(draft.ownedRanges);
    if (!title) return setFormError("タイトルを入力してください");
    if (draft.publicationStatus === "completed" && (!totalVolumes || totalVolumes < 1)) return setFormError("完結作品は全巻数を入力してください");
    if (readUpTo !== null && (!Number.isInteger(readUpTo) || readUpTo < 0)) return setFormError("既読巻は0以上の整数で入力してください");
    if (ranges === null) return setFormError("所持巻は「1-5, 7-10」の形式で入力してください");
    if (draft.ownershipKnown && ranges.length > 0 && !draft.ownedMedium) return setFormError("所持媒体を選んでください");
    const nextReadUpTo = draft.readProgressKnown ? readUpTo : null;
    const item: MangaSeries = {
      ...existing,
      title,
      kana: draft.kana.trim(),
      publicationStatus: draft.publicationStatus,
      totalVolumes,
      readProgressKnown: draft.readProgressKnown,
      readUpTo: nextReadUpTo,
      everCompleted: existing.everCompleted ||
        (draft.publicationStatus === "completed" && totalVolumes !== null && draft.readProgressKnown && nextReadUpTo !== null && nextReadUpTo >= totalVolumes),
      ownershipKnown: draft.ownershipKnown,
      ownedMedium: draft.ownedMedium,
      paperLocation: null,
      ownedRanges: draft.ownershipKnown ? ranges : [],
      planned: draft.planned,
      memo: draft.memo.trim(),
      updatedAt: now(),
    };
    replaceSeries(series.map((entry) => entry.id === item.id ? item : entry), `${title}の変更を保存しました`);
    const nextReview = modal.reviewMode ? reviewItems.find((entry) => entry.id !== item.id) : null;
    if (nextReview) openEdit(nextReview, true);
    else setModal({ kind: "detail", id: item.id });
  };

  const saveRead = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const value = quickValue ? Number(quickValue) : null;
    if (value !== null && (!Number.isInteger(value) || value < 0)) return setFormError("0以上の整数で入力してください");
    replaceSeries(series.map((item) => item.id === selected.id ? {
      ...item,
      readProgressKnown: true,
      readUpTo: value,
      everCompleted: item.everCompleted ||
        (item.publicationStatus === "completed" && item.totalVolumes !== null && value !== null && value >= item.totalVolumes),
      updatedAt: now(),
    } : item), `${selected.title}の既読巻を更新しました`);
    setModal({ kind: "detail", id: selected.id });
  };

  const saveReadFromStart = () => {
    if (!selected) return;
    replaceSeries(series.map((item) => item.id === selected.id ? { ...item, readProgressKnown: true, readUpTo: 0, updatedAt: now() } : item), `${selected.title}を1巻から読む作品にしました`);
    setModal({ kind: "detail", id: selected.id });
  };

  const markFinished = (item: MangaSeries) => {
    if (item.publicationStatus !== "completed" || !item.totalVolumes) {
      setMessage("先に刊行状況を完結にし、全巻数を入力してください");
      return;
    }
    replaceSeries(series.map((entry) => entry.id === item.id ? {
      ...entry,
      readProgressKnown: true,
      readUpTo: item.totalVolumes,
      finishedAt: entry.finishedAt ?? today(),
      everCompleted: true,
      updatedAt: now(),
    } : entry), `${item.title}を全巻読了にしました`);
  };

  const saveOwned = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const ranges = parseRanges(quickValue);
    if (ranges === null) return setFormError("「1-5, 7-10」の形式で入力してください");
    if (ranges.length > 0 && !selected.ownedMedium) return setFormError("先に「すべて編集」で所持媒体を選んでください");
    replaceSeries(series.map((item) => item.id === selected.id ? { ...item, ownershipKnown: true, ownedRanges: ranges, updatedAt: now() } : item), `${selected.title}の所持巻を更新しました`);
    setModal({ kind: "detail", id: selected.id });
  };

  const deleteSeries = (item: MangaSeries) => {
    if (!window.confirm(`「${item.title}」を削除しますか？`)) return;
    replaceSeries(series.filter((entry) => entry.id !== item.id), `${item.title}を削除しました`);
    setModal(null);
  };

  const applyBiblio = (changes: BiblioChange[]) => {
    const byId = new Map(changes.map((change) => [change.id, change]));
    replaceSeries(series.map((item) => {
      const change = byId.get(item.id);
      return change ? { ...item, publicationStatus: change.publicationStatus, totalVolumes: change.totalVolumes, bibliographyCheckedAt: today(), updatedAt: now() } : item;
    }), `${changes.length}作品の書誌を更新しました`);
    setMessage(`${changes.length}作品の書誌を更新しました`);
    setModal(null);
  };

  const readImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const normalized = normalizeData(raw);
      const existingById = new Map(series.map((item) => [item.id, item]));
      const titles = new Map(series.map((item) => [normalizedTitle(item.title), item.title]));
      const newSeries = normalized.series.filter((item) => !existingById.has(item.id));
      const updatedSeries = normalized.series.filter((item) => {
        const existing = existingById.get(item.id);
        return existing && JSON.stringify(existing) !== JSON.stringify(item);
      });
      const unchangedCount = normalized.series.length - newSeries.length - updatedSeries.length;
      const titleWarnings = newSeries.flatMap((item) => {
        const match = titles.get(normalizedTitle(item.title));
        return match ? [`「${item.title}」は既存の「${match}」と同名候補です。自動統合はしません`] : [];
      });
      setImportPreview({ valid: true, incoming: normalized.series, newSeries, updatedSeries, unchangedCount, titleWarnings, errors: [], migratedV1: raw.version !== 2 });
      setModal({ kind: "import" });
    } catch (error) {
      setImportPreview({ valid: false, incoming: [], newSeries: [], updatedSeries: [], unchangedCount: 0, titleWarnings: [], errors: [error instanceof Error ? error.message : "ファイルを読み込めませんでした"], migratedV1: false });
      setModal({ kind: "import" });
    } finally {
      event.target.value = "";
    }
  };

  const applyImport = () => {
    if (!importPreview?.valid) return;
    const incomingById = new Map(importPreview.incoming.map((item) => [item.id, item]));
    const merged = series.map((item) => incomingById.get(item.id) ?? item);
    replaceSeries([...merged, ...importPreview.newSeries], `${importPreview.updatedSeries.length}作品を更新、${importPreview.newSeries.length}作品を追加しました`);
    setMessage(`${importPreview.updatedSeries.length}作品を更新し、${importPreview.newSeries.length}作品を追加しました`);
    setModal(null);
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "すべて" }, { id: "continue", label: "続きあり" }, { id: "finished", label: "読了" },
  ];

  return (
    <div className="app-shell">
      <main>
        {view === "shelf" && <>
          <header className="app-header">
            <div><p className="eyebrow">次は何巻から読む？</p><h1>マンガ棚</h1></div>
            <button className="round-add" onClick={() => setModal({ kind: "add" })} aria-label="作品を追加"><Plus /></button>
          </header>
          <div className="search-row">
            <label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="作品名・よみがなで検索" /></label>
            <button className={`filter-button ${filtersOpen ? "active" : ""}`} onClick={() => setFiltersOpen(!filtersOpen)} aria-label="絞り込み"><SlidersHorizontal /></button>
          </div>
          {filtersOpen && <div className="filter-chips">{filters.map((item) => <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>}
          <div className="result-meta">
            <span>{visibleSeries.length}作品</span>
            {filter !== "all" && <button onClick={() => setFilter("all")}>絞り込み解除</button>}
          </div>
          <div className="series-list">
            {visibleSeries.map((item) => <ShelfCard key={item.id} item={item} onOpen={() => setModal({ kind: "detail", id: item.id })} />)}
            {visibleSeries.length === 0 && <div className="empty-state"><LibraryBig /><h2>該当する作品はありません</h2><p>検索語や絞り込みを変えてください。</p></div>}
          </div>
        </>}

        {view === "shopping" && <>
          <header className="app-header">
            <div><p className="eyebrow">何巻持ってる？ 何巻が抜けてる？</p><h1>買い物</h1></div>
          </header>
          <div className="search-row">
            <label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="買う予定の作品から検索" /></label>
          </div>
          <div className="result-meta"><span>買う予定 {visibleSeries.length}作品</span></div>
          <div className="series-list">
            {visibleSeries.map((item) => <ShoppingCard key={item.id} item={item} onOpen={() => setModal({ kind: "detail", id: item.id })} />)}
            {visibleSeries.length === 0 && <div className="empty-state"><ShoppingBag /><h2>買う予定の作品はありません</h2><p>作品の詳細画面で「買う予定」をオンにすると、ここに並びます。</p></div>}
          </div>
        </>}

        {view === "settings" && <>
          <header className="app-header"><div><p className="eyebrow">データの管理と整理</p><h1>設定</h1></div></header>
          <section className="settings-card">
            <h2>書誌の一括確認</h2><p>連載中の作品をAniListへ照会し、完結や巻数の変化を確認します。対象は書誌候補から登録した作品です。</p>
            <button onClick={() => setModal({ kind: "biblio" })} disabled={biblioTargets.length === 0}><RefreshCw />連載中{biblioTargets.length}作品を確認する</button>
          </section>
          <section className="settings-card">
            <h2>要確認の整理</h2><p>読書位置や所持が未確認の作品を、1作品ずつ確認できます。急がなくても、使う作品から埋めれば大丈夫です。</p>
            <button onClick={() => reviewItems[0] && openEdit(reviewItems[0], true)} disabled={reviewItems.length === 0}><CircleHelp />{reviewItems.length === 0 ? "要確認はありません" : `要確認を整理する（${reviewItems.length}作品）`}</button>
          </section>
          <section className="settings-card">
            <h2>バックアップ</h2><p>JSONは復元用、Markdownは読み返し用です。</p>
            <div className="settings-actions">
              <button className="primary" onClick={() => downloadText(`manga-shelf-backup-${today()}.json`, JSON.stringify({ version: 2, series, exportedAt: now() }, null, 2), "application/json")}><Download />JSONエクスポート</button>
              <button onClick={() => downloadText(`manga-shelf-export-${today()}.md`, createMarkdown(series), "text/markdown")}><Download />Markdownエクスポート</button>
            </div>
          </section>
          <section className="settings-card">
            <h2>追加・更新インポート</h2><p>IDが一致する作品は更新し、新しいIDは追加します。ファイルにない既存作品は残ります。v1は要確認状態へ安全に変換します。</p>
            <button onClick={() => fileInputRef.current?.click()}><Upload />JSONを選ぶ</button>
            <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={readImport} />
          </section>
          <section className="settings-card compact-stats"><h2>現在のデータ</h2><div><span>全作品<strong>{series.length}</strong></span><span>要確認<strong>{reviewItems.length}</strong></span><span>全巻読了<strong>{series.filter((item) => item.everCompleted || isFullyRead(item)).length}</strong></span></div></section>
          {message && <p className="inline-message">{message}</p>}
        </>}
      </main>

      <nav className="bottom-nav">
        <button className={view === "shelf" ? "active" : ""} onClick={() => setView("shelf")}><Home /><span>棚</span></button>
        <button className={view === "shopping" ? "active" : ""} onClick={() => setView("shopping")}><ShoppingBag /><span>買い物</span></button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings /><span>設定</span></button>
      </nav>

      {modal?.kind === "detail" && selected && <Sheet title={selected.title} onClose={() => setModal(null)}>
        <div className="detail-summary">
          <div><span>次に読む</span><strong>{isFullyRead(selected) ? "全巻読了済み" : selected.readProgressKnown ? `${selected.readUpTo ? `${selected.readUpTo + 1}巻から` : "1巻から読む"}${isRereading(selected) ? "（再読）" : ""}` : "要確認"}</strong></div>
          <div><span>残り</span><strong>{selected.publicationStatus === "completed" ? remainingVolumes(selected) === null ? "要確認" : `${remainingVolumes(selected)}巻` : "—"}</strong></div>
        </div>
        <div className="quick-actions">
          <button className="primary" onClick={() => { setQuickValue(selected.readUpTo?.toString() ?? ""); setFormError(""); setModal({ kind: "read", id: selected.id }); }}><BookOpen />ここまで読んだ</button>
          <button onClick={() => { setQuickValue(formatRanges(selected.ownedRanges)); setFormError(""); setModal({ kind: "owned", id: selected.id }); }}><LibraryBig />所持巻を編集</button>
          <button onClick={() => markFinished(selected)} disabled={isFullyRead(selected)}><BookCheck />{isFullyRead(selected) ? "全巻読了済み" : "今日全巻読了した"}</button>
        </div>
        <dl className="detail-list">
          <div><dt>刊行</dt><dd>{publicationLabel[selected.publicationStatus]}{selected.totalVolumes ? `・全${selected.totalVolumes}巻` : ""}</dd></div>
          <div><dt>既読</dt><dd>{selected.readProgressKnown ? `${selected.readUpTo ? `${selected.readUpTo}巻まで` : "1巻から読む"}${isRereading(selected) ? "（再読中）" : ""}` : "要確認"}</dd></div>
          {selected.everCompleted && <div><dt>読了記録</dt><dd>全巻読了済み{selected.finishedAt ? `（${selected.finishedAt.replaceAll("-", "/")}）` : ""}</dd></div>}
          <div><dt>所持</dt><dd>{selected.ownershipKnown ? selected.ownedRanges.length ? formatRanges(selected.ownedRanges) : "なし" : selected.ownedMedium ? "巻数未入力" : "要確認"}</dd></div>
          {selected.ownershipKnown && selected.planned && missingRanges(selected).length > 0 && <div><dt>未所持</dt><dd>{formatRanges(missingRanges(selected))}</dd></div>}
          <div><dt>媒体</dt><dd>{selected.ownedMedium ? mediumLabel[selected.ownedMedium] : "—"}</dd></div>
          <div><dt>買う予定</dt><dd>{selected.planned ? "あり（買い物タブに表示）" : "なし"}</dd></div>
          {selected.legacyNote && <div><dt>元情報</dt><dd>{selected.legacyNote}</dd></div>}
          {selected.memo && <div><dt>メモ</dt><dd>{selected.memo}</dd></div>}
        </dl>
        <div className="detail-footer"><button onClick={() => openEdit(selected)}><Pencil />すべて編集</button><button className="danger-text" onClick={() => deleteSeries(selected)}><Trash2 />削除</button></div>
      </Sheet>}

      {modal?.kind === "edit" && draft && <Sheet title={modal.reviewMode ? "作品を確認" : "作品を編集"} onClose={() => setModal(null)}>
        {modal.reviewMode && <p className="review-progress">要確認 {reviewItems.length}作品・保存すると次へ進みます</p>}
        <form className="edit-form" onSubmit={saveDraft}>
          <label><span>タイトル</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label><span>よみがな（任意）</span><input value={draft.kana} onChange={(event) => setDraft({ ...draft, kana: event.target.value })} placeholder="ひらがな・未入力ならタイトルで並びます" /></label>
          <div className="two-columns">
            <label><span>刊行状況</span><select value={draft.publicationStatus} onChange={(event) => setDraft({ ...draft, publicationStatus: event.target.value as PublicationStatus })}><option value="unknown">要確認</option><option value="ongoing">連載中</option><option value="completed">完結</option></select></label>
            <label><span>全巻数</span><input type="number" min="1" value={draft.totalVolumes} onChange={(event) => setDraft({ ...draft, totalVolumes: event.target.value })} placeholder="完結作品は必須" /></label>
          </div>
          <fieldset><legend>読書状況</legend><label className="check-row"><input type="checkbox" checked={draft.readProgressKnown} onChange={(event) => setDraft({ ...draft, readProgressKnown: event.target.checked })} /><span>どこまで読んだか確認済み</span></label>{draft.readProgressKnown && <label><span>何巻まで読んだ（1巻からなら0）</span><input type="number" min="0" value={draft.readUpTo} onChange={(event) => setDraft({ ...draft, readUpTo: event.target.value })} placeholder="1巻から読むなら0" /></label>}</fieldset>
          <fieldset><legend>所持状況</legend><label className="check-row"><input type="checkbox" checked={draft.ownershipKnown} onChange={(event) => setDraft({ ...draft, ownershipKnown: event.target.checked })} /><span>所持巻を確認済み</span></label><label><span>媒体</span><select value={draft.ownedMedium ?? ""} onChange={(event) => setDraft({ ...draft, ownedMedium: (event.target.value || null) as OwnedMedium })}><option value="">所持なし／要確認</option><option value="paper">紙</option><option value="kindle">Kindle</option><option value="jump_plus">少年ジャンプ＋</option></select></label>{draft.ownershipKnown && <label><span>所持巻</span><input value={draft.ownedRanges} onChange={(event) => setDraft({ ...draft, ownedRanges: event.target.value })} placeholder="例：1-5, 7-10（所持なしは空欄）" /></label>}</fieldset>
          <label className="check-row"><input type="checkbox" checked={draft.planned} onChange={(event) => setDraft({ ...draft, planned: event.target.checked })} /><span>買う予定として残す（買い物タブに表示）</span></label>
          <label><span>メモ</span><textarea rows={2} value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} placeholder="実家で確認、アニメで途中まで等" /></label>
          {formError && <p className="form-error">{formError}</p>}
          <div className="sticky-submit"><button type="submit" className="primary"><Check />保存{modal.reviewMode ? "して次へ" : ""}</button>{modal.reviewMode && <button type="button" onClick={() => { const next = reviewItems.find((item) => item.id !== modal.id); next ? openEdit(next, true) : setModal(null); }}>後で確認</button>}</div>
        </form>
      </Sheet>}

      {modal?.kind === "add" && <AddSheet onSave={addSeries} onClose={() => setModal(null)} />}

      {modal?.kind === "read" && selected && <Sheet title="ここまで読んだ" onClose={() => setModal({ kind: "detail", id: selected.id })}><form className="quick-form" onSubmit={saveRead}><p>{selected.title}</p>{selected.everCompleted && <p className="quick-form-note">全巻読了の記録は残ったまま、再読の位置だけが変わります。</p>}<button className="start-from-one" type="button" onClick={saveReadFromStart}><BookOpen />1巻から読む</button><label><span>何巻まで読みましたか？</span><input autoFocus type="number" min="0" value={quickValue} onChange={(event) => setQuickValue(event.target.value)} placeholder="1巻からなら0" /></label>{formError && <p className="form-error">{formError}</p>}<button className="primary" type="submit"><Check />更新する</button></form></Sheet>}
      {modal?.kind === "owned" && selected && <Sheet title="所持巻を編集" onClose={() => setModal({ kind: "detail", id: selected.id })}><form className="quick-form" onSubmit={saveOwned}><p>{selected.title}</p><label><span>持っている巻</span><input autoFocus value={quickValue} onChange={(event) => setQuickValue(event.target.value)} placeholder="例：1-5, 7-10" /></label><small>所持なしなら空欄で保存します。</small>{formError && <p className="form-error">{formError}</p>}<button className="primary" type="submit"><Check />更新する</button></form></Sheet>}
      {modal?.kind === "biblio" && <BiblioSheet targets={biblioTargets} onApply={applyBiblio} onClose={() => setModal(null)} />}
      {modal?.kind === "import" && importPreview && <Sheet title="インポート確認" onClose={() => setModal(null)}>{importPreview.valid ? <><div className="import-stats"><span>読込<strong>{importPreview.incoming.length}</strong></span><span>更新<strong>{importPreview.updatedSeries.length}</strong></span><span>新規<strong>{importPreview.newSeries.length}</strong></span><span>変更なし<strong>{importPreview.unchangedCount}</strong></span><span>警告<strong>{importPreview.titleWarnings.length + (importPreview.migratedV1 ? 1 : 0)}</strong></span></div>{importPreview.migratedV1 && <p className="warning-box">v1データです。旧巻表記は所持・既読へ確定せず、要確認の元情報として取り込みます。</p>}{importPreview.titleWarnings.map((warning) => <p className="warning-box" key={warning}>{warning}</p>)}<button className="primary full-button" onClick={applyImport}><Upload />{importPreview.updatedSeries.length}作品を更新・{importPreview.newSeries.length}作品を追加</button></> : importPreview.errors.map((error) => <p className="form-error" key={error}>{error}</p>)}</Sheet>}

      {undo && <div className="snackbar"><span>{undo.message}</span><button onClick={() => { setSeries(undo.before); setUndo(null); }}><RotateCcw />元に戻す</button></div>}
    </div>
  );
}

export default App;
