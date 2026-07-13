/**
 * @file tests/unit/utils/benchmark-runtime.test.ts
 * @description Tests for benchmark external-service disable guards.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("benchmark-runtime external service guards", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    delete process.env.BENCHMARK;
    delete process.env.SVELTY_BENCHMARK_SUITE;
    delete process.env.BENCHMARK_MODE;
    delete process.env.BENCHMARK_NO_REDIS;
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  async function load() {
    return import("@utils/benchmark-runtime");
  }

  it("disables external services when BENCHMARK=true", async () => {
    process.env.BENCHMARK = "true";
    const rt = await load();
    expect(rt.isBenchmarkExternalServicesDisabled()).toBe(true);
    expect(rt.isBenchmarkRedisDisabled()).toBe(true);
  });

  it("disables Redis when BENCHMARK_NO_REDIS=1 without full benchmark flag", async () => {
    process.env.BENCHMARK_NO_REDIS = "1";
    const rt = await load();
    expect(rt.isBenchmarkExternalServicesDisabled()).toBe(false);
    expect(rt.isBenchmarkRedisDisabled()).toBe(true);
  });

  it("allows external services in normal dev", async () => {
    const rt = await load();
    expect(rt.isBenchmarkExternalServicesDisabled()).toBe(false);
    expect(rt.isBenchmarkRedisDisabled()).toBe(false);
  });
});
