/**
 * @file tests/integration/routes/collection-page-load.test.ts
 * @description SSR contract for the collection admin route — list AND edit mode.
 *
 * Pins the reported URL `/<lang>/collection/<slug>?edit=<entryId>`: a server error
 * on this load rendered the admin "500 — System Error" boundary on every
 * navigation (the user-visible symptom), so the load is asserted end-to-end over
 * the real HTTP stack: collection fixture via /api/testing → entry via the
 * collections API → `/…/__data.json?edit=<id>` must return `type: "data"` with the
 * requested row, never `type: "error"`.
 *
 * Black-box (HTTP only) so it runs against the external preview server started by
 * `scripts/run-integration.ts`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTestDatabase,
  getApiBaseUrl,
  prepareAuthenticatedContext,
  safeFetch,
  testingAction,
  waitForServer,
} from "../helpers/server";

const API = getApiBaseUrl();
const COLLECTION = `editpage${Date.now().toString(36)}`;
const LANGUAGE = "en";

const SCHEMA = {
  _id: COLLECTION,
  name: "Edit Page Contract",
  // Explicit `/collection/…` path — matches the reported admin URL shape.
  path: `/collection/${COLLECTION}`,
  fields: [
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
    { db_fieldName: "body", label: "Body", widget: { Name: "Input" }, type: "string" },
  ],
};

interface DataJsonResponse {
  type?: string;
  location?: string;
}

/** Poll an async condition until it holds (bun's `expect` has no `.toPass`). */
async function waitFor(
  predicate: () => Promise<boolean>,
  label: string,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
      lastError = "condition false";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${label} did not become true within ${timeoutMs}ms (${lastError})`);
}

async function fetchDataJson(pathWithQuery: string, cookie: string) {
  const url = `${API}${pathWithQuery}${pathWithQuery.includes("?") ? "&" : "?"}x-sveltekit-invalidated=111`;
  const res = await safeFetch(url, {
    headers: { Accept: "application/json", Cookie: cookie },
  });
  const text = await res.text();
  let body: DataJsonResponse = {};
  try {
    body = JSON.parse(text) as DataJsonResponse;
  } catch {
    // SvelteKit may stream multiple JSON nodes; only the type discriminator matters here.
    if (text.includes('"type":"error"')) body.type = "error";
    else if (text.includes('"type":"data"')) body.type = "data";
    else if (text.includes('"type":"redirect"')) {
      body.type = "redirect";
      const loc = text.match(/"location"\s*:\s*"([^"]+)"/);
      if (loc) body.location = loc[1];
    }
  }
  return { res, text, body };
}

describe("Collection admin route SSR — list + edit load", () => {
  let cookie = "";
  let entryId = "";

  beforeAll(async () => {
    await waitForServer();
    cookie = await prepareAuthenticatedContext();
    expect(cookie.length).toBeGreaterThan(0);

    await testingAction("create-collection", { schema: SCHEMA });

    // Poll the collections API until the content registry serves the fixture.
    await waitFor(async () => {
      const res = await safeFetch(`${API}/api/collections/${COLLECTION}?limit=1`, {
        headers: { Cookie: cookie },
      });
      return res.ok;
    }, `collection ${COLLECTION} not ready`);

    const created = await safeFetch(`${API}/api/collections/${COLLECTION}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: API },
      body: JSON.stringify({ title: "Edit Page Entry", body: "seeded", status: "publish" }),
    });
    const createdBody = await created.json();
    const row = (createdBody.data ?? createdBody) as Record<string, unknown>;
    entryId = String(row._id ?? "");
    expect(entryId.length).toBeGreaterThan(0);
  }, 120_000);

  afterAll(async () => {
    if (entryId) {
      await safeFetch(`${API}/api/collections/${COLLECTION}/${entryId}`, {
        method: "DELETE",
        headers: { Cookie: cookie, Origin: API },
      }).catch(() => undefined);
    }
    await cleanupTestDatabase().catch(() => undefined);
  });

  it("serves the entry list for the canonical collection URL", async () => {
    const res = await safeFetch(`${API}/${LANGUAGE}/collection/${COLLECTION}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status, "list page HTTP status").toBe(200);
    const html = await res.text();
    expect(html).not.toMatch(/System Error/);
  });

  it("serves the edit load for ?edit=<entryId> without a server error", async () => {
    // HTML shell
    const htmlRes = await safeFetch(
      `${API}/${LANGUAGE}/collection/${COLLECTION}?edit=${encodeURIComponent(entryId)}`,
      { headers: { Cookie: cookie } },
    );
    expect(htmlRes.status, "edit page HTTP status").toBe(200);
    const html = await htmlRes.text();
    expect(html, "500 boundary must not render for a valid ?edit= URL").not.toMatch(
      /System Error|Internal Error/,
    );

    // SvelteKit data endpoint — must resolve to data (not an error node/redirect)
    const { res, text, body } = await fetchDataJson(
      `/${LANGUAGE}/collection/${COLLECTION}/__data.json?edit=${encodeURIComponent(entryId)}`,
      cookie,
    );
    expect(res.status).toBe(200);
    expect(body.type, `__data.json must not be an error node: ${text.slice(0, 300)}`).not.toBe(
      "error",
    );
    if (body.type === "redirect") {
      expect(body.location).not.toMatch(/\/login/i);
    }
    // The edit branch (`editEntryId`) must have loaded the requested row.
    expect(text).toContain(entryId);
  });

  it("keeps ?edit=<unknown-id> on the data path (no 500 for stale links)", async () => {
    const { body, text } = await fetchDataJson(
      `/${LANGUAGE}/collection/${COLLECTION}/__data.json?edit=deadbeefdeadbeefdeadbeefdeadbeef`,
      cookie,
    );
    expect(body.type, `stale edit id must not 500: ${text.slice(0, 300)}`).not.toBe("error");
  });
});
