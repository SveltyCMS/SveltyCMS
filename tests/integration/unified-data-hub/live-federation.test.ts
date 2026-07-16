/**
 * @file tests/integration/unified-data-hub/live-federation.test.ts
 * @description Live federation integration — CMS-agnostic, connector-specific fixture.
 *
 * **CMS DB (database-agnostic):** Runs on the full adapter matrix —
 * sqlite, mongodb, mariadb, postgresql (`INTEGRATION_DB_MATRIX` / CI db-tests job).
 * Plugin collections, connector records, and virtual schemas use `dbAdapter.crud` only.
 *
 * **External data source:** Postgres connector fixture only — Docker Postgres at
 * 127.0.0.1:5432 (`tests/docker-compose.yml --profile postgresql`). Skips gracefully
 * when the external fixture is unreachable (opt-in `--include-db-tasks`).
 */

import { beforeAll, describe, expect, it } from "vitest";
import { INTEGRATION_DB_MATRIX } from "@src/utils/test-db-credentials";
import { getApiBaseUrl, safeFetch } from "../helpers/server";
import { prepareAuthenticatedContext } from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();
const TEST_API_SECRET = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
const CMS_DB_TYPE = (process.env.DB_TYPE || "sqlite").toLowerCase();

let fixtureAvailable = false;
let adminCookie = "";
let skipReason = "";

async function seedHubFixture(rowCount = 100): Promise<boolean> {
  try {
    const res = await safeFetch(`${API_BASE_URL}/api/testing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-secret": TEST_API_SECRET,
        Origin: API_BASE_URL,
      },
      body: JSON.stringify({
        action: "seed-unified-data-hub",
        fixture: "postgres",
        rowCount,
      }),
    });

    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      skipReason = body.message || "External Postgres connector fixture unavailable";
      return false;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`seed-unified-data-hub failed: HTTP ${res.status} ${text}`);
    }

    const body = await res.json();
    return body.success === true;
  } catch (err) {
    skipReason = err instanceof Error ? err.message : String(err);
    return false;
  }
}

describe(`Unified Data Hub live federation (CMS: ${CMS_DB_TYPE})`, () => {
  it("participates in the 4-adapter CMS integration matrix", () => {
    expect(INTEGRATION_DB_MATRIX).toContain(
      CMS_DB_TYPE as "sqlite" | "mongodb" | "mariadb" | "postgresql",
    );
  });

  beforeAll(async () => {
    fixtureAvailable = await seedHubFixture(100);
    if (!fixtureAvailable) return;

    adminCookie = await prepareAuthenticatedContext({ skipReset: true });
  });

  it("lists virtual collection schema after hub seed", async () => {
    if (!fixtureAvailable) {
      console.log(`⏭️ Skipping live federation on CMS ${CMS_DB_TYPE}: ${skipReason}`);
      return;
    }

    const res = await safeFetch(`${API_BASE_URL}/api/virtual-collections`, {
      headers: { Cookie: adminCookie },
    });

    expect(res.ok).toBe(true);
    const body = await res.json();
    const schemas = body.data ?? [];
    const bench = schemas.find((s: { slug?: string }) => s.slug === "bench-articles");
    expect(bench).toBeTruthy();
  });

  it("reads 100 rows via virtual-collections HTTP API", async () => {
    if (!fixtureAvailable) return;

    const start = performance.now();
    const res = await safeFetch(
      `${API_BASE_URL}/api/virtual-collections/bench-articles?limit=100&bypassCache=true`,
      { headers: { Cookie: adminCookie } },
    );
    const elapsed = performance.now() - start;

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.data?.length).toBe(100);
    expect(body.meta?.connectorId).toBe("udh-test-connector");
    expect(body.data[0].title).toMatch(/Bench Article/);

    console.log(
      `📊 Live federation read (CMS ${CMS_DB_TYPE} → external Postgres): ${elapsed.toFixed(1)}ms`,
    );
  });

  it("GraphQL virtualCollection returns paginated federation result", async () => {
    if (!fixtureAvailable) return;

    const query = `
      query BenchArticles($slug: String!, $limit: Int) {
        virtualCollection(slug: $slug, limit: $limit) {
          total
          meta { connectorId staleness }
          data { payload }
        }
      }
    `;

    const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        query,
        variables: { slug: "bench-articles", limit: 5 },
      }),
    });

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.errors).toBeUndefined();
    const result = body.data?.virtualCollection;
    expect(result?.data?.length).toBe(5);
    expect(result?.meta?.connectorId).toBe("udh-test-connector");
    const first = JSON.parse(result.data[0].payload);
    expect(first.title).toMatch(/Bench Article/);
  });

  it("same-source join expands author relation via include param", async () => {
    if (!fixtureAvailable) return;

    const res = await safeFetch(
      `${API_BASE_URL}/api/virtual-collections/bench-articles?limit=5&include=author&bypassCache=true`,
      { headers: { Cookie: adminCookie } },
    );

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.meta?.included).toContain("author");
    expect(body.data?.length).toBeGreaterThan(0);
    const first = body.data[0];
    expect(first._relations?.author?.name).toMatch(/Bench Author/);
  });

  it("returns decomposition meta on virtual reads (v3 stable)", async () => {
    if (!fixtureAvailable) return;

    const res = await safeFetch(
      `${API_BASE_URL}/api/virtual-collections/bench-articles?limit=5&bypassCache=true`,
      { headers: { Cookie: adminCookie } },
    );

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.meta?.decomposition?.version).toBe("3.0-stable");
    expect(body.meta?.decomposition?.crossSource).toBe(false);
    expect(body.meta?.decomposition?.subExpressionCount).toBe(1);
  });

  it("supports per-source cursor pagination", async () => {
    if (!fixtureAvailable) return;

    const page1 = await safeFetch(
      `${API_BASE_URL}/api/virtual-collections/bench-articles?limit=10&bypassCache=true`,
      { headers: { Cookie: adminCookie } },
    );
    expect(page1.ok).toBe(true);
    const body1 = await page1.json();
    expect(body1.data?.length).toBe(10);
    expect(body1.meta?.nextCursor).toBeTruthy();

    const page2 = await safeFetch(
      `${API_BASE_URL}/api/virtual-collections/bench-articles?limit=10&cursor=${encodeURIComponent(body1.meta.nextCursor)}&bypassCache=true`,
      { headers: { Cookie: adminCookie } },
    );
    expect(page2.ok).toBe(true);
    const body2 = await page2.json();
    expect(body2.data?.length).toBe(10);
    expect(body2.meta?.cursorOffset).toBe(10);
    expect(body2.data[0].id).not.toBe(body1.data[0].id);
  });

  it("native stitch enrich returns keyed author rows by id", async () => {
    if (!fixtureAvailable) return;

    const res = await safeFetch(
      `${API_BASE_URL}/api/virtual-collections/bench-authors/enrich?keys=1,2,3&field=id&bypassCache=true`,
      { headers: { Cookie: adminCookie } },
    );

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.data?.["1"]?.name).toMatch(/Bench Author/);
    expect(body.meta?.keyCount).toBe(3);
    expect(body.meta?.matched).toBeGreaterThanOrEqual(1);
  });
});
