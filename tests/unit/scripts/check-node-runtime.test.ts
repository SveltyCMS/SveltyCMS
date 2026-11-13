/**
 * @file tests/unit/scripts/check-node-runtime.test.ts
 * @description Unit tests for the Node.js runtime security floor gate
 *   (CVE-2026-111497). Pins the comparison logic and the manifest floor so a
 *   future `engines.node` edit cannot silently drop below a patched release.
 */

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkNodeRuntime,
  compareVersions,
  isSkipRequested,
  parseNodeFloor,
  parseVersion,
  shouldSkipNodeRuntimeCheck,
  skipOverrideAllowed,
} from "../../../scripts/security/check-node-runtime";

/** CVE-2026-111497 first patched 24.x release. */
const PATCHED_24 = { major: 24, minor: 22, patch: 1 };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseVersion", () => {
  it("parses prefixed, bare, and pre-release versions", () => {
    expect(parseVersion("v24.22.1")).toEqual(PATCHED_24);
    expect(parseVersion("24.22.1")).toEqual(PATCHED_24);
    expect(parseVersion("24.22.1-rc.1")).toEqual(PATCHED_24);
  });

  it("rejects non-versions", () => {
    expect(parseVersion("24.22")).toBeNull();
    expect(parseVersion("lts/krypton")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareVersions(PATCHED_24, { major: 24, minor: 22, patch: 0 })).toBeGreaterThan(0);
    expect(compareVersions(PATCHED_24, { major: 25, minor: 0, patch: 0 })).toBeLessThan(0);
    expect(compareVersions(PATCHED_24, PATCHED_24)).toBe(0);
  });
});

describe("parseNodeFloor", () => {
  it("extracts the minimum from a >= range", () => {
    expect(parseNodeFloor(">=24.22.1")).toEqual(PATCHED_24);
    expect(parseNodeFloor(">= 24.22.1")).toEqual(PATCHED_24);
  });

  it("returns null when no concrete floor is declared", () => {
    expect(parseNodeFloor(undefined)).toBeNull();
    expect(parseNodeFloor("^24.22.1")).toBeNull();
  });
});

describe("checkNodeRuntime", () => {
  it("fails below the floor and names the CVE and the nginx misconception", () => {
    const result = checkNodeRuntime("24.15.0", ">=24.22.1");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("CVE-2026-111497");
    expect(result.message).toContain("nginx");
  });

  it("passes at and above the floor", () => {
    expect(checkNodeRuntime("24.22.1", ">=24.22.1").ok).toBe(true);
    expect(checkNodeRuntime("25.0.0", ">=24.22.1").ok).toBe(true);
  });

  it("fails closed when the manifest declares no floor", () => {
    expect(checkNodeRuntime("24.22.1", undefined).ok).toBe(false);
  });

  it("does not apply the Node floor to Bun", () => {
    const result = checkNodeRuntime("24.15.0", ">=24.22.1", true);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Bun");
  });
});

describe("skip override", () => {
  it("is honoured for local development", () => {
    expect(isSkipRequested({ SKIP_NODE_RUNTIME_CHECK: "1" })).toBe(true);
    expect(isSkipRequested({ SKIP_NODE_CHECK: "1" })).toBe(true);
    expect(shouldSkipNodeRuntimeCheck({ SKIP_NODE_RUNTIME_CHECK: "true" })).toBe(true);
  });

  it("is ignored in CI even when every alias is set", () => {
    const env = { SKIP_NODE_RUNTIME_CHECK: "1", SKIP_NODE_CHECK: "1", CI: "true" };
    expect(isSkipRequested(env)).toBe(true);
    expect(skipOverrideAllowed(env)).toBe(false);
    expect(shouldSkipNodeRuntimeCheck(env)).toBe(false);
  });

  it("is ignored in production", () => {
    const env = { SKIP_NODE_RUNTIME_CHECK: "true", NODE_ENV: "production" };
    expect(shouldSkipNodeRuntimeCheck(env)).toBe(false);
  });

  it("reads the real process env (CI set by the runner)", () => {
    vi.stubEnv("CI", "true");
    vi.stubEnv("SKIP_NODE_RUNTIME_CHECK", "1");
    expect(shouldSkipNodeRuntimeCheck()).toBe(false);
  });

  it("does not skip when nothing was requested", () => {
    expect(shouldSkipNodeRuntimeCheck({})).toBe(false);
  });
});

describe("package.json floor", () => {
  it("stays at or above the CVE-2026-111497 patched 24.x release", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { engines?: { node?: string } };
    const floor = parseNodeFloor(pkg.engines?.node);
    expect(floor).not.toBeNull();
    expect(compareVersions(floor!, PATCHED_24)).toBeGreaterThanOrEqual(0);
  });
});
