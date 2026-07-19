import type { PublicationStatus } from "./types";

const ENDPOINT = "https://graphql.anilist.co";

export interface AnilistEntry {
  id: number;
  title: string;
  status: PublicationStatus;
  volumes: number | null;
  format: string | null;
}

interface RawMedia {
  id?: unknown;
  title?: { native?: unknown; romaji?: unknown };
  status?: unknown;
  volumes?: unknown;
  format?: unknown;
}

// AniListの status(version: 2)。連載再開しうるHIATUSは連載中扱い、CANCELLED等は要確認に落とす。
function mapStatus(value: unknown): PublicationStatus {
  if (value === "FINISHED") return "completed";
  if (value === "RELEASING" || value === "HIATUS") return "ongoing";
  return "unknown";
}

function mapMedia(media: RawMedia): AnilistEntry | null {
  if (typeof media.id !== "number") return null;
  const native = typeof media.title?.native === "string" ? media.title.native : "";
  const romaji = typeof media.title?.romaji === "string" ? media.title.romaji : "";
  const title = native || romaji;
  if (!title) return null;
  return {
    id: media.id,
    title,
    status: mapStatus(media.status),
    volumes: typeof media.volumes === "number" && Number.isInteger(media.volumes) && media.volumes > 0 ? media.volumes : null,
    format: typeof media.format === "string" ? media.format : null,
  };
}

async function query(body: { query: string; variables: Record<string, unknown> }, signal?: AbortSignal): Promise<RawMedia[]> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`AniList応答エラー（${response.status}）`);
  const json = await response.json() as { data?: { Page?: { media?: RawMedia[] } } };
  return json.data?.Page?.media ?? [];
}

export async function searchManga(term: string, signal?: AbortSignal): Promise<AnilistEntry[]> {
  const media = await query({
    query: `query ($search: String) { Page(perPage: 5) { media(search: $search, type: MANGA) { id title { native romaji } status(version: 2) volumes format } } }`,
    variables: { search: term },
  }, signal);
  return media.map(mapMedia).filter(Boolean) as AnilistEntry[];
}

export async function fetchByIds(ids: number[]): Promise<AnilistEntry[]> {
  const result: AnilistEntry[] = [];
  for (let index = 0; index < ids.length; index += 50) {
    const media = await query({
      query: `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: MANGA) { id title { native romaji } status(version: 2) volumes format } } }`,
      variables: { ids: ids.slice(index, index + 50) },
    });
    result.push(...media.map(mapMedia).filter(Boolean) as AnilistEntry[]);
  }
  return result;
}
