import { describe, expect, it } from "vitest";
import { isFullyRead, isRereading, missingRanges, normalizeData, normalizeRanges, parseRanges, remainingVolumes, sortKey } from "./data";
import type { MangaSeries } from "./types";

const base: MangaSeries = {
  id: "test", title: "テスト", kana: "てすと", editionLabel: null,
  publicationStatus: "completed", totalVolumes: 10, bibliographyCheckedAt: "2026-07-18",
  readProgressKnown: true, readUpTo: 6, finishedAt: null, everCompleted: false,
  ownershipKnown: true, ownedMedium: "kindle", paperLocation: null,
  ownedRanges: [{ from: 1, to: 5 }, { from: 7, to: 10 }], planned: false,
  anilistId: null, legacyNote: "", memo: "", createdAt: "2026-07-18T00:00:00Z", updatedAt: "2026-07-18T00:00:00Z",
};

describe("volume helpers", () => {
  it("merges overlapping and adjacent ranges", () => {
    expect(normalizeRanges([{ from: 7, to: 9 }, { from: 1, to: 3 }, { from: 3, to: 6 }])).toEqual([{ from: 1, to: 9 }]);
  });
  it("parses Japanese range separators", () => {
    expect(parseRanges("1〜5巻、7-10")).toEqual([{ from: 1, to: 5 }, { from: 7, to: 10 }]);
  });
  it("finds missing volumes and remaining reading", () => {
    expect(missingRanges(base)).toEqual([{ from: 6, to: 6 }]);
    expect(remainingVolumes(base)).toBe(4);
  });
  it("does not treat unknown reading as all remaining", () => {
    expect(remainingVolumes({ ...base, readProgressKnown: false, readUpTo: null })).toBeNull();
  });
  it("allows reading progress to be ahead of ownership", () => {
    expect(remainingVolumes({ ...base, readUpTo: 10, ownedRanges: [{ from: 1, to: 3 }] })).toBe(0);
  });
  it("keeps zero as the explicit state for reading from volume one", () => {
    const normalized = normalizeData({ version: 2, series: [{ ...base, readUpTo: 0 }] }).series[0];
    expect(normalized.readUpTo).toBe(0);
    expect(remainingVolumes(normalized)).toBe(10);
  });
  it("recognizes a completed series as fully read without requiring a finish date", () => {
    expect(isFullyRead({ ...base, readUpTo: 10, finishedAt: null })).toBe(true);
  });
});

describe("reread support", () => {
  it("derives everCompleted from a fully read series without a finish date", () => {
    const normalized = normalizeData({ version: 2, series: [{ ...base, readUpTo: 10 }] }).series[0];
    expect(normalized.everCompleted).toBe(true);
  });
  it("derives everCompleted from a finish date", () => {
    const normalized = normalizeData({ version: 2, series: [{ ...base, readUpTo: 3, finishedAt: "2026-07-01" }] }).series[0];
    expect(normalized.everCompleted).toBe(true);
  });
  it("keeps the completion record while rereading from volume one", () => {
    const normalized = normalizeData({ version: 2, series: [{ ...base, readUpTo: 0, everCompleted: true, finishedAt: "2026-07-01" }] }).series[0];
    expect(normalized.everCompleted).toBe(true);
    expect(normalized.finishedAt).toBe("2026-07-01");
    expect(isRereading(normalized)).toBe(true);
    expect(isFullyRead(normalized)).toBe(false);
  });
  it("does not mark an unfinished series as rereading", () => {
    expect(isRereading(base)).toBe(false);
  });
});

describe("field reduction", () => {
  it("merges the edition label into the memo and clears the field", () => {
    const normalized = normalizeData({ version: 2, series: [{ ...base, editionLabel: "完全版", memo: "実家で確認" }] }).series[0];
    expect(normalized.editionLabel).toBeNull();
    expect(normalized.memo).toBe("版：完全版 / 実家で確認");
  });
  it("does not duplicate an edition note already in the memo", () => {
    const normalized = normalizeData({ version: 2, series: [{ ...base, editionLabel: "完全版", memo: "版：完全版" }] }).series[0];
    expect(normalized.memo).toBe("版：完全版");
  });
  it("keeps kana empty instead of copying the title", () => {
    const normalized = normalizeData({ version: 2, series: [{ ...base, kana: "" }] }).series[0];
    expect(normalized.kana).toBe("");
    expect(sortKey(normalized)).toBe("テスト");
  });
});

describe("v1 migration", () => {
  it("preserves legacy ranges without claiming ownership or reading", () => {
    const migrated = normalizeData({ version: 1, series: [{ id: "old", title: "旧作品", kana: "きゅうさくひん", shelfStatus: "owned", serialStatus: "completed", totalVolumes: 17, ownedRanges: [{ from: 4, to: null }], memo: "原文" }] }).series[0];
    expect(migrated.ownershipKnown).toBe(false);
    expect(migrated.readProgressKnown).toBe(false);
    expect(migrated.ownedRanges).toEqual([]);
    expect(migrated.everCompleted).toBe(false);
    expect(migrated.legacyNote).toContain("4-");
    expect(migrated.legacyNote).toContain("原文");
  });
});
