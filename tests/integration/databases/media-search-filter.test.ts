/**
 * @file tests/integration/databases/media-search-filter.test.ts
 * @description Multi-engine proof for the pushed media-search predicates.
 *
 * `criteriaToQueryFilter()` keeps only criteria that are exactly representable
 * as database filters. This suite inserts a small media fixture and executes
 * the generated filter through the real adapter on whichever engine `DB_TYPE`
 * selects (sqlite / postgresql / mariadb), so the pushdown is not just a shape
 * assertion.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { generateUUID } from "@utils/native-utils";
import { criteriaToQueryFilter } from "@src/utils/media/media-query-filters";

const ENGINE = (process.env.DB_TYPE ?? "sqlite").toLowerCase();
// Unique per run: the fixture can never collide with, or clean up, another
// tenant's media — including a developer's live rows if the harness is bypassed.
const TENANT = `mediasearch-${generateUUID().slice(0, 8)}`;

let db: any = null;

interface FixtureRow {
  _id: string;
  filename: string;
  originalFilename: string;
  hash: string;
  path: string;
  size: number;
  mimeType: string;
  createdBy: string;
  updatedBy: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

function row(filename: string, mimeType: string, size: number, createdAt: string): FixtureRow {
  return {
    _id: generateUUID(),
    filename,
    originalFilename: filename,
    hash: generateUUID().replace(/-/g, ""),
    path: `originals/${filename}`,
    size,
    mimeType,
    createdBy: "user-1",
    updatedBy: "user-1",
    tenantId: TENANT,
    createdAt,
    updatedAt: createdAt,
  };
}

const ROWS: FixtureRow[] = [
  row("Annual-Report.pdf", "application/pdf", 2048, "2026-01-10T10:00:00.000Z"),
  row("logo.PNG", "image/png", 512, "2026-06-10T10:00:00.000Z"),
  row("photo.jpg", "image/jpeg", 4096, "2026-11-10T10:00:00.000Z"),
  row("notes.txt", "text/plain", 128, "2025-12-01T10:00:00.000Z"),
];

async function namesFor(criteria: Parameters<typeof criteriaToQueryFilter>[0]): Promise<string[]> {
  const filter = criteriaToQueryFilter(criteria);
  const result = await db.crud.findMany("media", filter, { tenantId: TENANT, limit: 50 });
  if (!result.success) throw new Error(`findMany failed: ${result.message}`);
  return (result.data as FixtureRow[]).map((item) => item.filename).sort();
}

describe(`Media search pushdown — ${ENGINE}`, () => {
  beforeAll(async () => {
    await ensureFullInitialization();
    db = getDb();
    if (!db) throw new Error("Database not initialized");

    const inserted = await db.crud.insertMany("media", ROWS, { tenantId: TENANT });
    if (!inserted.success) throw new Error(`media fixture insert failed: ${inserted.message}`);
  }, 120_000);

  afterAll(async () => {
    // Scoped to this run's tenant — never a library-wide wipe.
    await db?.crud.deleteMany("media", {}, { tenantId: TENANT }).catch(() => {});
  });

  it("matches a filename case-insensitively", async () => {
    expect(await namesFor({ filename: "report" })).toEqual(["Annual-Report.pdf"]);
  });

  it("matches a MIME membership list", async () => {
    expect(await namesFor({ fileTypes: ["image/png"] })).toEqual(["logo.PNG"]);
  });

  it("matches a size floor", async () => {
    expect(await namesFor({ minSize: 2000 })).toEqual(["Annual-Report.pdf", "photo.jpg"]);
  });

  it("matches an upload date floor", async () => {
    expect(await namesFor({ uploadedAfter: new Date("2026-01-01T00:00:00.000Z") })).toEqual([
      "Annual-Report.pdf",
      "logo.PNG",
      "photo.jpg",
    ]);
  });

  it("combines pushed predicates", async () => {
    expect(await namesFor({ fileTypes: ["image/jpeg"], minSize: 4000 })).toEqual(["photo.jpg"]);
  });

  it("leaves non-ASCII terms to the in-memory pass (empty filter)", () => {
    expect(criteriaToQueryFilter({ filename: "Über" })).not.toHaveProperty("filename");
  });
});
