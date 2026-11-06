/**
 * @file tests/unit/databases/cache-warming-service.test.ts
 * @description Shutdown contract for the cache-warming timers.
 *
 * The periodic 4-minute re-warm and the deferred telemetry warm must stop when
 * the service is disposed (Vite HMR / process exit). Otherwise a timer fires
 * after the dev module runner has closed and logs a spurious
 * "Failed to warm cache: Vite module runner has been closed".
 */

import { describe, expect, it } from "vitest";
import { CacheWarmingService } from "@src/databases/cache/cache-warming-service";

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
});
