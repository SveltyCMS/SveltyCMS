/**
 * @file tests/unit/routes/mediagallery-media-sort.test.ts
 * @description Comparator semantics for the gallery's client-side sort and its
 * page-scoped advanced-search date bounds.
 *
 * Features:
 * - newest / oldest match the previous `new Date(...)` numeric comparator
 * - canonical ISO strings never touch `Date.parse` (zero allocations per compare)
 * - equal instants, missing values and non-ISO garbage stay deterministic
 * - date bounds convert once and keep inclusive filter semantics
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareCreatedAt,
  compareMedia,
  dateBoundToIso,
  matchesDateBounds,
  type MediaSortRecord,
} from "../../../src/routes/(app)/mediagallery/media-sort";

/** The comparator that lived inline in `+page.svelte` before this helper. */
function legacyCreatedAt(a: string | null | undefined, b: string | null | undefined): number {
  return new Date(a || 0).getTime() - new Date(b || 0).getTime();
}

const ISO_EARLY = "2023-01-01T00:00:00.000Z";
const ISO_MID = "2024-06-15T12:30:00.000Z";
const ISO_LATE = "2025-11-07T09:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("compareCreatedAt", () => {
  it("sorts ascending (oldest first)", () => {
    expect(compareCreatedAt(ISO_EARLY, ISO_MID)).toBe(-1);
    expect(compareCreatedAt(ISO_LATE, ISO_MID)).toBe(1);
    expect(compareCreatedAt(ISO_MID, ISO_MID)).toBe(0);
  });

  it("uses the lexicographic fast path for canonical ISO without parsing", () => {
    const parseSpy = vi.spyOn(Date, "parse");

    expect(compareCreatedAt(ISO_LATE, ISO_EARLY)).toBe(1);
    expect(compareCreatedAt(ISO_EARLY, ISO_LATE)).toBe(-1);

    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("matches the legacy numeric comparator for valid timestamp strings", () => {
    const valid = [
      ISO_EARLY,
      ISO_MID,
      ISO_LATE,
      "2024-06-15T14:30:00+02:00", // same instant as ISO_MID
      "2024-06-15T12:30:00Z", // no milliseconds, same instant
      "1969-12-31T23:59:59.000Z", // before the epoch
      "2030-02-28T23:59:59.999Z",
    ];

    for (const a of valid) {
      for (const b of valid) {
        expect(Math.sign(compareCreatedAt(a, b))).toBe(Math.sign(legacyCreatedAt(a, b)));
      }
    }
  });

  it("treats equal instants in different ISO forms as equal", () => {
    expect(compareCreatedAt("2024-06-15T12:30:00.000Z", "2024-06-15T14:30:00+02:00")).toBe(0);
    expect(compareCreatedAt("2024-06-15T12:30:00.000Z", "2024-06-15T12:30:00Z")).toBe(0);
  });

  it("pins missing values to the epoch", () => {
    expect(compareCreatedAt(undefined, ISO_EARLY)).toBe(-1);
    expect(compareCreatedAt(null, ISO_EARLY)).toBe(-1);
    expect(compareCreatedAt("", ISO_EARLY)).toBe(-1);
    expect(compareCreatedAt(undefined, null)).toBe(0);
    expect(compareCreatedAt(undefined, "1969-12-31T23:59:59.000Z")).toBe(1);
  });

  it("pins non-ISO garbage to the epoch deterministically", () => {
    for (const garbage of ["not-a-date", "2024-13-45", "NaN", "   "]) {
      expect(compareCreatedAt(garbage, ISO_MID)).toBe(-1);
      expect(compareCreatedAt(ISO_MID, garbage)).toBe(1);
      expect(compareCreatedAt(garbage, undefined)).toBe(0);
      expect(compareCreatedAt(garbage, "another-not-a-date")).toBe(0);
    }
  });

  it("never returns NaN", () => {
    const values = [ISO_MID, undefined, null, "", "garbage", "2024-06-15T12:30:00Z"];

    for (const a of values) {
      for (const b of values) {
        expect(Number.isNaN(compareCreatedAt(a, b))).toBe(false);
      }
    }
  });
});

describe("compareMedia", () => {
  const items: MediaSortRecord[] = [
    { filename: "b.png", createdAt: ISO_MID, size: 200 },
    { filename: "a.png", createdAt: ISO_LATE, size: 100 },
    { filename: "c.png", createdAt: ISO_EARLY, size: 300 },
  ];

  it("newest / oldest match the legacy ordering", () => {
    const newest = [...items].sort((a, b) => compareMedia(a, b, "newest"));
    const oldest = [...items].sort((a, b) => compareMedia(a, b, "oldest"));

    expect(newest.map((item) => item.filename)).toEqual(["a.png", "b.png", "c.png"]);
    expect(oldest.map((item) => item.filename)).toEqual(["c.png", "b.png", "a.png"]);

    const legacyNewest = [...items].sort((a, b) => legacyCreatedAt(b.createdAt, a.createdAt));
    const legacyOldest = [...items].sort((a, b) => legacyCreatedAt(a.createdAt, b.createdAt));
    expect(newest.map((item) => item.filename)).toEqual(legacyNewest.map((item) => item.filename));
    expect(oldest.map((item) => item.filename)).toEqual(legacyOldest.map((item) => item.filename));
  });

  it("keeps name and size ordering identical to the previous switch", () => {
    expect(
      [...items].sort((a, b) => compareMedia(a, b, "name-asc")).map((item) => item.filename),
    ).toEqual(["a.png", "b.png", "c.png"]);
    expect(
      [...items].sort((a, b) => compareMedia(a, b, "name-desc")).map((item) => item.filename),
    ).toEqual(["c.png", "b.png", "a.png"]);
    expect(
      [...items].sort((a, b) => compareMedia(a, b, "size-asc")).map((item) => item.size),
    ).toEqual([100, 200, 300]);
    expect(
      [...items].sort((a, b) => compareMedia(a, b, "size-desc")).map((item) => item.size),
    ).toEqual([300, 200, 100]);
  });

  it("keeps the legacy no-op comparison for rows without a size", () => {
    expect(Number.isNaN(compareMedia({ filename: "remote" }, { size: 1 }, "size-asc"))).toBe(true);
    expect(Number.isNaN(compareMedia({ size: 1 }, { filename: "remote" }, "size-desc"))).toBe(true);
  });

  it("defaults unknown keys to newest and keeps missing dates at the end", () => {
    const rows: MediaSortRecord[] = [
      { filename: "missing.png" },
      { filename: "old.png", createdAt: ISO_EARLY },
      { filename: "new.png", createdAt: ISO_LATE },
    ];

    expect(
      [...rows].sort((a, b) => compareMedia(a, b, "newest")).map((item) => item.filename),
    ).toEqual(["new.png", "old.png", "missing.png"]);
    expect(
      [...rows].sort((a, b) => compareMedia(a, b, "oldest")).map((item) => item.filename),
    ).toEqual(["missing.png", "old.png", "new.png"]);
  });
});

describe("date bounds", () => {
  const after = new Date("2024-01-01T00:00:00.000Z");
  const before = new Date("2024-12-31T23:59:59.999Z");

  it("converts a bound to its canonical ISO form once", () => {
    expect(dateBoundToIso(after)).toBe("2024-01-01T00:00:00.000Z");
    expect(dateBoundToIso(before)).toBe("2024-12-31T23:59:59.999Z");
    expect(dateBoundToIso(new Date("garbage"))).toBeUndefined();
    expect(dateBoundToIso(undefined)).toBeUndefined();
  });

  it("keeps the inclusive legacy filter semantics", () => {
    const afterIso = dateBoundToIso(after);
    const beforeIso = dateBoundToIso(before);

    const legacyKeep = (createdAt: string | null | undefined) =>
      !(new Date(createdAt || 0) < after) && !(new Date(createdAt || 0) > before);

    for (const createdAt of [
      "2023-12-31T23:59:59.999Z",
      "2024-01-01T00:00:00.000Z",
      "2024-06-15T12:30:00.000Z",
      "2024-12-31T23:59:59.999Z",
      "2025-01-01T00:00:00.000Z",
      undefined,
    ]) {
      expect(matchesDateBounds(createdAt, afterIso, beforeIso)).toBe(legacyKeep(createdAt));
    }
  });

  it("treats absent bounds as open ends and an invalid bound as no-ops", () => {
    expect(matchesDateBounds(ISO_MID, undefined, undefined)).toBe(true);
    expect(matchesDateBounds(ISO_EARLY, undefined, dateBoundToIso(before))).toBe(true);
    expect(matchesDateBounds(ISO_LATE, dateBoundToIso(after), undefined)).toBe(true);
    expect(matchesDateBounds(ISO_MID, dateBoundToIso(new Date("garbage")), undefined)).toBe(true);
  });
});
