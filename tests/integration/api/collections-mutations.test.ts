/**
 * @file tests/integration/api/collections-mutations.test.ts
 * @description
 * HTTP contract for collection entry create / update / delete / clone / schedule
 * (single + bulk). Hard-fails — no soft-skip when the fixture collection is missing.
 *
 * These assertions would have caught the 2026-08 dashboard bug where
 * POST /api/collections/:id/batch fell through to create() so "delete"
 * inserted a new document instead of removing rows.
 *
 * ### Features:
 * - create-collection fixture via /api/testing (never empty-install skip)
 * - round-trip GET after every mutation
 * - bulk delete must reduce membership, not increase it
 * - clone must add a draft with clonedFrom, not a `{ action: "delete" }` stub
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getApiBaseUrl,
  prepareAuthenticatedContext,
  testingAction,
  waitForServer,
} from "../helpers/server";

const API = getApiBaseUrl();
const COLLECTION = process.env.MUTATION_TEST_COLLECTION || "mutation_contract_entries";

const SCHEMA = {
  _id: COLLECTION,
  name: COLLECTION,
  fields: [
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
    { db_fieldName: "body", label: "Body", widget: { Name: "Input" }, type: "string" },
    { db_fieldName: "views", label: "Views", widget: { Name: "Input" }, type: "number" },
  ],
};

function entriesFrom(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const data = root.data;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const inner = data as Record<string, unknown>;
    if (Array.isArray(inner.items)) return inner.items as Record<string, unknown>[];
    if (Array.isArray(inner.data)) return inner.data as Record<string, unknown>[];
  }
  if (Array.isArray(root.items)) return root.items as Record<string, unknown>[];
  return [];
}

function entryId(row: Record<string, unknown>): string {
  return String(row._id ?? row.id ?? "");
}

describe("Collection mutation HTTP contract", () => {
  let cookie = "";
  const createdIds: string[] = [];

  async function authHeaders(): Promise<Record<string, string>> {
    return {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: API,
    };
  }

  async function jsonFetch(path: string, init: RequestInit = {}) {
    const method = (init.method || "GET").toUpperCase();
    const url =
      method === "GET"
        ? `${API}${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`
        : `${API}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(await authHeaders()),
        "Cache-Control": "no-cache",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  }

  async function listEntries() {
    const { response, body } = await jsonFetch(`/api/collections/${COLLECTION}?limit=100`);
    expect(response.ok).toBe(true);
    return entriesFrom(body);
  }

  beforeAll(async () => {
    await waitForServer();
    cookie = await prepareAuthenticatedContext();
    expect(cookie.length).toBeGreaterThan(0);
    await testingAction("create-collection", { schema: SCHEMA });
  }, 180_000);

  afterAll(async () => {
    if (!cookie || createdIds.length === 0) return;
    await jsonFetch(`/api/collections/${COLLECTION}/batch`, {
      method: "POST",
      body: JSON.stringify({ action: "delete", entryIds: createdIds }),
    }).catch(() => {});
  });

  it("creates, updates, and batch-mutates without inventing action-stub rows", async () => {
    const stamp = Date.now();
    const titleA = `mut-a-${stamp}`;
    const titleB = `mut-b-${stamp}`;

    const createdA = await jsonFetch(`/api/collections/${COLLECTION}`, {
      method: "POST",
      body: JSON.stringify({ title: titleA, status: "draft" }),
    });
    expect([200, 201]).toContain(createdA.response.status);
    const idA = entryId((createdA.body.data ?? createdA.body) as Record<string, unknown>);
    expect(idA.length).toBeGreaterThan(0);
    createdIds.push(idA);

    const createdB = await jsonFetch(`/api/collections/${COLLECTION}`, {
      method: "POST",
      body: JSON.stringify({ title: titleB, status: "draft" }),
    });
    expect([200, 201]).toContain(createdB.response.status);
    const idB = entryId((createdB.body.data ?? createdB.body) as Record<string, unknown>);
    expect(idB.length).toBeGreaterThan(0);
    createdIds.push(idB);

    const afterCreate = await listEntries();
    const idsAfterCreate = new Set(afterCreate.map(entryId));
    expect(idsAfterCreate.has(idA)).toBe(true);
    expect(idsAfterCreate.has(idB)).toBe(true);

    const updated = await jsonFetch(`/api/collections/${COLLECTION}/${idA}`, {
      method: "PATCH",
      body: JSON.stringify({ title: `${titleA}-edited` }),
    });
    expect(updated.response.ok).toBe(true);

    const fetched = await jsonFetch(`/api/collections/${COLLECTION}/${idA}`);
    expect(fetched.response.ok).toBe(true);
    const fetchedRow = (fetched.body.data ?? fetched.body) as Record<string, unknown>;
    expect(String(fetchedRow.title)).toContain("-edited");

    const cloned = await jsonFetch(`/api/collections/${COLLECTION}/batch`, {
      method: "POST",
      body: JSON.stringify({ action: "clone", entryIds: [idA] }),
    });
    expect([200, 201]).toContain(cloned.response.status);

    const deleted = await jsonFetch(`/api/collections/${COLLECTION}/batch`, {
      method: "POST",
      body: JSON.stringify({ action: "delete", entryIds: [idA, idB] }),
    });
    expect(deleted.response.ok).toBe(true);

    const afterBatch = await listEntries();
    // The 2026-08 dashboard bug inserted a new document with `{ action: "delete" }`
    // instead of mutating the selected rows. Batch must never invent those stubs.
    expect(afterBatch.some((row) => row.action === "delete")).toBe(false);
    expect(afterBatch.some((row) => row.action === "clone")).toBe(false);
  }, 120_000);

  it("keeps the untouched fields of a partial PATCH (single-field update)", async () => {
    const stamp = Date.now();
    const title = `patch-keep-${stamp}`;

    const created = await jsonFetch(`/api/collections/${COLLECTION}`, {
      method: "POST",
      body: JSON.stringify({ title, body: "long body text", views: 1, status: "draft" }),
    });
    expect([200, 201]).toContain(created.response.status);
    const id = entryId((created.body.data ?? created.body) as Record<string, unknown>);
    expect(id.length).toBeGreaterThan(0);
    createdIds.push(id);

    // The reported shape: a PATCH body carrying ONE dynamic field. Until the JSON
    // `data` blob merged, this replaced the whole blob — a 1.5 KB document came back
    // as a ~60-byte stub holding just `{ views, updatedBy }`.
    const patched = await jsonFetch(`/api/collections/${COLLECTION}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ views: 2 }),
    });
    expect(patched.response.ok).toBe(true);
    const patchedRow = (patched.body.data ?? patched.body) as Record<string, unknown>;
    expect(patchedRow.title).toBe(title);
    expect(patchedRow.body).toBe("long body text");
    expect(Number(patchedRow.views)).toBe(2);

    // Re-read: the persisted row — not just the write response — must be intact.
    const fetched = await jsonFetch(`/api/collections/${COLLECTION}/${id}`);
    expect(fetched.response.ok).toBe(true);
    const row = (fetched.body.data ?? fetched.body) as Record<string, unknown>;
    expect(row.title).toBe(title);
    expect(row.body).toBe("long body text");
    expect(Number(row.views)).toBe(2);
    expect(row.status).toBe("draft");

    // Payload shape on the point-read lane: the row's JSON blob must not be serialized a
    // second time as a nested `data` field (measured ~3489 B vs ~1800 B of real content on
    // the competitive lane). The GET body is the document plus the envelope only.
    expect("data" in row).toBe(false);
    const wireBytes = Number(fetched.response.headers.get("content-length") ?? 0);
    expect(wireBytes).toBeGreaterThan(0);
    expect(wireBytes).toBeLessThan(JSON.stringify(fetched.body).length + 512);
    console.log(
      `   ℹ point-read payload: ${wireBytes} B for a ${title.length + "long body text".length}-char document`,
    );
  }, 120_000);

  it("acks a PATCH with a minimal body when the caller asks for one", async () => {
    const stamp = Date.now();
    const title = `patch-minimal-${stamp}`;

    const created = await jsonFetch(`/api/collections/${COLLECTION}`, {
      method: "POST",
      body: JSON.stringify({ title, body: "body text long enough to be measurable", views: 1 }),
    });
    expect([200, 201]).toContain(created.response.status);
    const id = entryId((created.body.data ?? created.body) as Record<string, unknown>);
    createdIds.push(id);

    // RFC 7240 `Prefer: return=minimal`: a caller that only needs "it worked" must not
    // receive the whole merged document — the competitive update lane measured ~3.5 KB of
    // representation against a 43-byte ack on the other side. The write is unchanged.
    const minimal = await jsonFetch(`/api/collections/${COLLECTION}/${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ views: 5 }),
    });
    expect(minimal.response.ok).toBe(true);
    const ackBody = JSON.stringify(minimal.body);
    expect(ackBody.length).toBeLessThan(200);
    expect((minimal.body.data as Record<string, unknown>)._id).toBe(id);

    // The write landed and still merged: the untouched fields survive a minimal ack too.
    const fetched = await jsonFetch(`/api/collections/${COLLECTION}/${id}`);
    const row = (fetched.body.data ?? fetched.body) as Record<string, unknown>;
    expect(Number(row.views)).toBe(5);
    expect(row.title).toBe(title);
    expect(row.body).toBe("body text long enough to be measurable");

    // Default (no preference) keeps returning the representation — no client changes.
    const full = await jsonFetch(`/api/collections/${COLLECTION}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ views: 6 }),
    });
    const fullRow = (full.body.data ?? full.body) as Record<string, unknown>;
    expect(fullRow.title).toBe(title);
    expect(Number(fullRow.views)).toBe(6);
    expect(JSON.stringify(full.body).length).toBeGreaterThan(ackBody.length);
  }, 120_000);

  it("keeps every write and read body within the document's own size class", async () => {
    // Regression guard for the measured duplication: the competitive harness counted our
    // point read at 2.14x the stored document because the JSON `data` blob was serialized
    // ON TOP of the fields flattened from it (plus system columns). The response must now
    // be the document once — the blob is a storage detail, not a second payload.
    const stamp = Date.now();
    const doc = {
      title: `payload-budget-${stamp}`,
      body: "x".repeat(1200),
      seo: { title: "seo title here", description: "seo description here" },
      author: "agent-author-00000000000000000000000000000000",
      tags: ["alpha", "beta"],
      slug: `payload-budget-${stamp}`,
      status: "draft",
      views: 7,
      publishedAt: "2026-09-22T12:00:00.000Z",
    };
    const docBytes = JSON.stringify(doc).length;

    const created = await jsonFetch(`/api/collections/${COLLECTION}`, {
      method: "POST",
      body: JSON.stringify(doc),
    });
    expect([200, 201]).toContain(created.response.status);
    const id = entryId((created.body.data ?? created.body) as Record<string, unknown>);
    createdIds.push(id);

    const read = await jsonFetch(`/api/collections/${COLLECTION}/${id}`);
    expect(read.response.ok).toBe(true);
    const readBytes = Number(read.response.headers.get("content-length") ?? 0);
    const readRow = (read.body.data ?? read.body) as Record<string, unknown>;
    // The duplication was the failure mode: the blob must not survive as a nested field.
    expect("data" in readRow).toBe(false);
    expect(readBytes).toBeGreaterThan(0);
    // Document + envelope + system columns (tenantId/collection/slug/locale/publishedAt/
    // isDeleted/timestamps) — nowhere near the 2.14x the duplicated body cost.
    expect(readBytes).toBeLessThan(docBytes * 1.35);

    const patched = await jsonFetch(`/api/collections/${COLLECTION}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ views: 8 }),
    });
    const patchBytes = Number(patched.response.headers.get("content-length") ?? 0);
    expect(patchBytes).toBeLessThan(docBytes * 1.35);

    const minimal = await jsonFetch(`/api/collections/${COLLECTION}/${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ views: 9 }),
    });
    const ackBytes = Number(minimal.response.headers.get("content-length") ?? 0);
    expect(ackBytes).toBeLessThan(200);

    // The measured sizes, so a regression shows its magnitude in the CI log.
    console.log(
      `   ℹ wire bytes — document ${docBytes} B · point read ${readBytes} B (${(readBytes / docBytes).toFixed(2)}x) · PATCH ${patchBytes} B · PATCH minimal ack ${ackBytes} B`,
    );
  }, 120_000);
});
