/**
 * @file tests/unit/databases/cache-warming-service.test.ts
 * @description Shutdown contract for the cache-warming timers.
 *
 * The periodic 4-minute re-warm and the deferred telemetry warm must stop when
 * the service is disposed (Vite HMR / process exit). Otherwise a timer fires
 * after the dev module runner has closed and logs a spurious
 * "Failed to warm cache: Vite module runner has been closed".
 */

import { describe, expect, it, vi } from "vitest";
import {
  CacheWarmingService,
  installCacheWarmingSingleton,
} from "@src/databases/cache/cache-warming-service";

describe("CacheWarmingService shutdown", () => {
  it("does not warm after dispose", async () => {
    const service = new CacheWarmingService();
    service.dispose();

    await expect(service.warmCriticalPaths({})).resolves.toBe(false);
  });

  it("keeps dispose and stop idempotent", async () => {
    const service = new CacheWarmingService();

    service.stop();
    service.dispose();
    service.dispose();

    await expect(service.warmCriticalPaths({})).resolves.toBe(false);
  });

  it("disposes the previous singleton before installing the next (HMR handoff)", () => {
    const first = new CacheWarmingService();
    const store: { __sveltyCacheWarmingService?: CacheWarmingService } = {
      __sveltyCacheWarmingService: first,
    };
    const dispose = vi.spyOn(first, "dispose");

    const second = installCacheWarmingSingleton(store);

    expect(second).not.toBe(first);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(store.__sveltyCacheWarmingService).toBe(second);
  });
});
