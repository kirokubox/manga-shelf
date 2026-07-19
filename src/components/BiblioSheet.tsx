import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { fetchByIds } from "../anilist";
import type { MangaSeries, PublicationStatus } from "../types";
import { Sheet } from "./Sheet";

export interface BiblioChange {
  id: string;
  title: string;
  summary: string;
  publicationStatus: PublicationStatus;
  totalVolumes: number | null;
}

export function BiblioSheet({ targets, onApply, onClose }: {
  targets: MangaSeries[];
  onApply: (changes: BiblioChange[]) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [changes, setChanges] = useState<BiblioChange[]>([]);
  const [checkedCount, setCheckedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await fetchByIds(targets.map((item) => item.anilistId!));
        if (cancelled) return;
        const byId = new Map(entries.map((entry) => [entry.id, entry]));
        const found: BiblioChange[] = [];
        targets.forEach((item) => {
          const entry = item.anilistId ? byId.get(item.anilistId) : undefined;
          if (!entry) return;
          const statusChanged = entry.status !== "unknown" && entry.status !== item.publicationStatus;
          const nextTotal = entry.volumes ?? item.totalVolumes;
          const volumesChanged = entry.volumes !== null && entry.volumes !== item.totalVolumes;
          if (!statusChanged && !volumesChanged) return;
          const parts = [];
          if (statusChanged) parts.push(entry.status === "completed" ? "完結を検知" : "連載中へ変更");
          if (volumesChanged) parts.push(`全${entry.volumes}巻${item.totalVolumes ? `（現在 全${item.totalVolumes}巻）` : ""}`);
          found.push({
            id: item.id,
            title: item.title,
            summary: parts.join("・"),
            publicationStatus: statusChanged ? entry.status : item.publicationStatus,
            totalVolumes: nextTotal,
          });
        });
        setChanges(found);
        setCheckedCount(entries.length);
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => { cancelled = true; };
  }, [targets]);

  return (
    <Sheet title="書誌の一括確認" onClose={onClose}>
      {state === "loading" && <p className="quick-form-note"><RefreshCw className="spin" />連載中{targets.length}作品をAniListへ照会しています…</p>}
      {state === "failed" && <p className="form-error">照会に失敗しました。通信環境を確認して、もう一度試してください。</p>}
      {state === "ready" && (
        <div className="quick-form">
          <p className="quick-form-note">{checkedCount}作品を照会し、{changes.length}作品に変化がありました。</p>
          {changes.map((change) => (
            <div className="biblio-change" key={change.id}>
              <strong>{change.title}</strong>
              <small>{change.summary}</small>
            </div>
          ))}
          {changes.length > 0 && (
            <>
              <p className="warning-box">AniListの巻数は国内書誌と誤差があることがあります。違うときは詳細画面から手動で直してください。</p>
              <button className="primary" onClick={() => onApply(changes)}><Check />{changes.length}作品に反映する</button>
            </>
          )}
          {changes.length === 0 && <p className="quick-form-note">すべて最新の状態です。</p>}
        </div>
      )}
    </Sheet>
  );
}
