/**
 * @file tests/unit/scripts/risk-audit-verdict.test.ts
 * @description The pass/fail decision of the dependency-audit step in
 * `scripts/security/risk-audit.ts`. `version-sbom.test.ts` already pins how
 * advisory ids are extracted; this file pins what that extraction is *allowed to
 * do*: a failure may only be excused when every reported id is on the
 * suppression list, and a failure with no identifiable advisory must stay a
 * failure. Without that, a `bun audit` format change or a prose-matching
 * suppression would turn a real advisory into a green gate.
 */

import { describe, expect, it } from "vitest";

import {
  classifyAuditStep,
  parseAuditJson,
  unsuppressedAdvisories,
} from "../../../scripts/security/risk-audit";

/** Structured `bun audit --json` output for one advisory. */
function structuredAudit(packageName: string, ghsa: string, title = "advisory"): string {
  return JSON.stringify({
    [packageName]: [
      {
        id: 1,
        url: `https://github.com/advisories/${ghsa}`,
        title,
        severity: "high",
      },
    ],
  });
}

describe("audit step verdict", () => {
  it("passes on exit 0 even when the output mentions an advisory", () => {
    const verdict = classifyAuditStep(0, structuredAudit("pkg", "GHSA-real-bbbb-cccc"));

    expect(verdict).toEqual({ kind: "pass" });
  });

  it("allows a failure whose only advisory is suppressed", () => {
    const verdict = classifyAuditStep(1, structuredAudit("deepmerge", "GHSA-gcqx-w48m-w2h4"));

    expect(verdict).toEqual({
      kind: "allowed-suppressed",
      ids: ["GHSA-gcqx-w48m-w2h4"],
    });
  });

  it("fails when a real advisory rides along with a suppressed one", () => {
    const stdout = JSON.stringify({
      deepmerge: [
        { id: 1, url: "https://github.com/advisories/GHSA-gcqx-w48m-w2h4", severity: "low" },
      ],
      "pkg-a": [
        { id: 2, url: "https://github.com/advisories/GHSA-real-bbbb-cccc", severity: "high" },
      ],
    });

    expect(classifyAuditStep(1, stdout)).toEqual({
      kind: "fail",
      ids: ["GHSA-real-bbbb-cccc"],
    });
  });

  it("stays a failure when no advisory can be identified", () => {
    expect(classifyAuditStep(1, "error: failed to reach the advisory database")).toEqual({
      kind: "fail-unidentified",
    });
    expect(classifyAuditStep(1, "")).toEqual({ kind: "fail-unidentified" });
  });

  it("compares suppression ids case-insensitively", () => {
    const stdout = structuredAudit("deepmerge", "GHSA-GCQX-W48M-W2H4");

    expect(classifyAuditStep(1, stdout, ["ghsa-gcqx-w48m-w2h4"])).toEqual({
      kind: "allowed-suppressed",
      ids: ["GHSA-GCQX-W48M-W2H4"],
    });
  });

  it("honours the caller's suppression list, not just the built-in one", () => {
    const stdout = structuredAudit("pkg", "GHSA-real-bbbb-cccc");

    expect(classifyAuditStep(1, stdout, ["GHSA-gcqx-w48m-w2h4"])).toEqual({
      kind: "fail",
      ids: ["GHSA-real-bbbb-cccc"],
    });
    expect(classifyAuditStep(1, stdout, ["GHSA-real-bbbb-cccc"])).toEqual({
      kind: "allowed-suppressed",
      ids: ["GHSA-real-bbbb-cccc"],
    });
  });

  it("reads a GHSA-shaped id field but ignores a numeric one", () => {
    const stringId = JSON.stringify({
      "pkg-b": [{ id: "GHSA-text-dddd-eeee", title: "no url field" }],
    });
    const numericId = JSON.stringify({ "pkg-c": [{ id: 1243505, title: "no url field" }] });

    expect(parseAuditJson(stringId)?.[0].ids).toEqual(["GHSA-text-dddd-eeee"]);
    expect(parseAuditJson(numericId)?.[0].ids).toEqual([]);
    expect(unsuppressedAdvisories(["GHSA-text-dddd-eeee"])).toEqual(["GHSA-text-dddd-eeee"]);
  });
});
