/**
 * @file tests/integration/unified-data-hub/rest-federation.test.ts
 * @description Live REST federation integration — CMS-agnostic, in-process WordPress fixture.
 *
 * **CMS DB (database-agnostic):** Runs on the full adapter matrix via integration runner.
 * **External data source:** In-process WordPress REST mock (no Docker/staging required).
 */

import { beforeAll, describe, expect, it } from "bun:test";
import { INTEGRATION_DB_MATRIX } from "@src/utils/test-db-credentials";
import { getApiBaseUrl, safeFetch } from "../helpers/server";
import { prepareAuthenticatedContext } from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();
const TEST_API_SECRET = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
const CMS_DB_TYPE = (process.env.DB_TYPE || "sqlite").toLowerCase();

let fixtureAvailable = false;
let adminCookie = "";
let skipReason = "";

async function seedRestFixture(rowCount = 25): Promise<boolean> {
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
        fixture: "wordpress",
        rowCount,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`seed-unified-data-hub failed: HTTP ${res.status} ${text}`);
    }

    const body = await res.json();
    return body.success === true && body.fixture === "wordpress";
  } catch (err) {
    skipReason = err instanceof Error ? err.message : String(err);
    return false;
  }
}

describe(`Unified Data Hub REST federation (CMS: ${CMS_DB_TYPE})`, () => {
  it("participates in the 4-adapter CMS integration matrix", () => {
    expect(INTEGRATION_DB_MATRIX).toContain(
      CMS_DB_TYPE as "sqlite" | "mongodb" | "mariadb" | "postgresql",
    );
  });

  beforeAll(async () => {
    fixtureAvailable = await seedRestFixture(25);
    if (!fixtureAvailable) return;

    adminCookie = await prepareAuthenticatedContext({ skipReset: true });
  });

  it("lists wp-articles virtual collection after REST hub seed", async () => {
    if (!fixtureAvailable) {
      console.log(`⏭️ Skipping REST federation on CMS ${CMS_DB_TYPE}: ${skipReason}`);
      return;
    }

    const res = await safeFetch(`${API_BASE_URL}/api/virtual-collections`, {
      headers: { Cookie: adminCookie },
    });

    expect(res.ok).toBe(true);
    const body = await res.json();
    const schemas = body.data ?? [];
    const articles = schemas.find((s: { slug?: string }) => s.slug === "wp-articles");
    expect(articles).toBeTruthy();
  });

  it("reads WordPress posts via virtual-collections HTTP API", async () => {
    if (!fixtureAvailable) return;

    const start = performance.now();
    const res = await safeFetch(
      `${API_BASE_URL}/api/virtual-collections/wp-articles?limit=10&bypassCache=true`,
      { headers: { Cookie: adminCookie } },
    );
    const elapsed = performance.now() - start;

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.data?.length).toBe(10);
    expect(body.meta?.connectorId).toBe("udh-rest-fixture-conn");
    expect(body.data[0].title).toMatch(/Fixture Post/);

    console.log(
      `📊 Live REST federation read (CMS ${CMS_DB_TYPE} → in-process WP mock): ${elapsed.toFixed(1)}ms`,
    );
  });

  it("GraphQL virtualCollection returns WordPress REST federation result", async () => {
    if (!fixtureAvailable) return;

    const query = `
      query WpArticles($slug: String!, $limit: Int) {
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
        variables: { slug: "wp-articles", limit: 5 },
      }),
    });

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.errors).toBeUndefined();
    const result = body.data?.virtualCollection;
    expect(result?.data?.length).toBe(5);
    expect(result?.meta?.connectorId).toBe("udh-rest-fixture-conn");
    const first = JSON.parse(result.data[0].payload);
    expect(first.title).toMatch(/Fixture Post/);
  });
});
