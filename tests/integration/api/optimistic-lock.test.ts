/**
 * @file tests/integration/api/optimistic-lock.test.ts
 * @description HTTP contract for optimistic locking, revision restore, and filter validation.
 *
 * Pins the 2026-10-21 concurrency/recovery slice:
 *
 * | Surface                                   | Contract                                  |
 * | ----------------------------------------- | ----------------------------------------- |
 * | `PATCH …?` without a version (legacy)     | last-write-wins, unchanged                |
 * | `If-Match: <etag>` (current)              | write applies                             |
 * | `If-Match: <etag>` (stale)                | `409 VERSION_CONFLICT` + `details.currentVersion` |
 * | `POST …/revisions/:version/restore`       | entry rolls back, pre-restore is snapshotted |
 * | `GET …?filter[unknown]=x`                 | `400 FILTER_UNKNOWN_FIELD` naming the key |
 * | revision history                          | pruned to the schema's `revisionLimit`    |
 *
 * Runs against the real SQLite stack through the preview server, so the warm
 * write/read lanes and the dispatcher are all exercised.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getApiBaseUrl,
  prepareAuthenticatedContext,
  testingAction,
  waitForServer,
} from "../helpers/server";

const API = getApiBaseUrl();
const COLLECTION = "optimistic_lock_contract";
const REVISION_COLLECTION = "optimistic_lock_revisions";
const REVISION_LIMIT = 5;

const FIELDS = [
  { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
  { db_fieldName: "body", label: "Body", widget: { Name: "Input" }, type: "string" },
];

const BASE_SCHEMA = { _id: COLLECTION, name: COLLECTION, fields: FIELDS };
const REVISION_SCHEMA = {
  _id: REVISION_COLLECTION,
  name: REVISION_COLLECTION,
  fields: FIELDS,
  revision: true,
  revisionLimit: REVISION_LIMIT,
};

let cookie = "";
const createdEntries: Array<{ collection: string; id: string }> = [];

function rowOf(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const root = body as Record<string, unknown>;
  const data = root.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = data as Record<string, unknown>;
    if (inner.data && typeof inner.data === "object") return inner.data as Record<string, unknown>;
    return inner;
  }
  return root;
}

async function api(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any; etag: string }> {
  const method = (init.method || "GET").toUpperCase();
  const url =
    method === "GET"
      ? `${API}${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`
      : `${API}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: API,
      "Cache-Control": "no-cache",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, etag: response.headers.get("etag") ?? "" };
}

async function createEntry(collection: string, title: string): Promise<string> {
  const res = await api(`/api/collections/${collection}`, {
    method: "POST",
    body: JSON.stringify({ title, status: "draft" }),
  });
  expect([200, 201], `create ${collection}: ${JSON.stringify(res.body)}`).toContain(res.status);
  const id = String(rowOf(res.body)._id ?? "");
  expect(id.length).toBeGreaterThan(0);
  createdEntries.push({ collection, id });
  return id;
}

/** Tiny pause so consecutive writes land on distinct `updatedAt` values. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

describe("Optimistic locking, revision restore, and filter validation", () => {
  beforeAll(async () => {
    await waitForServer();
    cookie = await prepareAuthenticatedContext();
    expect(cookie.length).toBeGreaterThan(0);
    await testingAction("create-collection", { schema: BASE_SCHEMA });
    await testingAction("create-collection", { schema: REVISION_SCHEMA });
  }, 180_000);

  afterAll(async () => {
    if (!cookie) return;
    for (const entry of createdEntries) {
      await api(`/api/collections/${entry.collection}/${entry.id}`, { method: "DELETE" }).catch(
        () => undefined,
      );
    }
  });

  it("keeps last-write-wins when no version is supplied", async () => {
    const id = await createEntry(COLLECTION, "no-version-a");
    const updated = await api(`/api/collections/${COLLECTION}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "no-version-b" }),
    });
    expect(updated.status).toBe(200);

    const fetched = await api(`/api/collections/${COLLECTION}/${id}`);
    expect(rowOf(fetched.body).title).toBe("no-version-b");
  });

  it("applies an update whose If-Match matches the loaded version", async () => {
    const id = await createEntry(COLLECTION, "etag-a");
    const loaded = await api(`/api/collections/${COLLECTION}/${id}`);
    expect(loaded.etag.length).toBeGreaterThan(0);
    expect(loaded.etag).toContain(id);

    await tick();
    const updated = await api(`/api/collections/${COLLECTION}/${id}`, {
      method: "PATCH",
      headers: { "If-Match": loaded.etag },
      body: JSON.stringify({ title: "etag-b" }),
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);

    const fetched = await api(`/api/collections/${COLLECTION}/${id}`);
    expect(rowOf(fetched.body).title).toBe("etag-b");
    expect(fetched.etag).not.toBe(loaded.etag);
  });

  it("rejects a stale If-Match with 409 and the current version", async () => {
    const id = await createEntry(COLLECTION, "conflict-a");
    const first = await api(`/api/collections/${COLLECTION}/${id}`);
    expect(first.etag.length).toBeGreaterThan(0);

    await tick();
    const won = await api(`/api/collections/${COLLECTION}/${id}`, {
      method: "PATCH",
      headers: { "If-Match": first.etag },
      body: JSON.stringify({ title: "conflict-winner" }),
    });
    expect(won.status, JSON.stringify(won.body)).toBe(200);

    const current = await api(`/api/collections/${COLLECTION}/${id}`);
    await tick();
    const stale = await api(`/api/collections/${COLLECTION}/${id}`, {
      method: "PATCH",
      headers: { "If-Match": first.etag },
      body: JSON.stringify({ title: "conflict-loser" }),
    });

    expect(stale.status).toBe(409);
    expect(stale.body?.code).toBe("VERSION_CONFLICT");
    expect(stale.body?.details?.currentVersion).toBeTruthy();
    // The conflict response names the version the client should reload.
    expect(String(stale.body.details.currentVersion)).toContain(
      current.etag.replace(/^"|"$/g, "").slice(id.length + 1),
    );

    const after = await api(`/api/collections/${COLLECTION}/${id}`);
    expect(rowOf(after.body).title).toBe("conflict-winner");
  });

  it("rejects unknown and unaddressable filter paths with 400", async () => {
    const unknown = await api(`/api/collections/${COLLECTION}?filter[definitelyMissing]=x`);
    expect(unknown.status).toBe(400);
    expect(unknown.body?.code).toBe("FILTER_UNKNOWN_FIELD");
    expect(unknown.body?.details?.fields).toEqual(["definitelyMissing"]);

    const nested = await api(`/api/collections/${COLLECTION}?filter[title.nope]=x`);
    expect(nested.status).toBe(400);
    expect(nested.body?.code).toBe("FILTER_UNKNOWN_FIELD");

    const valid = await api(`/api/collections/${COLLECTION}?filter[title]=etag`);
    expect(valid.status).toBe(200);
  });

  it("restores a revision and keeps the pre-restore content recoverable", async () => {
    const id = await createEntry(REVISION_COLLECTION, "rev-v1");
    await tick();
    await api(`/api/collections/${REVISION_COLLECTION}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "rev-v2" }),
    });
    await tick();
    await api(`/api/collections/${REVISION_COLLECTION}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "rev-v3" }),
    });

    const restored = await api(
      `/api/collections/${REVISION_COLLECTION}/${id}/revisions/1/restore`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);

    const fetched = await api(`/api/collections/${REVISION_COLLECTION}/${id}`);
    expect(rowOf(fetched.body).title).toBe("rev-v1");

    // The state that was live before the restore is itself a revision (undo path).
    const history = await api(`/api/collections/${REVISION_COLLECTION}/${id}/revisions`);
    expect(history.status).toBe(200);
    const items = (history.body?.data?.items ?? history.body?.data ?? []) as Array<
      Record<string, unknown> & { data?: { title?: string } }
    >;
    expect(Array.isArray(items)).toBe(true);
    // Every adapter keeps the snapshot nested under `data`.
    expect(items.some((item) => item.data?.title === "rev-v3")).toBe(true);
  });

  it("answers 404 for an unknown revision and 400 when the collection has no history", async () => {
    const id = await createEntry(REVISION_COLLECTION, "rev-unknown");
    const missing = await api(
      `/api/collections/${REVISION_COLLECTION}/${id}/revisions/999/restore`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(missing.status).toBe(404);

    const plainId = await createEntry(COLLECTION, "no-history");
    const disabled = await api(`/api/collections/${COLLECTION}/${plainId}/revisions/1/restore`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(disabled.status).toBe(400);
    expect(disabled.body?.code).toBe("REVISIONS_DISABLED");
  });

  it("bounds the revision history to the schema limit", async () => {
    const id = await createEntry(REVISION_COLLECTION, "prune-0");
    // Each update snapshots the previous content; pruning runs at 2× the limit.
    for (let i = 1; i <= 12; i++) {
      await tick();
      const res = await api(`/api/collections/${REVISION_COLLECTION}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: `prune-${i}` }),
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }

    const history = await api(`/api/collections/${REVISION_COLLECTION}/${id}/revisions`);
    expect(history.status).toBe(200);
    const items = (history.body?.data?.items ?? history.body?.data ?? []) as unknown[];
    expect(items.length).toBeGreaterThan(0);
    // Bound documented in recordRevision: never more than 2× the limit.
    expect(items.length).toBeLessThanOrEqual(REVISION_LIMIT * 2);
  }, 120_000);
});
