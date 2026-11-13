/**
 * @file tests/unit/scripts/scan-osv.test.ts
 * @description Unit tests for the OSV global-database check: query batching,
 * response validation/parsing, bounded retries, and the CI fail-closed policy.
 * `fetch` is injected — no network in unit runs.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  OSV_RETRY_DELAYS_MS,
  buildQueries,
  fetchOsvBatch,
  isOsvResponse,
  parseOsvResponse,
  shouldFailClosed,
  type OsvResult,
} from "../../../scripts/security/scan-osv";

const QUERY = [{ package: { purl: "pkg:npm/a@1.0.0" } }];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildQueries", () => {
  it("batches purls into groups of 1000", () => {
    const purls = Array.from({ length: 2500 }, (_, i) => `pkg:npm/pkg${i}@1.0.0`);
    const batches = buildQueries(purls);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(1000);
    expect(batches[1]).toHaveLength(1000);
    expect(batches[2]).toHaveLength(500);
    expect(batches[0][0]).toEqual({ package: { purl: "pkg:npm/pkg0@1.0.0" } });
  });
});

describe("isOsvResponse", () => {
  it("accepts only an object with a results array", () => {
    expect(isOsvResponse({ results: [] })).toBe(true);
    expect(isOsvResponse({ results: [{}] })).toBe(true);
    expect(isOsvResponse({ results: "nope" })).toBe(false);
    expect(isOsvResponse({ error: "rate limited" })).toBe(false);
    expect(isOsvResponse(null)).toBe(false);
    expect(isOsvResponse("<html>maintenance</html>")).toBe(false);
  });
});

describe("parseOsvResponse", () => {
  it("maps vulnerabilities back to their purls", () => {
    const purls = ["pkg:npm/a@1.0.0", "pkg:npm/b@1.0.0"];
    const body = {
      results: [
        {
          vulns: [
            { id: "GHSA-aaaa", summary: "XSS in a" },
            { id: "CVE-2026-0001", summary: "CSRF in a" },
          ],
        },
        { vulns: [] },
      ],
    };
    const results: OsvResult[] = parseOsvResponse(purls, body);
    expect(results).toHaveLength(1);
    expect(results[0].purl).toBe("pkg:npm/a@1.0.0");
    expect(results[0].vulns.map((v) => v.id)).toEqual(["GHSA-aaaa", "CVE-2026-0001"]);
  });

  it("returns no findings for a clean tree", () => {
    const body = { results: [{ vulns: [] }, { vulns: [] }] };
    expect(parseOsvResponse(["pkg:npm/a@1.0.0", "pkg:npm/b@1.0.0"], body)).toHaveLength(0);
  });

  it("tolerates malformed entries and envelopes", () => {
    expect(parseOsvResponse(["pkg:npm/a@1.0.0"], { results: [null] })).toHaveLength(0);
    expect(parseOsvResponse(["pkg:npm/a@1.0.0"], null)).toHaveLength(0);
    expect(parseOsvResponse(["pkg:npm/a@1.0.0"], { error: "rate limited" })).toHaveLength(0);
    expect(parseOsvResponse(["pkg:npm/a@1.0.0"], { results: [{ vulns: "nope" }] })).toHaveLength(0);
  });
});

describe("fetchOsvBatch retries", () => {
  it("retries a 429 with 300ms/900ms backoff and succeeds on the third attempt", async () => {
    const sleeps: number[] = [];
    let attempts = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const outcome = await fetchOsvBatch(QUERY, {
      fetchImpl: async () => {
        attempts += 1;
        return attempts < 3
          ? new Response("rate limited", { status: 429 })
          : new Response(JSON.stringify({ results: [{ vulns: [] }] }), { status: 200 });
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.attempts).toBe(3);
    expect(sleeps).toEqual([...OSV_RETRY_DELAYS_MS]);
  });

  it("gives up after three attempts and reports the transport error", async () => {
    const sleeps: number[] = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const outcome = await fetchOsvBatch(QUERY, {
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.attempts).toBe(3);
    expect(outcome.error).toContain("ECONNREFUSED");
    expect(sleeps).toEqual([...OSV_RETRY_DELAYS_MS]);
  });

  it("treats a 200 response without a results array as a failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const outcome = await fetchOsvBatch(QUERY, {
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "rate limited" }), { status: 200 }),
      sleep: async () => {},
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("results array");
  });
});

describe("shouldFailClosed", () => {
  it("fails CI runs even without --strict", () => {
    vi.stubEnv("CI", "true");
    expect(shouldFailClosed(process.env, false)).toBe(true);
    vi.unstubAllEnvs();

    expect(shouldFailClosed({ CI: "true" }, false)).toBe(true);
  });

  it("fails --strict runs outside CI", () => {
    expect(shouldFailClosed({}, true)).toBe(true);
  });

  it("keeps the warn-and-continue path for an offline laptop", () => {
    expect(shouldFailClosed({ CI: "false" }, false)).toBe(false);
    expect(shouldFailClosed({}, false)).toBe(false);
  });
});
