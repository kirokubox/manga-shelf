export type PublicationStatus = "ongoing" | "completed" | "unknown";
export type OwnedMedium = "paper" | "kindle" | "jump_plus" | null;
export type PaperLocation = "home" | "parents_home" | "both" | "unknown" | null;

export interface VolumeRange {
  from: number;
  to: number;
}

export interface MangaSeries {
  id: string;
  title: string;
  kana: string;
  editionLabel: string | null;
  publicationStatus: PublicationStatus;
  totalVolumes: number | null;
  bibliographyCheckedAt: string | null;
  readProgressKnown: boolean;
  readUpTo: number | null;
  finishedAt: string | null;
  ownershipKnown: boolean;
  ownedMedium: OwnedMedium;
  paperLocation: PaperLocation;
  ownedRanges: VolumeRange[];
  planned: boolean;
  legacyNote: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface MangaShelfData {
  version: 2;
  series: MangaSeries[];
}

export interface UndoState {
  message: string;
  before: MangaSeries[];
}
