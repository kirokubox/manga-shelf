import { ChevronRight } from "lucide-react";
import { formatRanges, isFullyRead, isRereading, missingRanges, needsReview, remainingVolumes } from "../data";
import { mediumLabel, publicationLabel } from "../labels";
import type { MangaSeries } from "../types";

const finishedDate = (item: MangaSeries) => item.finishedAt?.replaceAll("-", "/") ?? null;

function readAnswer(item: MangaSeries): { main: string; sub: string | null } {
  if (isFullyRead(item)) return { main: "全巻読了済み", sub: finishedDate(item) ? `${finishedDate(item)} 読了` : null };
  if (!item.readProgressKnown) return { main: "要確認", sub: null };
  const rereading = isRereading(item);
  const main = item.readUpTo === 0 || item.readUpTo === null
    ? `1巻から読む${rereading ? "（再読）" : ""}`
    : `${item.readUpTo + 1}巻から${rereading ? "（再読）" : ""}`;
  const sub = rereading
    ? `全巻読了済み${finishedDate(item) ? `・${finishedDate(item)} 読了` : ""}`
    : item.readUpTo ? `${item.readUpTo}巻まで読了` : "最初から読みたい";
  return { main, sub };
}

export function ShelfCard({ item, onOpen }: { item: MangaSeries; onOpen: () => void }) {
  const remaining = remainingVolumes(item);
  const answer = readAnswer(item);
  return (
    <button className="series-card" onClick={onOpen}>
      <div className="card-top">
        <h2>{item.title}</h2>
        <ChevronRight className="chevron" aria-hidden="true" />
      </div>
      <div className="badges">
        <span className={`badge ${item.publicationStatus}`}>{publicationLabel[item.publicationStatus]}{item.totalVolumes ? `・全${item.totalVolumes}巻` : ""}</span>
        {isRereading(item) && <span className="badge reread">再読中</span>}
        {needsReview(item) && <span className="badge review">要確認</span>}
      </div>
      <div className="answer primary-answer single-answer">
        <span>読む</span>
        <strong>{answer.main}</strong>
        {answer.sub && <small>{answer.sub}</small>}
      </div>
      {!isFullyRead(item) && remaining !== null && remaining > 0 && <p className="sub-line">完結まで残り{remaining}巻</p>}
    </button>
  );
}

export function ShoppingCard({ item, onOpen }: { item: MangaSeries; onOpen: () => void }) {
  const missing = missingRanges(item);
  return (
    <button className="series-card" onClick={onOpen}>
      <div className="card-top">
        <h2>{item.title}</h2>
        <ChevronRight className="chevron" aria-hidden="true" />
      </div>
      <div className="badges">
        <span className={`badge ${item.publicationStatus}`}>{publicationLabel[item.publicationStatus]}{item.totalVolumes ? `・全${item.totalVolumes}巻` : ""}</span>
        {item.ownedMedium && <span className="badge quiet">{mediumLabel[item.ownedMedium]}</span>}
      </div>
      <div className="answer primary-answer single-answer">
        <span>所持</span>
        <strong>{item.ownershipKnown ? item.ownedRanges.length ? formatRanges(item.ownedRanges) : "なし" : item.ownedMedium ? "巻数未入力" : "要確認"}</strong>
        {item.ownershipKnown && missing.length > 0 && <small>未所持：{formatRanges(missing)}</small>}
      </div>
    </button>
  );
}
