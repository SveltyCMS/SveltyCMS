/**
 * @file tests/unit/utils/benchmark-runtime.test.ts
 * @description Tests for benchmark external-service disable guards.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("benchmark-runtime external service guards", () => {
  beforeEach(() => {
    vi.stubEnv("BENCHMARK", undefined);
    vi.stubEnv("BENCHMARK_NO_REDIS", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function load() {
    return import("@utils/benchmark-runtime");
  }

  it("disables external services when BENCHMARK=true (Redis L2 stays opt-in)", async () => {
    vi.stubEnv("BENCHMARK", "true");
    const rt = await load();
    expect(rt.isBenchmarkExternalServicesDisabled()).toBe(true);
    // BENCHMARK alone no longer disables Redis L2 — USE_REDIS=true variants
    // exercise the real Redis path (production parity)
    expect(rt.isBenchmarkRedisDisabled()).toBe(false);
  });

  it("disables Redis when BENCHMARK_NO_REDIS=1 without full benchmark flag", async () => {
    vi.stubEnv("BENCHMARK_NO_REDIS", "1");
    const rt = await load();
    expect(rt.isBenchmarkExternalServicesDisabled()).toBe(false);
    expect(rt.isBenchmarkRedisDisabled()).toBe(true);
  });

  it("allows external services in normal dev", async () => {
    const rt = await load();
    expect(rt.isBenchmarkExternalServicesDisabled()).toBe(false);
    expect(rt.isBenchmarkRedisDisabled()).toBe(false);
  });

  it("does not skip outbound I/O in production unless BENCHMARK is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const rt = await load();
    expect(rt.isBenchmarkRuntime()).toBe(false);
    expect(rt.isBenchmarkExternalServicesDisabled()).toBe(false);
  });

  it("legacy benchmark tokens are inert — BENCHMARK is the single canonical flag", async () => {
    vi.stubEnv("BENCHMARK_MODE", "1");
    vi.stubEnv("BENCHMARK_STABLE", "true");
    vi.stubEnv("SVELTY_BENCHMARK_SUITE", "true");
    const rt = await load();
    expect(rt.isBenchmarkExternalServicesDisabled()).toBe(false);
    expect(rt.isBenchmarkRuntime()).toBe(false);
    expect(rt.isBenchmarkRedisDisabled()).toBe(false);
  });
});
