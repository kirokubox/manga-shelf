import { FormEvent, useEffect, useState } from "react";
import { Check, CloudOff } from "lucide-react";
import { searchManga, type AnilistEntry } from "../anilist";
import { publicationLabel } from "../labels";
import { Sheet } from "./Sheet";

export interface AddResult {
  title: string;
  kana: string;
  entry: AnilistEntry | null;
}

export function AddSheet({ onSave, onClose }: { onSave: (result: AddResult) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [kana, setKana] = useState("");
  const [candidates, setCandidates] = useState<AnilistEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = title.trim();
    if (term.length < 2) {
      setCandidates([]);
      setSelectedId(null);
      setSearchFailed(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchManga(term, controller.signal);
        setCandidates(found);
        setSelectedId((current) => found.some((entry) => entry.id === current) ? current : null);
        setSearchFailed(false);
      } catch {
        if (!controller.signal.aborted) {
          setCandidates([]);
          setSearchFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [title]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError("タイトルを入力してください");
    onSave({ title: title.trim(), kana: kana.trim(), entry: candidates.find((entry) => entry.id === selectedId) ?? null });
  };

  return (
    <Sheet title="作品を追加" onClose={onClose}>
      <form className="quick-form" onSubmit={submit}>
        <label><span>タイトル</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="作品名だけで追加できます" /></label>
        <label><span>よみがな（任意）</span><input value={kana} onChange={(event) => setKana(event.target.value)} placeholder="ひらがな・未入力ならタイトルで並びます" /></label>
        {(searching || candidates.length > 0 || searchFailed) && (
          <div className="candidate-block">
            <span className="candidate-title">書誌の候補{searching ? "を検索中…" : ""}</span>
            {candidates.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={`candidate ${selectedId === entry.id ? "selected" : ""}`}
                onClick={() => setSelectedId(selectedId === entry.id ? null : entry.id)}
              >
                <strong>{entry.title}</strong>
                <small>{publicationLabel[entry.status]}{entry.volumes ? `・全${entry.volumes}巻` : ""}{entry.format === "ONE_SHOT" ? "・読切" : ""}</small>
              </button>
            ))}
            {!searching && candidates.length === 0 && searchFailed && (
              <p className="candidate-note"><CloudOff />候補を取得できませんでした。手動のまま追加できます。</p>
            )}
            {!searching && candidates.length > 0 && (
              <p className="candidate-note">候補を選ぶと連載状況・巻数が自動入力されます。選ばなくても追加できます。</p>
            )}
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <button className="primary" type="submit"><Check />追加する</button>
      </form>
    </Sheet>
  );
}
