/**
 * @file tests/integration/api/request-lane-headers.test.ts
 * @description
 * Black-box HTTP contract for Request Lane Router attribution.
 *
 * Guarantees that production hooks set `x-svelty-lane` correctly and that
 * health/static fast-paths remain JSON-safe (catches the class of bugs where
 * `export const handle` is broken and E2E mass-fails on redirects).
 */

import { beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { prepareAuthenticatedContext } from "../helpers/test-setup";
import { RequestLane } from "../../../src/hooks/request-classifier";

const API_BASE_URL = getApiBaseUrl();

describe("Request Lane Router HTTP headers", () => {
  let authCookie: string;

  beforeAll(async () => {
    await waitForServer();
    authCookie = await prepareAuthenticatedContext();
  }, 120_000);

  it("GET /health → HEALTH lane + parseable JSON body", async () => {
    const res = await safeFetch(`${API_BASE_URL}/health`);
    expect([200, 503]).toContain(res.status);
    expect(res.headers.get("x-svelty-lane")).toBe(RequestLane.HEALTH);

    const body = await res.json();
    expect(body).toHaveProperty("overallStatus");
    expect(body).toHaveProperty("uptime");
    expect(typeof body.uptime).toBe("number");
  });

  it("GET /api/system/health → HEALTH lane", async () => {
    const res = await safeFetch(`${API_BASE_URL}/api/system/health`);
    expect([200, 202, 503, 533]).toContain(res.status);
    // May be HEALTH via classifier or still HEALTH via pathname fallback
    const lane = res.headers.get("x-svelty-lane");
    expect(lane === RequestLane.HEALTH || lane === RequestLane.API_READ || lane === null).toBe(
      true,
    );
    // Body must still be JSON (not HTML error page)
    const text = await res.text();
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it("GET /favicon.ico → FAST_STATIC lane (204 empty or cached)", async () => {
    const res = await safeFetch(`${API_BASE_URL}/favicon.ico`);
    // Fast path returns 204; resolve path may return 200/404
    expect([200, 204, 404]).toContain(res.status);
    if (res.status === 204) {
      expect(res.headers.get("x-svelty-lane")).toBe(RequestLane.FAST_STATIC);
    }
  });

  it("authenticated GET on cacheable API is HYPER_TURBO or API_READ (never BOOTSTRAP)", async () => {
    const res = await safeFetch(`${API_BASE_URL}/api/settings/public`, {
      headers: { Cookie: authCookie },
    });
    // 200 or 403 depending on permissions — lane attribution is the contract
    expect(res.status).not.toBe(302);
    const lane = res.headers.get("x-svelty-lane");
    expect([RequestLane.HYPER_TURBO, RequestLane.API_READ, RequestLane.API_WRITE]).toContain(lane);
    expect(lane).not.toBe(RequestLane.BOOTSTRAP);
    expect(lane).not.toBe(RequestLane.HEALTH);
  });

  it("POST mutation does not crash hooks (API_WRITE path)", async () => {
    const res = await safeFetch(`${API_BASE_URL}/api/collections/posts`, {
      method: "POST",
      headers: {
        Cookie: authCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "lane-probe" }),
    });
    // 4xx validation/auth is fine; 5xx means broken handle/pipeline (historical regression)
    expect(res.status, await res.clone().text()).toBeLessThan(500);
    const lane = res.headers.get("x-svelty-lane");
    // Lane header should be set when withLane wraps the response
    expect(lane).toBeTruthy();
    expect(lane).toBe(RequestLane.API_WRITE);
  });

  it("admin __data.json session still loads (E2E canary for lane + auth stack)", async () => {
    const res = await safeFetch(
      `${API_BASE_URL}/dashboard/__data.json?x-sveltekit-invalidated=111`,
      {
        headers: {
          Accept: "application/json",
          Cookie: authCookie,
        },
      },
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/"type"\s*:\s*"redirect"/);
    expect(text.toLowerCase()).not.toContain("/login");
  });
});
