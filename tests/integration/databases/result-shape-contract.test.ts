/**
 * @file tests/integration/databases/result-shape-contract.test.ts
 * @description
 * Black-box contract that the affected-row *counts* a mutating HTTP operation
 * reports are real: `modifiedCount` / `deletedCount` must equal the rows the
 * statement actually touched, on every engine (sqlite, mariadb, postgresql,
 * mongodb). The adapter-level suites only assert `typeof count === "number"`,
 * so a driver-shape regression stays invisible at the HTTP boundary: Drizzle's
 * mysql2 session resolves to `[ResultSetHeader, fields]` and postgres.js to an
 * array subclass, and reading `.affectedRows` off either yielded `undefined` →
 * `0`. That made `crud.updateMany()` claim zero rows on MariaDB/PostgreSQL and
 * turned a successful compare-and-set into `409 VERSION_CONFLICT`.
 *
 * Every case seeds through `POST /api/testing` (fail-closed harness, never a
 * skip) and re-reads with `bypassCache=true`, so a count cannot be "right"
 * while the rows are untouched. There is no engine branching: an engine that
 * answers a different count fails here instead of being skipped.
 *
 * ### Pinned surface
 * | Route                                         | Count           | Expectation                                                    |
 * | :-------------------------------------------- | :-------------- | :------------------------------------------------------------- |
 * | `PATCH /api/collections/:c/bulk`              | `modifiedCount` | equals the rows changed (`crud.updateMany`)                    |
 * | `PATCH /api/collections/:c/bulk` (+ 1 ghost)  | `modifiedCount` | equals the rows that exist, never the payload length           |
 * | `POST /api/collections/:c/batch` (update)     | `modifiedCount` | equals the rows changed                                        |
 * | `POST /api/user/batch` (block)                | `modifiedCount` | equals the users blocked                                       |
 * | `DELETE /api/collections/:c/bulk`             | `deletedCount`  | exact, or the documented `-1` sentinel — never an invented one |
 *
 * ### Features:
 * - `POST /api/testing` fixture collection (never an empty-install skip)
 * - count asserted first, then each row re-read from the database
 * - `afterAll` removes the entries and users it created
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getApiBaseUrl,
  prepareAuthenticatedContext,
  safeFetch,
  testingAction,
  waitForServer,
} from "../helpers/server";

const API = getApiBaseUrl();
const COLLECTION = "result_shape_contract";

const SCHEMA = {
  _id: COLLECTION,
  name: COLLECTION,
  fields: [{ db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" }],
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

/** `data` of an API envelope when it is an object, else `null`. */
function payloadOf(body: unknown): JsonObject | null {
  return asObject(asObject(body)?.data);
}

function countField(body: unknown, key: string): number | undefined {
  const value = payloadOf(body)?.[key];
  return typeof value === "number" ? value : undefined;
}

function stringField(value: unknown, key: string): string | undefined {
  const field = asObject(value)?.[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

describe("Affected-count result shape contract", () => {
  let cookie = "";
  const entryIds: string[] = [];
  const userIds: string[] = [];

  async function apiFetch(path: string, init: RequestInit = {}) {
    const res = await safeFetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Origin: API,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { res, body };
  }

  async function createEntry(title: string): Promise<string> {
    const { res, body } = await apiFetch(`/api/collections/${COLLECTION}`, {
      method: "POST",
      body: JSON.stringify({ title, status: "draft" }),
    });
    expect(res.status).toBe(201);
    const id = stringField(payloadOf(body), "_id");
    if (!id) throw new Error(`create returned no _id: ${JSON.stringify(body).slice(0, 200)}`);
    entryIds.push(id);
    return id;
  }

  /** Point-read straight past the request/collection caches. */
  async function readEntry(id: string): Promise<JsonObject | null> {
    const { res, body } = await apiFetch(
      `/api/collections/${COLLECTION}/${id}?bypassCache=true&refresh=true&publicationFilter=all&_=${Date.now()}`,
    );
    expect(res.status).toBe(200);
    // A deleted entry answers `{ success: true, data: null }`, not a 404.
    return payloadOf(body);
  }

  async function bulkUpdate(
    ids: string[],
    data: JsonObject = { status: "published" },
  ): Promise<{ res: Response; body: unknown }> {
    return apiFetch(`/api/collections/${COLLECTION}/bulk`, {
      method: "PATCH",
      body: JSON.stringify(ids.map((id) => ({ id, data }))),
    });
  }

  beforeAll(async () => {
    await waitForServer();
    cookie = await prepareAuthenticatedContext();
    expect(cookie.length).toBeGreaterThan(0);
    await testingAction("create-collection", { schema: SCHEMA });
  }, 180_000);

  afterAll(async () => {
    if (!cookie) return;
    if (userIds.length > 0) {
      await apiFetch("/api/user/batch", {
        method: "POST",
        body: JSON.stringify({ ids: userIds, action: "delete" }),
      }).catch(() => {});
    }
    if (entryIds.length > 0) {
      await apiFetch(`/api/collections/${COLLECTION}/batch`, {
        method: "POST",
        body: JSON.stringify({ action: "delete", entryIds }),
      }).catch(() => {});
    }
  }, 60_000);

  it("bulk update reports the exact number of rows it changed", async () => {
    const stamp = Date.now();
    const titles = [0, 1, 2].map((index) => `shape-${stamp}-${index}`);
    const ids: string[] = [];
    for (const title of titles) ids.push(await createEntry(title));

    const { res, body } = await bulkUpdate(ids);
    expect(res.status).toBe(200);
    // The P0: on MariaDB/PostgreSQL this answered 0 after a successful UPDATE.
    expect(countField(body, "modifiedCount")).toBe(ids.length);

    for (let index = 0; index < ids.length; index++) {
      const row = await readEntry(ids[index]);
      expect(row?.status).toBe("published");
      expect(row?.title).toBe(titles[index]);
    }
  });

  it("bulk update counts the rows that exist, not the payload length", async () => {
    const stamp = Date.now();
    const first = await createEntry(`shape-exists-1-${stamp}`);
    const second = await createEntry(`shape-exists-2-${stamp}`);
    const ghost = `ghost-${stamp}`;

    const { res, body } = await bulkUpdate([first, second, ghost], { status: "published" });
    expect(res.status).toBe(200);
    expect(countField(body, "modifiedCount")).toBe(2);

    expect((await readEntry(first))?.status).toBe("published");
    expect((await readEntry(second))?.status).toBe("published");
    expect(await readEntry(ghost)).toBeNull();
  });

  it("the batch update route reports the same real count", async () => {
    const stamp = Date.now();
    const ids = [
      await createEntry(`shape-batch-1-${stamp}`),
      await createEntry(`shape-batch-2-${stamp}`),
    ];

    const { res, body } = await apiFetch(`/api/collections/${COLLECTION}/batch`, {
      method: "POST",
      body: JSON.stringify({
        action: "update",
        entryIds: ids,
        data: { status: "published" },
      }),
    });
    expect(res.status).toBe(200);
    expect(countField(body, "modifiedCount")).toBe(ids.length);

    for (const id of ids) {
      expect((await readEntry(id))?.status).toBe("published");
    }
  });

  it("user batch block reports the number of users it blocked", async () => {
    const stamp = Date.now();
    for (let index = 0; index < 2; index++) {
      const { res, body } = await apiFetch("/api/user/create-user", {
        method: "POST",
        body: JSON.stringify({
          email: `shape_${stamp}_${index}@test.com`,
          password: "Password123!",
          confirmPassword: "Password123!",
          username: `shape_${stamp}_${index}`,
          role: "editor",
        }),
      });
      expect(res.status).toBe(201);
      const id = stringField(payloadOf(body), "_id");
      if (!id)
        throw new Error(`create-user returned no _id: ${JSON.stringify(body).slice(0, 200)}`);
      userIds.push(id);
    }

    const { res, body } = await apiFetch("/api/user/batch", {
      method: "POST",
      body: JSON.stringify({ ids: userIds, action: "block" }),
    });
    expect(res.status).toBe(200);
    expect(countField(body, "modifiedCount")).toBe(userIds.length);

    // Re-read through the list endpoint (`/api/user/:id` has no GET lane): both
    // rows must now sit in the blocked set, so the count described real rows.
    const filter = encodeURIComponent(JSON.stringify({ blocked: true }));
    const { res: listRes, body: listBody } = await apiFetch(
      `/api/user?limit=100&filter=${filter}&_=${Date.now()}`,
    );
    expect(listRes.status).toBe(200);
    const rows = asObject(listBody)?.data;
    const blockedIds = new Set(
      (Array.isArray(rows) ? rows : []).map((row) => stringField(row, "_id")),
    );
    for (const id of userIds) expect(blockedIds.has(id)).toBe(true);
  });

  it("bulk delete never invents a count for rows it did not remove", async () => {
    const stamp = Date.now();
    const ids = [
      await createEntry(`shape-delete-1-${stamp}`),
      await createEntry(`shape-delete-2-${stamp}`),
    ];
    const ghost = `ghost-delete-${stamp}`;

    const { res, body } = await apiFetch(`/api/collections/${COLLECTION}/bulk`, {
      method: "DELETE",
      body: JSON.stringify({ entryIds: [...ids, ghost] }),
    });
    expect(res.status).toBe(200);

    // SQL engines answer the documented `-1` "driver did not report" sentinel for a
    // permanent delete; MongoDB answers the real count. Either is truthful — an
    // invented number (e.g. ids.length, which would include the ghost) is not.
    const deletedCount = countField(body, "deletedCount");
    expect([-1, ids.length]).toContain(deletedCount);

    for (const id of ids) {
      expect(await readEntry(id)).toBeNull();
    }
  });
});
