/**
 * @file tests/unit/utils/benchmark-sandbox.test.ts
 * @description Unit tests for local vs CI-fresh benchmark isolation contract.
 */

import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();
const PRIVATE_TS = path.join(ROOT, "config", "private.ts");
const SANDBOX_COMPILED = path.join(ROOT, ".compiledCollections", "test", "_local_sandbox");

describe("benchmark-sandbox", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.resetModules();
  });

  async function loadSandbox() {
    return import("@utils/benchmark-sandbox");
  }

  it("resolves local profile when developer private.ts exists", async () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    process.env.BENCHMARK = "true";

    const sb = await loadSandbox();
    expect(sb.resolveBenchmarkProfile()).toBe("local");
    expect(sb.isLocalBenchmarkSandbox()).toBe(true);
  });

  it("resolves ci-fresh profile when private.ts is absent", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    process.env.BENCHMARK = "true";
    const sb = await loadSandbox();
    expect(sb.resolveBenchmarkProfile()).toBe("ci-fresh");
    expect(sb.isCiFreshBenchmark()).toBe(true);
  });

  it("redirects compiled collections path under local sandbox", async () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    process.env.BENCHMARK = "true";

    const sb = await loadSandbox();
    expect(sb.resolveCompiledCollectionsPath(null)).toBe(path.join(SANDBOX_COMPILED, "global"));
  });

  it("blocks writes to live manifest path during local benchmark", async () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    process.env.BENCHMARK = "true";

    const sb = await loadSandbox();
    const liveManifest = path.join(ROOT, ".compiledCollections", ".compilation-manifest.json");

    expect(() => sb.assertLiveDataWriteAllowed(liveManifest)).toThrow(/Blocked write to live data/);
    expect(() =>
      sb.assertLiveDataWriteAllowed(path.join(SANDBOX_COMPILED, ".compilation-manifest.json")),
    ).not.toThrow();
  });

  it("honours explicit BENCHMARK_PROFILE override", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    process.env.BENCHMARK_PROFILE = "ci-fresh";

    const sb = await loadSandbox();
    expect(sb.resolveBenchmarkProfile()).toBe("ci-fresh");
  });

  it("blocks writes to config/private.ts during local benchmark", async () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    process.env.BENCHMARK = "true";

    const sb = await loadSandbox();
    expect(() => sb.assertLiveDataWriteAllowed(PRIVATE_TS)).toThrow(/Blocked write to live data/);
  });

  it("assertBenchmarkDbIsolation throws when DB_NAME matches live private.ts", async () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      'export const privateEnv = { DB_NAME: "sveltycms_test" };',
    );
    process.env.BENCHMARK = "true";
    process.env.DB_NAME = "sveltycms_test";

    const sb = await loadSandbox();
    expect(() => sb.assertBenchmarkDbIsolation("sqlite")).toThrow(
      /matches live config\/private\.ts/,
    );
  });

  it("getBenchmarkIsolationSummary marks local config protected", async () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const target = typeof p === "string" ? p : p.toString();
      return target === PRIVATE_TS;
    });
    process.env.BENCHMARK = "true";

    const sb = await loadSandbox();
    const summary = sb.getBenchmarkIsolationSummary("sqlite");
    expect(summary.profile).toBe("local");
    expect(summary.liveConfigProtected).toBe(true);
    expect(summary.dbName).toBe("benchmark_shared");
  });
});
