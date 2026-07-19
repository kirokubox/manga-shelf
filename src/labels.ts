import type { OwnedMedium, PublicationStatus } from "./types";

export const mediumLabel: Record<Exclude<OwnedMedium, null>, string> = {
  paper: "紙",
  kindle: "Kindle",
  jump_plus: "少年ジャンプ＋",
};

export const publicationLabel: Record<PublicationStatus, string> = {
  ongoing: "連載中",
  completed: "完結",
  unknown: "刊行状況 要確認",
};
