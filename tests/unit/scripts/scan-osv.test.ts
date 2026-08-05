/**
 * @file tests/unit/scripts/scan-osv.test.ts
 * @description Unit tests for the OSV global-database check (query batching +
 * response parsing). The live API call is exercised by `bun run risk:audit`.
 */

import { describe, it, expect } from "vitest";
import { buildQueries, parseOsvResponse, type OsvResult } from "../../../scripts/scan-osv";

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

  it("tolerates malformed entries", () => {
    const results = parseOsvResponse(["pkg:npm/a@1.0.0"], { results: [null] });
    expect(results).toHaveLength(0);
  });
});
