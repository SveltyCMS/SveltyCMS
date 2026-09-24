/**
 * @file tests/integration/api/collections-keyset-cursor.test.ts
 * @description HTTP contract for the REST keyset cursor (W2 — deep-offset cliff).
 *
 * Offset pagination degrades linearly with depth (seq scan + skip); the keyset
 * cursor is the deep-pagination path. The adapter-level contract lives in
 * find-page-count-contract.test.ts — this file pins the REST surface:
 * `GET /api/collections/:id?cursor=…` must walk every row exactly once over
 * duplicate sort values, emit `meta.nextCursor` while pages remain, and stop
 * with `hasMore: false`.
 *
 * ### Features:
 * - create-collection fixture via /api/testing (never empty-install skip)
 * - tie-group seed (repeating `count` values) — the case where an
 *   ordering/cursor mismatch silently repeats or skips page N
 * - asc + desc walks, no overlap, no skip, page size respected
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getApiBaseUrl,
  prepareAuthenticatedContext,
  testingAction,
  waitForServer,
} from "../helpers/server";

const API = getApiBaseUrl();
const COLLECTION = process.env.KEYSET_TEST_COLLECTION || "keyset_cursor_contract";

const SCHEMA = {
  _id: COLLECTION,
  name: COLLECTION,
  fields: [
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
    { db_fieldName: "count", label: "Count", widget: { Name: "Input" }, type: "number" },
  ],
};

const SEED_ROWS = 14;
/** Repeating count values create large tie groups for the _id tiebreaker. */
const TIE_CYCLE = [10, 20, 30, 20];

describe("REST keyset cursor HTTP contract", () => {
  let cookie = "";
  const createdIds: string[] = [];

  async function authHeaders(): Promise<Record<string, string>> {
    return { "Content-Type": "application/json", Cookie: cookie, Origin: API };
  }

  beforeAll(async () => {
    await waitForServer();
    cookie = await prepareAuthenticatedContext();
    expect(cookie.length).toBeGreaterThan(0);
    await testingAction("create-collection", { schema: SCHEMA });
    for (let i = 0; i < SEED_ROWS; i++) {
      const res = await fetch(`${API}/api/collections/${COLLECTION}`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          title: `keyset-${i}`,
          count: TIE_CYCLE[i % TIE_CYCLE.length],
          status: "published",
        }),
      });
      expect([200, 201]).toContain(res.status);
      const body = await res.json();
      const id = String(body?.data?._id ?? "");
      expect(id.length).toBeGreaterThan(0);
      createdIds.push(id);
    }
  }, 180_000);

  afterAll(async () => {
    if (!cookie || createdIds.length === 0) return;
    await fetch(`${API}/api/collections/${COLLECTION}/batch`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ action: "delete", entryIds: createdIds }),
    }).catch(() => {});
  });

  async function walk(
    direction: "asc" | "desc",
    limit: number,
  ): Promise<{ seen: string[]; pages: number }> {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (; pages < 20; pages++) {
      const qs = new URLSearchParams({
        sortField: "count",
        sortDirection: direction,
        limit: String(limit),
        _: String(Date.now()),
      });
      // First page opts into keyset mode; continuation pages carry the cursor.
      if (cursor) qs.set("cursor", cursor);
      else qs.set("keyset", "true");
      const res = await fetch(`${API}/api/collections/${COLLECTION}?${qs}`, {
        headers: await authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      const rows: { _id?: unknown; count?: unknown }[] = Array.isArray(body?.data) ? body.data : [];
      const meta = (body?.meta ?? {}) as { hasMore?: boolean; nextCursor?: string };
      expect(rows.length).toBeLessThanOrEqual(limit);
      seen.push(...rows.map((r) => String(r._id)));
      if (meta.hasMore === false || rows.length < limit) {
        expect(meta.hasMore).toBe(false);
        expect(meta.nextCursor).toBeUndefined();
        break;
      }
      expect(typeof meta.nextCursor).toBe("string");
      expect(meta.nextCursor!.length).toBeGreaterThan(0);
      cursor = meta.nextCursor;
    }
    return { seen, pages };
  }

  it("walks every row exactly once over duplicate sort values (asc)", async () => {
    const { seen, pages } = await walk("asc", 4);
    expect(pages).toBeGreaterThan(1);
    expect(seen.length).toBe(SEED_ROWS);
    expect(new Set(seen).size).toBe(SEED_ROWS); // no overlap, no skip
  });

  it("walks every row exactly once over duplicate sort values (desc)", async () => {
    const { seen, pages } = await walk("desc", 3);
    expect(pages).toBeGreaterThan(1);
    expect(seen.length).toBe(SEED_ROWS);
    expect(new Set(seen).size).toBe(SEED_ROWS);
  });

  it("sorts by the cursor field while paging (page order is deterministic)", async () => {
    // Spot-check one walk: values must be non-decreasing (asc) per page.
    const values: number[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const qs = new URLSearchParams({
        sortField: "count",
        sortDirection: "asc",
        limit: "5",
        _: String(Date.now()),
      });
      if (cursor) qs.set("cursor", cursor);
      else qs.set("keyset", "true");
      const res = await fetch(`${API}/api/collections/${COLLECTION}?${qs}`, {
        headers: await authHeaders(),
      });
      const body = await res.json();
      const rows: { count?: unknown }[] = Array.isArray(body?.data) ? body.data : [];
      for (const r of rows) values.push(Number(r.count ?? NaN));
      const meta = (body?.meta ?? {}) as { hasMore?: boolean; nextCursor?: string };
      if (meta.hasMore === false) break;
      if (typeof meta.nextCursor !== "string") break;
      cursor = meta.nextCursor;
    }
    expect(values.length).toBe(SEED_ROWS);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });
});
