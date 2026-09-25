/**
 * @file tests/unit/utils/point-read-payload.test.ts
 * @description Pins the HTTP point-read payload contract for
 * `GET /api/collections/:collection/:entryId`.
 *
 * The trim is the single source of truth shared by the warm read lane's MISS
 * rebuild, the dispatcher fallback (`handleCollectionEntry`) and the predictive
 * turbo stash — this suite is the regression guard for the BENCH_VERIFY_RAW=1
 * byte-identity gate and the payload-size win (~277 B of system columns).
 */

import { describe, expect, it } from "vitest";
import { trimPointReadEnvelope } from "@src/utils/point-read-payload";

const fullRow = (): {
  _id: string;
  status: string;
  tenantId: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  collection: string | null;
  locale: string | null;
  publishedAt: string | null;
  slug: string;
  title: string;
  content: string;
  count: number;
  _collection: { id: string; name: string; label: string };
} => ({
  _id: "20000000-0000-7000-8000-000000000001",
  status: "published",
  tenantId: "global",
  isDeleted: false,
  createdAt: "2026-09-24T08:00:00.000Z",
  updatedAt: "2026-09-24T09:00:00.000Z",
  collection: null,
  locale: null,
  publishedAt: null,
  slug: "probe-split-1",
  title: "Probe article",
  content: "Lorem ipsum",
  count: 10,
  _collection: { id: "BenchmarkStable", name: "BenchmarkStable", label: "BenchmarkStable" },
});

describe("trimPointReadEnvelope", () => {
  it("drops the SDK meta and platform system columns from a single row", () => {
    const trimmed = trimPointReadEnvelope({ success: true, data: fullRow() }) as {
      data: Record<string, unknown>;
    };
    const row = trimmed.data;
    // Dropped unconditionally — no HTTP point-read consumer reads these.
    expect("_collection" in row).toBe(false);
    expect("tenantId" in row).toBe(false);
    expect("isDeleted" in row).toBe(false);
    expect("createdAt" in row).toBe(false);
    expect("updatedAt" in row).toBe(false);
    // Null physical mirror columns are the column default — system noise.
    expect("collection" in row).toBe(false);
    expect("locale" in row).toBe(false);
    expect("publishedAt" in row).toBe(false);
    // Kept: identity, publication control, and every content field.
    expect(row._id).toBe("20000000-0000-7000-8000-000000000001");
    expect(row.status).toBe("published");
    expect(row.slug).toBe("probe-split-1");
    expect(row.title).toBe("Probe article");
    expect(row.content).toBe("Lorem ipsum");
    expect(row.count).toBe(10);
  });

  it("keeps non-null mirror columns — a value is document content, not noise", () => {
    const row = fullRow();
    row.collection = "posts";
    row.locale = "en";
    row.publishedAt = "2026-01-01T00:00:00.000Z";
    const trimmed = trimPointReadEnvelope({ success: true, data: row }) as {
      data: Record<string, unknown>;
    };
    expect(trimmed.data.collection).toBe("posts");
    expect(trimmed.data.locale).toBe("en");
    expect(trimmed.data.publishedAt).toBe("2026-01-01T00:00:00.000Z");
    // The always-dropped system keys still go, even when the doc carries them.
    expect("_collection" in trimmed.data).toBe(false);
    expect("tenantId" in trimmed.data).toBe(false);
  });

  it("never mutates the caller's row or envelope (SDK request cache / L2 safety)", () => {
    const env = { success: true, data: fullRow(), meta: { nextCursor: "x" } };
    trimPointReadEnvelope(env);
    expect("_collection" in (env.data as Record<string, unknown>)).toBe(true);
    expect("tenantId" in (env.data as Record<string, unknown>)).toBe(true);
    expect(env.meta).toEqual({ nextCursor: "x" });
  });

  it("preserves success and meta on the envelope", () => {
    const trimmed = trimPointReadEnvelope({
      success: true,
      data: fullRow(),
      meta: { hasMore: false },
    }) as { success: boolean; meta: { hasMore: boolean }; data: Record<string, unknown> };
    expect(trimmed.success).toBe(true);
    expect(trimmed.meta).toEqual({ hasMore: false });
    expect("_collection" in trimmed.data).toBe(false);
  });

  it("passes list payloads (arrays) through byte-identical — the trim is point-read only", () => {
    const rows = [fullRow(), fullRow()];
    const listEnvelope = { success: true, data: rows };
    const passed = trimPointReadEnvelope(listEnvelope);
    expect(passed).toBe(listEnvelope);
    // List rows still carry the SDK meta for LocalCMS-shaped consumers.
    expect("_collection" in rows[0]).toBe(true);
  });

  it("passes null rows, primitives, and non-envelopes through unchanged", () => {
    const nullEnvelope = { success: true, data: null };
    expect(trimPointReadEnvelope(nullEnvelope)).toBe(nullEnvelope);
    expect(trimPointReadEnvelope(null)).toBeNull();
    expect(trimPointReadEnvelope("nope")).toBe("nope");
    const failure = { success: false, message: "nope" };
    expect(trimPointReadEnvelope(failure)).toBe(failure);
  });
});
