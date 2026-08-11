/**
 * @file tests/unit/utils/hook-utils.test.ts
 * @description Pins the consolidated IS_TEST_MODE (single source of truth for
 * middleware test-mode detection). TEST_MODE/VITE_TEST_MODE/PLAYWRIGHT_TEST must
 * be honored so hooks never disagree. BENCHMARK is deliberately EXCLUDED:
 * benchmark runs exercise real middleware (production mode) and must not
 * inherit test-mode shortcuts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["TEST_MODE", "VITE_TEST_MODE", "PLAYWRIGHT_TEST"] as const;

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

  it("is false when no test flags are set", async () => {
    clearTestFlags();
    vi.resetModules();
    expect(await loadIsTestMode()).toBe(false);
  });

  it("is false when ONLY BENCHMARK=true is set (production parity)", async () => {
    clearTestFlags();
    delete process.env.BENCHMARK;
    process.env.BENCHMARK = "true";
    vi.resetModules();
    expect(await loadIsTestMode()).toBe(false);
  });
});
