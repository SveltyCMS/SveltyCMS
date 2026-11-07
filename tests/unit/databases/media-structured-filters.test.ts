/**
 * @file tests/unit/databases/media-structured-filters.test.ts
 * @description Advanced-search filters pushed into the media adapters.
 *
 * Milestone C: the quick search was already server-side, but the modal's size /
 * dimension / MIME criteria filtered the loaded 100-item page in memory, so a
 * match on page 2 was invisible. These tests pin:
 *
 * 1. the Mongo filter shape (`$in`, numeric `$gte`/`$lte`, nested metadata paths);
 * 2. the SQL condition builder per dialect (JSON extract when no physical column);
 * 3. the SQLite adapter end-to-end — filters narrow the rows AND the COUNT, and a
 *    row that only exists on page 2 is found from page 1 once a filter applies.
 *
 * The SQLite section uses the real adapter (`:memory:`), not a mock, so the
 * Drizzle/JSON1 path is exercised exactly as the gallery loader calls it.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import type {
  DatabaseId,
  DatabaseResult,
  EntityCreate,
  MediaItem,
  MediaQueryOptions,
  PaginatedResult,
} from "@src/databases/db-interface";
import {
  buildMediaStructuredMongoFilter,
  buildMediaStructuredSqlConditions,
} from "@src/databases/core/relational-media";

const TENANT = "tenant-media-filter" as DatabaseId;
const OWNER = "filter-test-owner" as DatabaseId;

describe("buildMediaStructuredMongoFilter", () => {
  it("uses $in for MIME and numeric bounds for size and nested dimensions", () => {
    expect(
      buildMediaStructuredMongoFilter({
        mimeTypes: ["image/png", "image/jpeg"],
        minSize: 100,
        maxSize: 200,
        minWidth: 50,
        maxWidth: 500,
        minHeight: 10,
      }),
    ).toEqual({
      mimeType: { $in: ["image/png", "image/jpeg"] },
      size: { $gte: 100, $lte: 200 },
      "metadata.width": { $gte: 50, $lte: 500 },
      "metadata.height": { $gte: 10 },
    });
  });

  it("returns null when no structured filter is set", () => {
    expect(buildMediaStructuredMongoFilter({})).toBeNull();
    expect(buildMediaStructuredMongoFilter({ mimeTypes: [] })).toBeNull();
  });
});

describe("buildMediaStructuredSqlConditions", () => {
  it("extracts width/height from metadata when no physical column exists", () => {
    // The current media_items schema has no width/height columns on any engine.
    for (const dialect of ["sqlite", "postgresql", "mariadb", "mysql"] as const) {
      const conditions = buildMediaStructuredSqlConditions(
        dialect,
        {},
        { minWidth: 800, maxHeight: 1080 },
      );
      expect(conditions, dialect).toHaveLength(2);
    }
  });

  it("returns no condition for an empty filter bag", () => {
    expect(buildMediaStructuredSqlConditions("sqlite", {}, {})).toEqual([]);
  });
});

describe("media.files.getByFolder — structured filters (SQLite)", () => {
  let adapter: SQLiteAdapter;

  const FILTER_ROWS = 100;
  const NEEDLE = "needle.jpg";
  const DOCUMENT = "zzz-report.pdf";

  interface SeedRow {
    filename: string;
    height?: number;
    mimeType: string;
    size: number;
    width?: number;
  }

  function toEntity(row: SeedRow): EntityCreate<MediaItem> {
    return {
      access: "public",
      createdBy: OWNER,
      filename: row.filename,
      folderId: null,
      hash: `hash-${row.filename}`,
      metadata:
        row.width !== undefined && row.height !== undefined
          ? { width: row.width, height: row.height }
          : {},
      mimeType: row.mimeType,
      originalFilename: row.filename,
      path: `global/${row.filename}`,
      size: row.size,
      tenantId: TENANT,
      thumbnails: {},
      updatedBy: OWNER,
    } as unknown as EntityCreate<MediaItem>;
  }

  async function list(options: MediaQueryOptions) {
    const result: DatabaseResult<PaginatedResult<MediaItem>> =
      await adapter.media.files.getByFolder(undefined, options);
    // Narrow the union explicitly: an `expect()` cannot narrow for TypeScript.
    if (!result.success) {
      throw new Error(`getByFolder failed: ${result.message}`);
    }
    return {
      names: result.data.items.map((item) => item.filename),
      page: result.data.page,
      total: result.data.total,
      hasNextPage: result.data.hasNextPage,
    };
  }

  /** Default listing order — filters must not depend on the caller's sort. */
  const BASE = {
    page: 1,
    pageSize: 100,
    sortDirection: "asc" as const,
    sortField: "filename",
    tenantId: TENANT,
  };

  beforeAll(async () => {
    adapter = new SQLiteAdapter();
    const connection = await adapter.connect(":memory:");
    expect(connection.success).toBe(true);
    await (adapter as unknown as { provision: () => Promise<void> }).provision();

    const rows: SeedRow[] = [];
    for (let index = 0; index < FILTER_ROWS; index++) {
      rows.push({
        filename: `filler-${String(index).padStart(3, "0")}.png`,
        height: 100,
        mimeType: "image/png",
        size: 1_000 + index,
        width: 100,
      });
    }
    // Sorts after every filler → lives on server page 2 of the unfiltered list.
    rows.push({
      filename: NEEDLE,
      height: 3_000,
      mimeType: "image/jpeg",
      size: 9_000_000,
      width: 4_000,
    });
    // No dimensions in metadata — must never match a pixel bound.
    rows.push({ filename: DOCUMENT, mimeType: "application/pdf", size: 300 });

    const uploaded = await adapter.media.files.uploadMany(rows.map(toEntity), { tenantId: TENANT });
    expect(uploaded.success, JSON.stringify(uploaded).slice(0, 300)).toBe(true);
    expect(uploaded.data).toHaveLength(FILTER_ROWS + 2);
  }, 60_000);

  afterAll(async () => {
    await adapter.disconnect();
  });

  it("serves the needle only on page 2 without a filter", async () => {
    const firstPage = await list(BASE);

    expect(firstPage.names).toHaveLength(FILTER_ROWS);
    expect(firstPage.names).not.toContain(NEEDLE);
    expect(firstPage.page).toBe(1);
    expect(firstPage.hasNextPage).toBe(true);
    expect(firstPage.total).toBe(FILTER_ROWS + 2);
  });

  it("finds a page-2 asset by size from page 1, COUNT included", async () => {
    const filtered = await list({ ...BASE, minSize: 1_000_000 });

    expect(filtered.page).toBe(1);
    expect(filtered.names).toEqual([NEEDLE]);
    // The COUNT runs the same WHERE clause as the page query.
    expect(filtered.total).toBe(1);
    expect(filtered.hasNextPage).toBe(false);
  });

  it("filters by exact MIME type", async () => {
    const images = await list({ ...BASE, mimeTypes: ["image/jpeg"] });
    expect(images.names).toEqual([NEEDLE]);
    expect(images.total).toBe(1);

    const documents = await list({ ...BASE, mimeTypes: ["application/pdf"] });
    expect(documents.names).toEqual([DOCUMENT]);
    expect(documents.total).toBe(1);

    // Unknown MIME → empty result, not the whole folder.
    const missing = await list({ ...BASE, mimeTypes: ["image/avif"] });
    expect(missing.names).toEqual([]);
    expect(missing.total).toBe(0);
  });

  it("applies inclusive size bounds and excludes the outsized row", async () => {
    const small = await list({ ...BASE, maxSize: 1_200 });
    // 100 fillers (1000..1099 bytes) + the 300-byte document; the 9 MB needle is out.
    expect(small.total).toBe(FILTER_ROWS + 1);
    expect(small.names).not.toContain(NEEDLE);

    const bounded = await list({ ...BASE, minSize: 1_050, maxSize: 1_099 });
    // Inclusive on both ends: filler sizes 1000..1099 → indexes 50..99.
    expect(bounded.total).toBe(50);
    expect(bounded.names[0]).toBe("filler-050.png");
    expect(bounded.names.at(-1)).toBe("filler-099.png");
  });

  it("filters on metadata width/height and skips assets without dimensions", async () => {
    const wide = await list({ ...BASE, minWidth: 2_000 });
    expect(wide.names).toEqual([NEEDLE]);
    expect(wide.total).toBe(1);

    // The document has no metadata.width: a max bound must not match it.
    const narrow = await list({ ...BASE, maxWidth: 500 });
    expect(narrow.total).toBe(FILTER_ROWS);
    expect(narrow.names).not.toContain(DOCUMENT);

    const tall = await list({ ...BASE, minHeight: 2_000, maxHeight: 4_000 });
    expect(tall.names).toEqual([NEEDLE]);
  });

  it("combines MIME, size and dimension bounds", async () => {
    const combined = await list({
      ...BASE,
      mimeTypes: ["image/png"],
      minSize: 1_050,
      minWidth: 50,
      maxWidth: 200,
    });

    expect(combined.total).toBe(50);
    expect(combined.names).toContain("filler-050.png");
    expect(combined.names).not.toContain(NEEDLE);
    expect(combined.names).not.toContain(DOCUMENT);
  });

  it("re-validates adapter options instead of trusting a raw options bag", async () => {
    // A direct database caller (LocalCMS / a plugin) can bypass the URL parser;
    // non-finite numbers must still not reach the query builder.
    const invalid = await list({
      ...BASE,
      minSize: Number.NaN,
      maxWidth: -10,
    });

    expect(invalid.total).toBe(FILTER_ROWS + 2);
    expect(invalid.names).toHaveLength(FILTER_ROWS);
  });
});
