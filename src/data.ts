import type { MangaSeries, MangaShelfData, OwnedMedium, PaperLocation, PublicationStatus, VolumeRange } from "./types";

export const STORAGE_KEY = "yuki-manga-shelf-data";
export const ACTIVE_VIEW_KEY = "yuki-manga-shelf-active-view";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asText = (value: unknown) => typeof value === "string" ? value : "";
const asNullableText = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const asPositiveInt = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
const asNonNegativeInt = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
const now = () => new Date().toISOString();

export function normalizeRanges(ranges: VolumeRange[]): VolumeRange[] {
  const valid = ranges
    .filter((range) => Number.isInteger(range.from) && Number.isInteger(range.to) && range.from > 0 && range.to >= range.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const result: VolumeRange[] = [];
  valid.forEach((range) => {
    const last = result.at(-1);
    if (last && range.from <= last.to + 1) last.to = Math.max(last.to, range.to);
    else result.push({ ...range });
  });
  return result;
}

export function parseRanges(text: string): VolumeRange[] | null {
  if (!text.trim()) return [];
  const chunks = text.replaceAll("巻", "").replaceAll("〜", "-").replaceAll("～", "-").split(/[,、\s]+/).filter(Boolean);
  const ranges: VolumeRange[] = [];
  for (const chunk of chunks) {
    const match = chunk.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) return null;
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    if (from < 1 || to < from) return null;
    ranges.push({ from, to });
  }
  return normalizeRanges(ranges);
}

export const formatRanges = (ranges: VolumeRange[]) => ranges.map(({ from, to }) => from === to ? `${from}巻` : `${from}〜${to}巻`).join("、");

export function ownedVolumeSet(series: MangaSeries): Set<number> {
  const result = new Set<number>();
  series.ownedRanges.forEach(({ from, to }) => {
    for (let volume = from; volume <= to; volume += 1) result.add(volume);
  });
  return result;
}

export function missingRanges(series: MangaSeries): VolumeRange[] {
  if (!series.ownershipKnown) return [];
  const latestOwned = Math.max(0, ...series.ownedRanges.map((range) => range.to));
  const ceiling = series.publicationStatus === "completed" && series.totalVolumes ? series.totalVolumes : latestOwned;
  if (ceiling < 1) return [];
  const owned = ownedVolumeSet(series);
  const missing: VolumeRange[] = [];
  let start: number | null = null;
  for (let volume = 1; volume <= ceiling; volume += 1) {
    if (!owned.has(volume) && start === null) start = volume;
    if (owned.has(volume) && start !== null) {
      missing.push({ from: start, to: volume - 1 });
      start = null;
    }
  }
  if (start !== null) missing.push({ from: start, to: ceiling });
  return missing;
}

export const latestOwnedVolume = (series: MangaSeries) => Math.max(0, ...series.ownedRanges.map((range) => range.to));

export function remainingVolumes(series: MangaSeries): number | null {
  if (series.publicationStatus !== "completed" || !series.totalVolumes || !series.readProgressKnown) return null;
  return Math.max(series.totalVolumes - (series.readUpTo ?? 0), 0);
}

export const isFullyRead = (series: MangaSeries) =>
  series.publicationStatus === "completed" &&
  Boolean(series.totalVolumes) &&
  series.readProgressKnown &&
  (series.readUpTo ?? 0) >= (series.totalVolumes ?? 0);

export const isRereading = (series: MangaSeries) =>
  series.everCompleted && series.readProgressKnown && !isFullyRead(series);

export const sortKey = (series: MangaSeries) => series.kana || series.title;

export const needsReview = (series: MangaSeries) =>
  !series.readProgressKnown || !series.ownershipKnown || series.publicationStatus === "unknown" ||
  (series.publicationStatus === "completed" && !series.totalVolumes);

function normalizeOwnedMedium(value: unknown): OwnedMedium {
  return value === "paper" || value === "kindle" || value === "jump_plus" ? value : null;
}

function normalizePaperLocation(value: unknown): PaperLocation {
  return value === "home" || value === "parents_home" || value === "both" || value === "unknown" ? value : null;
}

function normalizePublicationStatus(value: unknown): PublicationStatus {
  return value === "ongoing" || value === "completed" ? value : "unknown";
}

function normalizeV2Series(value: unknown): MangaSeries | null {
  const item = asRecord(value);
  if (!item) return null;
  const title = asText(item.title).trim();
  const kana = asText(item.kana).trim();
  if (!title) return null;
  const ranges = Array.isArray(item.ownedRanges) ? item.ownedRanges.map((entry) => {
    const range = asRecord(entry);
    return range ? { from: Number(range.from), to: Number(range.to) } : null;
  }).filter(Boolean) as VolumeRange[] : [];
  const createdAt = asText(item.createdAt) || now();
  const medium = normalizeOwnedMedium(item.ownedMedium);
  const publicationStatus = normalizePublicationStatus(item.publicationStatus);
  const totalVolumes = asPositiveInt(item.totalVolumes);
  const readProgressKnown = item.readProgressKnown === true;
  const readUpTo = asNonNegativeInt(item.readUpTo);
  const finishedAt = asNullableText(item.finishedAt);
  const edition = asNullableText(item.editionLabel);
  const rawMemo = asText(item.memo).trim();
  const memo = edition && !rawMemo.includes(`版：${edition}`)
    ? [`版：${edition}`, rawMemo].filter(Boolean).join(" / ")
    : rawMemo;
  return {
    id: asText(item.id) || crypto.randomUUID(),
    title,
    kana,
    editionLabel: null,
    publicationStatus,
    totalVolumes,
    bibliographyCheckedAt: asNullableText(item.bibliographyCheckedAt),
    readProgressKnown,
    readUpTo,
    finishedAt,
    everCompleted: item.everCompleted === true || finishedAt !== null ||
      (publicationStatus === "completed" && totalVolumes !== null && readProgressKnown && (readUpTo ?? 0) >= totalVolumes),
    ownershipKnown: item.ownershipKnown === true,
    ownedMedium: medium,
    paperLocation: medium === "paper" ? normalizePaperLocation(item.paperLocation) : null,
    ownedRanges: normalizeRanges(ranges),
    planned: item.planned === true,
    anilistId: asPositiveInt(item.anilistId),
    legacyNote: asText(item.legacyNote),
    memo,
    createdAt,
    updatedAt: asText(item.updatedAt) || createdAt,
  };
}

function legacyRangeText(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  return value.map((entry) => {
    const range = asRecord(entry);
    const from = asPositiveInt(range?.from);
    const to = asPositiveInt(range?.to);
    if (!from) return "";
    return to ? (from === to ? `${from}` : `${from}-${to}`) : `${from}-`;
  }).filter(Boolean).join(", ");
}

function migrateV1Series(value: unknown): MangaSeries | null {
  const item = asRecord(value);
  if (!item) return null;
  const title = asText(item.title).trim();
  if (!title) return null;
  const createdAt = asText(item.createdAt) || now();
  const legacyRange = legacyRangeText(item.ownedRanges);
  const originalMemo = asText(item.memo).trim();
  const notes = [legacyRange ? `旧データの巻表記: ${legacyRange}` : "", originalMemo].filter(Boolean);
  return {
    id: asText(item.id) || crypto.randomUUID(),
    title,
    kana: asText(item.kana).trim(),
    editionLabel: null,
    publicationStatus: normalizePublicationStatus(item.serialStatus),
    totalVolumes: asPositiveInt(item.totalVolumes),
    bibliographyCheckedAt: null,
    readProgressKnown: false,
    readUpTo: null,
    finishedAt: null,
    everCompleted: false,
    ownershipKnown: false,
    ownedMedium: null,
    paperLocation: null,
    ownedRanges: [],
    planned: item.shelfStatus === "planned",
    anilistId: null,
    legacyNote: notes.join(" / "),
    memo: "",
    createdAt,
    updatedAt: asText(item.updatedAt) || createdAt,
  };
}

export function normalizeData(value: unknown): MangaShelfData {
  const root = asRecord(value);
  if (!root || !Array.isArray(root.series)) throw new Error("マンガ棚のseries配列が見つかりません");
  const migrate = root.version === 2 ? normalizeV2Series : migrateV1Series;
  const series = root.series.map(migrate).filter(Boolean) as MangaSeries[];
  if (root.series.length > 0 && series.length === 0) throw new Error("読み込める作品がありません");
  return { version: 2, series };
}

export function loadData(): MangaShelfData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { version: 2, series: [] };
  try {
    return normalizeData(JSON.parse(raw));
  } catch (error) {
    console.warn("マンガ棚の保存データを読み込めませんでした", error);
    return { version: 2, series: [] };
  }
}

export const saveData = (series: MangaSeries[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, series } satisfies MangaShelfData));

export function createMarkdown(series: MangaSeries[]): string {
  const lines = [`# マンガ棚`, "", `出力日: ${new Date().toLocaleDateString("ja-JP")}`, `作品数: ${series.length}`, ""];
  [...series].sort((a, b) => sortKey(a).localeCompare(sortKey(b), "ja")).forEach((item) => {
    const remaining = remainingVolumes(item);
    lines.push(`## ${item.title}`);
    lines.push(`- 刊行: ${item.publicationStatus === "completed" ? `完結${item.totalVolumes ? `・全${item.totalVolumes}巻` : ""}` : item.publicationStatus === "ongoing" ? "連載中" : "要確認"}`);
    lines.push(`- 既読: ${isFullyRead(item) ? "全巻読了" : item.readProgressKnown ? `${item.readUpTo ? `${item.readUpTo}巻まで` : "1巻から読む"}${isRereading(item) ? "（再読中・全巻読了済み）" : ""}` : "要確認"}`);
    if (remaining !== null) lines.push(`- 残り: ${remaining}巻`);
    lines.push(`- 所持: ${item.ownershipKnown ? item.ownedRanges.length ? formatRanges(item.ownedRanges) : "なし" : item.ownedMedium ? "巻数未入力" : "要確認"}`);
    if (item.finishedAt) lines.push(`- 全巻読了日: ${item.finishedAt}`);
    if (item.planned) lines.push("- 買う予定: あり");
    if (item.memo) lines.push(`- メモ: ${item.memo}`);
    if (item.legacyNote) lines.push(`- 元情報: ${item.legacyNote}`);
    lines.push("");
  });
  return lines.join("\n");
}
