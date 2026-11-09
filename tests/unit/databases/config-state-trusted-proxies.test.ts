/**
 * @file tests/unit/databases/config-state-trusted-proxies.test.ts
 * @description Regression test for TRUSTED_PROXIES cache invalidation (C1).
 *
 * `getTrustedProxies()` caches the parsed allowlist against `getConfigStamp()`.
 * A config replacement must therefore yield the new allowlist without a restart.
 *
 * ### Features:
 * - same-stamp calls return the cached array identity
 * - a new config stamp returns the new allowlist
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  clearPrivateConfigCache,
  getConfigStamp,
  getTrustedProxies,
  setPrivateEnv,
  type AppPrivateConfig,
} from "@src/databases/config-state";

afterEach(() => {
  // Restore a clean module state for the next test file (config-state is
  // isolated per test file, but keep the singleton tidy within this file).
  clearPrivateConfigCache(false);
});

describe("getTrustedProxies cache invalidation", () => {
  it("returns the cached array identity for the same config stamp", () => {
    setPrivateEnv({ TRUSTED_PROXIES: "10.0.0.1,10.0.0.2" } as unknown as AppPrivateConfig);

    const first = getTrustedProxies();
    const second = getTrustedProxies();

    expect(first).toBe(second);
    expect(first).toEqual(["10.0.0.1", "10.0.0.2"]);
  });

  it("returns new proxies after a config stamp change", () => {
    setPrivateEnv({ TRUSTED_PROXIES: "10.0.0.1,10.0.0.2" } as unknown as AppPrivateConfig);
    const before = getTrustedProxies();
    const stampBefore = getConfigStamp();

    setPrivateEnv({ TRUSTED_PROXIES: "192.168.1.1" } as unknown as AppPrivateConfig);

    expect(getConfigStamp()).toBeGreaterThan(stampBefore);
    const after = getTrustedProxies();
    expect(after).toEqual(["192.168.1.1"]);
    expect(after).not.toBe(before);
  });

  it("supports the 'all' sentinel and clears it on a new stamp", () => {
    setPrivateEnv({ TRUSTED_PROXIES: "all" } as unknown as AppPrivateConfig);
    expect(getTrustedProxies()).toBe("all");

    setPrivateEnv({ TRUSTED_PROXIES: "10.1.1.1" } as unknown as AppPrivateConfig);
    expect(getTrustedProxies()).toEqual(["10.1.1.1"]);
  });
});
