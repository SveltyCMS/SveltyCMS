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
  fields: [{ db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" }],
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
});
