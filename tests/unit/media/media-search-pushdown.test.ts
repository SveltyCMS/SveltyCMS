/**
 * @file tests/unit/media/media-search-pushdown.test.ts
 * @description Contract tests for the media advanced-search database pushdown.
 *
 * Features:
 * - `criteriaToQueryFilter` emits the portable predicate for every mappable criterion
 * - criteria that cannot be pushed are absent from the filter (never silently dropped)
 * - the database filter is a SUPERSET of `advancedSearch()` over tricky fixtures
 *   (case variants, missing metadata, array tags, duplicated hashes, raw DB rows)
 * - the handler passes the tenant scope and the bounded scan window to `crud.findMany`
 */

import { describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { documentMatches } from "@src/content/schema-model";
import type { DatabaseId } from "@src/databases/db-interface";
import type { LocalCMS } from "@src/services/sdk";
import { advancedSearch, type SearchCriteria } from "@utils/media/advanced-search";
import type { MediaImage, MediaItem } from "@utils/media/media-models";
import {
  criteriaToQueryFilter,
  MEDIA_MAX_MIME_FILTERS,
  MEDIA_SEARCH_IN_MEMORY_CRITERIA,
  type MediaSearchQueryFilter,
} from "@utils/media/media-query-filters";

vi.mock("@utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const {
  MEDIA_SEARCH_MAX_SCAN_LIMIT,
  MEDIA_SEARCH_SCAN_LIMIT,
  handleMediaSearch,
  resolveMediaSearchScanLimit,
} = await import("@src/routes/api/[...path]/handlers/media");

const TENANT = "tenant-pushdown" as DatabaseId;

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function image(overrides: Record<string, unknown> & { _id: string }): MediaImage {
  return {
    access: "public",
    alt: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "user-1",
    filename: `${overrides._id}.jpg`,
    hash: `hash-${overrides._id}`,
    height: 100,
    metadata: {},
    mimeType: "image/jpeg",
    originalFilename: `${overrides._id}.jpg`,
    path: `2026/01/${overrides._id}.jpg`,
    size: 1_000,
    thumbnails: {},
    title: "",
    type: "image",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "user-1",
    url: "",
    user: "user-1",
    width: 100,
    ...overrides,
  } as unknown as MediaImage;
}

const beachJpeg = image({
  _id: "beach-jpeg",
  createdAt: "2026-02-01T00:00:00.000Z",
  filename: "Beach-Sunset.JPG",
  hash: "dup-hash",
  height: 900,
  metadata: {
    dominantColor: "#FF5733",
    exif: { Make: "Canon", Model: "EOS R5", location: "Lisbon" },
    tags: ["Summer", "Travel"],
  },
  mimeType: "image/jpeg",
  size: 2_000,
  width: 1_600,
});

const beachPng = image({
  _id: "beach-png",
  createdAt: "2026-01-15T00:00:00.000Z",
  filename: "beach_sunset.png",
  hash: "dup-hash", // duplicate of beachJpeg
  height: 800,
  metadata: { tags: ["summer"] },
  mimeType: "image/png",
  size: 500,
  width: 800,
});

const reportPdf = {
  ...image({ _id: "report-pdf" }),
  createdAt: "2025-12-01T00:00:00.000Z",
  filename: "Report.PDF",
  hash: "hash-pdf",
  metadata: {},
  mimeType: "application/pdf",
  size: 120,
  type: "document",
} as unknown as MediaItem;

const umlautJpeg = image({
  _id: "umlaut",
  createdAt: "2026-03-01T00:00:00.000Z",
  filename: "ÄRGER.jpg",
  hash: "hash-umlaut",
  metadata: { tags: ["Ärger"] },
  size: 700,
});

/** No EXIF, no tags, no dominant colour — the "missing metadata" case. */
const bareJpeg = image({
  _id: "bare",
  filename: "no-meta.jpg",
  hash: "hash-bare",
  metadata: {},
  size: 50,
  width: 3_000,
  height: 400,
});

/**
 * A raw SQL row as `crud.findMany` returns it: no `type` discriminator and no
 * top-level pixel dimensions (the domain fields are lifted from `metadata` only
 * by the gallery, not by the search handler).
 */
const rawDbRow = {
  ...beachJpeg,
  type: undefined,
  height: undefined,
  width: undefined,
} as unknown as MediaItem;

const FIXTURE: MediaItem[] = [beachJpeg, beachPng, reportPdf, umlautJpeg, bareJpeg, rawDbRow];

/* -------------------------------------------------------------------------- */
/* Filter evaluation — the in-memory equivalent of the pushed query           */
/* -------------------------------------------------------------------------- */

/**
 * Evaluate a {@link MediaSearchQueryFilter} against a fixture row.
 *
 * `documentMatches` is the shared in-memory filter evaluator, but its range
 * comparator is number/string only. The query layer stores `createdAt` as an
 * epoch timestamp on every adapter, so normalize both sides to epoch ms first.
 */
function matchesPushedFilter(file: MediaItem, filter: MediaSearchQueryFilter): boolean {
  const doc = {
    ...(file as unknown as Record<string, unknown>),
    createdAt: Date.parse(file.createdAt),
  };
  const normalized: Record<string, unknown> = {};

  for (const [field, condition] of Object.entries(filter)) {
    if (condition !== null && typeof condition === "object" && !(condition instanceof Date)) {
      const ops: Record<string, unknown> = {};
      for (const [operator, value] of Object.entries(condition)) {
        ops[operator] = value instanceof Date ? value.getTime() : value;
      }
      normalized[field] = ops;
    } else {
      normalized[field] = condition instanceof Date ? condition.getTime() : condition;
    }
  }

  return documentMatches(doc, normalized);
}

/** The push is only valid when every row the in-memory pass keeps is fetched. */
function expectPushIsSuperset(criteria: SearchCriteria, fixture: MediaItem[] = FIXTURE): void {
  const filter = criteriaToQueryFilter(criteria);
  const pushed = fixture.filter((file) => matchesPushedFilter(file, filter));
  const inMemory = advancedSearch(fixture, criteria).files;

  expect(pushed.length).toBeGreaterThanOrEqual(inMemory.length);
  for (const file of inMemory) {
    expect(pushed, `${file._id} survived advancedSearch but not the DB filter`).toContain(file);
  }
}

/* -------------------------------------------------------------------------- */
/* Criterion → filter map                                                     */
/* -------------------------------------------------------------------------- */

describe("criteriaToQueryFilter — pushed criteria", () => {
  it("returns an empty filter when nothing is mappable", () => {
    expect(criteriaToQueryFilter({})).toEqual({});
  });

  it("maps filename to a case-insensitive substring on the physical column", () => {
    expect(criteriaToQueryFilter({ filename: "Beach" })).toEqual({
      filename: { $contains: "Beach" },
    });
  });

  it("keeps a non-ASCII filename in memory (SQL LIKE folds ASCII only)", () => {
    expect(criteriaToQueryFilter({ filename: "Ärger" })).toEqual({});
  });

  it("maps lowercase fileTypes to $in on the MIME column", () => {
    expect(criteriaToQueryFilter({ fileTypes: ["image/png", "image/jpeg"] })).toEqual({
      mimeType: { $in: ["image/png", "image/jpeg"] },
    });
  });

  it("keeps uppercase fileTypes in memory (case-sensitive in-memory comparison)", () => {
    // Normalization lowercases the term, but `advancedSearch()` compares MIMEs
    // case-sensitively — a stored uppercase row would be dropped by the `$in`.
    expect(criteriaToQueryFilter({ fileTypes: ["IMAGE/PNG"] })).toEqual({});
  });

  it("omits the MIME predicate when the list exceeds the adapter cap", () => {
    const fileTypes = Array.from(
      { length: MEDIA_MAX_MIME_FILTERS + 1 },
      (_, index) => `image/variant-${index}`,
    );

    // A truncated `$in` could drop a row the in-memory check keeps.
    expect(criteriaToQueryFilter({ fileTypes })).toEqual({});
  });

  it("maps size bounds to a numeric range", () => {
    expect(criteriaToQueryFilter({ minSize: 100, maxSize: 2_000 })).toEqual({
      size: { $gte: 100, $lte: 2_000 },
    });
    expect(criteriaToQueryFilter({ minSize: 100 })).toEqual({ size: { $gte: 100 } });
    expect(criteriaToQueryFilter({ maxSize: 2_000 })).toEqual({ size: { $lte: 2_000 } });
  });

  it("maps upload dates to a createdAt range and ignores invalid dates", () => {
    const after = new Date("2026-01-01T00:00:00.000Z");
    const before = new Date("2026-02-01T00:00:00.000Z");

    expect(criteriaToQueryFilter({ uploadedAfter: after, uploadedBefore: before })).toEqual({
      createdAt: { $gte: after, $lte: before },
    });
    expect(criteriaToQueryFilter({ uploadedAfter: new Date("not-a-date") })).toEqual({});
  });

  it("maps hashMatch to an exact hash equality", () => {
    expect(criteriaToQueryFilter({ hashMatch: "dup-hash" })).toEqual({ hash: "dup-hash" });
  });
});

describe("criteriaToQueryFilter — post-filtered criteria", () => {
  it("never emits a predicate for pixel bounds, tags, EXIF, colour or duplicates", () => {
    const criteria: SearchCriteria = {
      aspectRatio: "landscape",
      camera: "Canon",
      dominantColor: "#ff5733",
      hasEXIF: true,
      location: "Lisbon",
      maxHeight: 1_080,
      maxWidth: 1_920,
      minHeight: 600,
      minWidth: 1_000,
      showDuplicatesOnly: true,
      tags: ["summer", "travel"],
    };

    expect(criteriaToQueryFilter(criteria)).toEqual({});
  });

  it("lists every in-memory criterion by name, so omission is explicit", () => {
    expect([...MEDIA_SEARCH_IN_MEMORY_CRITERIA].sort()).toEqual(
      [
        "aspectRatio",
        "camera",
        "dominantColor",
        "hasEXIF",
        "location",
        "maxHeight",
        "maxWidth",
        "minHeight",
        "minWidth",
        "showDuplicatesOnly",
        "tags",
      ].sort(),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Superset guarantee                                                         */
/* -------------------------------------------------------------------------- */

describe("pushdown superset", () => {
  const cases: Array<[name: string, criteria: SearchCriteria]> = [
    ["case-insensitive filename", { filename: "BEACH" }],
    ["non-ASCII filename", { filename: "ärger" }],
    ["MIME membership", { fileTypes: ["image/png"] }],
    ["lower size bound", { minSize: 600 }],
    ["upper size bound", { maxSize: 110 }],
    ["size range", { minSize: 110, maxSize: 1_000 }],
    ["uploaded after", { uploadedAfter: new Date("2026-01-10T00:00:00.000Z") }],
    ["uploaded before", { uploadedBefore: new Date("2026-01-20T00:00:00.000Z") }],
    ["hash equality", { hashMatch: "dup-hash" }],
    ["minimum width", { minWidth: 1_000 }],
    ["aspect ratio", { aspectRatio: "landscape" }],
    ["single tag", { tags: ["summer"] }],
    ["all tags", { tags: ["summer", "travel"] }],
    ["camera substring", { camera: "canon" }],
    ["location substring", { location: "lis" }],
    ["EXIF present", { hasEXIF: true }],
    ["EXIF absent", { hasEXIF: false }],
    ["dominant colour", { dominantColor: "#ff" }],
    ["duplicates only", { showDuplicatesOnly: true }],
    [
      "combined pushed + post-filtered",
      {
        filename: "beach",
        fileTypes: ["image/jpeg"],
        minSize: 100,
        tags: ["summer"],
      },
    ],
  ];

  for (const [name, criteria] of cases) {
    it(`fetches a superset for ${name}`, () => {
      expectPushIsSuperset(criteria);
    });
  }

  it("keeps a row whose metadata is missing when only tags are requested", () => {
    // The in-memory pass drops `bareJpeg` (no tags); the DB filter must not be
    // relied upon to do it, because it is empty for tag criteria.
    expect(criteriaToQueryFilter({ tags: ["summer"] })).toEqual({});
    expectPushIsSuperset({ tags: ["summer"] });
  });

  it("keeps raw DB rows without a type discriminator for pixel criteria", () => {
    // The handler receives rows without `type`; `advancedSearch` cannot evaluate
    // `minWidth` for them, so a pushed pixel bound would drop rows it keeps.
    expect(criteriaToQueryFilter({ minWidth: 1_000 })).toEqual({});
    expectPushIsSuperset({ minWidth: 1_000 });
  });
});

/* -------------------------------------------------------------------------- */
/* Handler wiring                                                             */
/* -------------------------------------------------------------------------- */

function handlerEvent(url: URL): RequestEvent {
  return { locals: {}, url } as unknown as RequestEvent;
}

describe("handleMediaSearch", () => {
  it("scopes the query, pushes the mappable filter and bounds the scan", async () => {
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [rawDbRow] });
    const cms = { db: { crud: { findMany } } } as unknown as LocalCMS;
    const url = new URL("http://localhost/api/media/search?filename=Beach&minWidth=999&limit=50");

    const res = await handleMediaSearch(handlerEvent(url), cms, TENANT, url);
    const body = await res.json();

    expect(findMany).toHaveBeenCalledTimes(1);
    const [collection, filter, options] = findMany.mock.calls[0];
    expect(collection).toBe("media");
    expect(filter).toEqual({ filename: { $contains: "Beach" }, tenantId: TENANT });
    expect(options).toEqual({
      limit: 50,
      sort: { createdAt: "desc", _id: "desc" },
      tenantId: TENANT,
    });

    // Response contract is unchanged: `files` / `total` / `matched`.
    expect(body).toMatchObject({
      success: true,
      data: {
        matched: [['Filename: "Beach"']],
        total: 1,
      },
    });
    expect(body.data.files).toHaveLength(1);
    expect(body.data.files[0]._id).toBe("beach-jpeg");
  });

  it("sends an empty pushdown filter when only in-memory criteria are set", async () => {
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [beachJpeg] });
    const cms = { db: { crud: { findMany } } } as unknown as LocalCMS;
    const url = new URL("http://localhost/api/media/search?camera=canon&tags=summer");

    const res = await handleMediaSearch(handlerEvent(url), cms, TENANT, url);
    const body = await res.json();

    expect(findMany.mock.calls[0][1]).toEqual({ tenantId: TENANT });
    expect(body.data.total).toBe(1);
  });

  it("degrades to an empty, well-formed result when the query fails", async () => {
    const findMany = vi.fn().mockResolvedValue({
      error: { code: "FIND_MANY_ERROR", message: "boom" },
      message: "boom",
      success: false,
    });
    const cms = { db: { crud: { findMany } } } as unknown as LocalCMS;
    const url = new URL("http://localhost/api/media/search?filename=Beach");

    const res = await handleMediaSearch(handlerEvent(url), cms, TENANT, url);
    const body = await res.json();

    expect(body).toEqual({ success: true, data: { files: [], matched: [], total: 0 } });
  });
});

describe("resolveMediaSearchScanLimit", () => {
  it("defaults to the scan limit and clamps larger requests", () => {
    expect(resolveMediaSearchScanLimit(null)).toBe(MEDIA_SEARCH_SCAN_LIMIT);
    expect(resolveMediaSearchScanLimit("50")).toBe(50);
    expect(resolveMediaSearchScanLimit("7500")).toBe(7_500);
    expect(resolveMediaSearchScanLimit("99999")).toBe(MEDIA_SEARCH_MAX_SCAN_LIMIT);
    expect(resolveMediaSearchScanLimit("0")).toBe(MEDIA_SEARCH_SCAN_LIMIT);
    expect(resolveMediaSearchScanLimit("-5")).toBe(MEDIA_SEARCH_SCAN_LIMIT);
    expect(resolveMediaSearchScanLimit("abc")).toBe(MEDIA_SEARCH_SCAN_LIMIT);
  });
});
