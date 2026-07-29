/**
 * @file tests/unit/utils/benchmark-sandbox.test.ts
 * @description Unit tests for local vs CI-fresh benchmark isolation contract.
 */

import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sandbox from "@utils/benchmark-sandbox";

const ROOT = process.cwd();
const PRIVATE_TS = path.join(ROOT, "config", "private.ts");
const SANDBOX_COMPILED = path.join(
  ROOT,
  ".compiledCollections",
  "test-collections",
  "_local_sandbox",
);

describe("benchmark-sandbox", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.restoreAllMocks();
  });

  it("resolves local profile when developer private.ts exists", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    process.env.BENCHMARK = "true";

    expect(sandbox.resolveBenchmarkProfile()).toBe("local");
    expect(sandbox.isLocalBenchmarkSandbox()).toBe(true);
  });

  it("resolves ci-fresh profile when private.ts is absent", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    process.env.BENCHMARK = "true";

    expect(sandbox.resolveBenchmarkProfile()).toBe("ci-fresh");
    expect(sandbox.isCiFreshBenchmark()).toBe(true);
  });

  it("redirects compiled collections path under local sandbox", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    process.env.BENCHMARK = "true";

    expect(sandbox.resolveCompiledCollectionsPath(null)).toBe(
      path.join(SANDBOX_COMPILED, "global"),
    );
  });

  it("blocks writes to live manifest path during local benchmark", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    process.env.BENCHMARK = "true";

    const liveManifest = path.join(ROOT, ".compiledCollections", ".compilation-manifest.json");

    expect(() => sandbox.assertLiveDataWriteAllowed(liveManifest)).toThrow(/SECURITY VIOLATION/);
    expect(() =>
      sandbox.assertLiveDataWriteAllowed(path.join(SANDBOX_COMPILED, ".compilation-manifest.json")),
    ).not.toThrow();
  });

  it("honours explicit BENCHMARK_PROFILE override", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    process.env.BENCHMARK_PROFILE = "ci-fresh";

    expect(sandbox.resolveBenchmarkProfile()).toBe("ci-fresh");
  });

  it("blocks writes to config/private.ts during local benchmark", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    process.env.BENCHMARK = "true";

    expect(() => sandbox.assertLiveDataWriteAllowed(PRIVATE_TS)).toThrow(/SECURITY VIOLATION/);
  });

  it("assertBenchmarkDbIsolation throws when DB_NAME matches live private.ts", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      'export const privateEnv = { DB_NAME: "sveltycms_test" };',
    );
    process.env.BENCHMARK = "true";
    process.env.DB_NAME = "sveltycms_test";

    expect(() => sandbox.assertBenchmarkDbIsolation("sqlite")).toThrow(
      /matches live config\/private\.ts/,
    );
  });

  it("getBenchmarkIsolationSummary marks local config protected", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    process.env.BENCHMARK = "true";

    const summary = sandbox.getBenchmarkIsolationSummary("sqlite");
    expect(summary.profile).toBe("local");
    expect(summary.liveConfigProtected).toBe(true);
    expect(summary.dbName).toBe("benchmark_shared");
  });
});
