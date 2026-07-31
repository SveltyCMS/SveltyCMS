/**
 * @file tests/unit/utils/hook-utils.test.ts
 * @description Pins the consolidated IS_TEST_MODE (single source of truth for
 * middleware test-mode detection) — all five env flags must be honored so
 * hooks never disagree about whether they are in a test environment.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "TEST_MODE",
  "VITE_TEST_MODE",
  "PLAYWRIGHT_TEST",
  "BENCHMARK",
  "SVELTY_BENCHMARK_SUITE",
] as const;

const original = { ...process.env };

async function loadIsTestMode(): Promise<boolean> {
  const mod = await import("@src/utils/hook-utils");
  return (mod as { IS_TEST_MODE: boolean }).IS_TEST_MODE;
}

function clearTestFlags(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] !== undefined) process.env[key] = original[key];
    else delete process.env[key];
  }
  vi.resetModules();
});

describe("hook-utils IS_TEST_MODE (single source of truth)", () => {
  it.each(ENV_KEYS)("is true when %s=true", async (key) => {
    clearTestFlags();
    process.env[key] = "true";
    vi.resetModules();
    expect(await loadIsTestMode()).toBe(true);
  });

  it("is false when no test/benchmark flags are set", async () => {
    clearTestFlags();
    vi.resetModules();
    expect(await loadIsTestMode()).toBe(false);
  });
});
