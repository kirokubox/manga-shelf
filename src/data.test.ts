import { describe, expect, it } from "vitest";
import { missingRanges, nextOwnedCandidate, normalizeData, normalizeRanges, parseRanges, remainingVolumes } from "./data";
import type { MangaSeries } from "./types";

const base: MangaSeries = {
  id: "test", title: "テスト", kana: "てすと", editionLabel: null,
  publicationStatus: "completed", totalVolumes: 10, bibliographyCheckedAt: "2026-07-18",
  readProgressKnown: true, readUpTo: 6, finishedAt: null,
  ownershipKnown: true, ownedMedium: "kindle", paperLocation: null,
  ownedRanges: [{ from: 1, to: 5 }, { from: 7, to: 10 }], planned: false,
  legacyNote: "", memo: "", createdAt: "2026-07-18T00:00:00Z", updatedAt: "2026-07-18T00:00:00Z",
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
  it("uses the completed volume count for missing volumes and stops the next candidate at the end", () => {
    expect(missingRanges(base)).toEqual([{ from: 6, to: 6 }]);
    expect(nextOwnedCandidate(base)).toBeNull();
  });
  it("allows reading progress to be ahead of ownership", () => {
    expect(remainingVolumes({ ...base, readUpTo: 10, ownedRanges: [{ from: 1, to: 3 }] })).toBe(0);
  });
});

describe("v1 migration", () => {
  it("preserves legacy ranges without claiming ownership or reading", () => {
    const migrated = normalizeData({ version: 1, series: [{ id: "old", title: "旧作品", kana: "きゅうさくひん", shelfStatus: "owned", serialStatus: "completed", totalVolumes: 17, ownedRanges: [{ from: 4, to: null }], memo: "原文" }] }).series[0];
    expect(migrated.ownershipKnown).toBe(false);
    expect(migrated.readProgressKnown).toBe(false);
    expect(migrated.ownedRanges).toEqual([]);
    expect(migrated.legacyNote).toContain("4-");
    expect(migrated.legacyNote).toContain("原文");
  });
});
