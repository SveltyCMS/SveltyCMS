/**
 * @file tests/unit/routes/well-known-route-failures.test.ts
 * @description Failure-path tests for the discovery routes served at the site
 * root: `/llms.txt`, `/sitemap.xml` and `/robots.txt`.
 *
 * The real handlers and `Response` objects are used. Only the database adapter
 * (unavailable) and the public-settings reader (throwing) are mocked, so the
 * assertions pin the documents' own failure handling rather than a stub.
 */

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getPublicSettingSync: vi.fn<(key: string) => unknown>(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: null,
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPublicSettingSync: (key: string) => h.getPublicSettingSync(key),
}));

import { GET as getLlms } from "../../../src/routes/llms.txt/+server";
import { GET as getRobots } from "../../../src/routes/robots.txt/+server";
import { GET as getSitemap } from "../../../src/routes/sitemap.xml/+server";

type RouteEvent = Parameters<typeof getLlms>[0];

const ORIGIN = "https://cms.example.com";

function makeEvent(path: string): RouteEvent {
  return {
    url: new URL(`${ORIGIN}${path}`),
    locals: {},
  } as unknown as RouteEvent;
}

describe("discovery routes without a database", () => {
  it("llms.txt returns a 500 when the adapter is unavailable", async () => {
    const response = await getLlms(makeEvent("/llms.txt"));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Database not initialized");
  });

  it("sitemap.xml returns a 500 when the adapter is unavailable", async () => {
    const response = await getSitemap(makeEvent("/sitemap.xml"));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Database not initialized");
  });
});

describe("robots.txt with a broken settings read", () => {
  it("rejects when the public setting cannot be read", async () => {
    h.getPublicSettingSync.mockImplementation(() => {
      throw new Error("settings unavailable");
    });

    await expect(getRobots(makeEvent("/robots.txt"))).rejects.toThrow("settings unavailable");
  });
});
