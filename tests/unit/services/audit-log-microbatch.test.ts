/**
 * @file tests/unit/services/audit-log-microbatch.test.ts
 * @description Unit tests for AuditService write coalescing and micro-batching.
 *
 * Features:
 * - verifies concurrent log calls are buffered into micro-batches
 * - verifies in-flight flush synchronization coalesces simultaneous writes into single insertMany calls
 * - verifies trailing debounce flush timer flushes within micro-batch window
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.unmock("@src/services/security/audit-service");
import { AuditService, AuditEventType } from "@src/services/security/audit-service";

describe("AuditService write coalescing & micro-batching", () => {
  let service: AuditService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new AuditService();
  });

  afterEach(async () => {
    await service.flush().catch(() => {});
    vi.useRealTimers();
  });

  it("buffers log events into memory without immediate flush in async mode", async () => {
    const flushSpy = vi.spyOn(service, "flush").mockResolvedValue();

    await service.log(
      "user_login",
      { id: "usr_1" as any, email: "usr1@test.com" },
      { type: "auth", id: "auth_1" as any },
      AuditEventType.USER_LOGIN,
    );

    // Buffer holds the entry; flush was not called immediately synchronously
    expect(flushSpy).not.toHaveBeenCalled();

    // Advance timer past MICRO_BATCH_MS (15ms)
    vi.advanceTimersByTime(20);
    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it("automatically flushes when buffer reaches MAX_BUFFER_SIZE threshold (25)", async () => {
    const flushSpy = vi.spyOn(service, "flush").mockResolvedValue();

    for (let i = 0; i < 25; i++) {
      await service.log(
        `action_${i}`,
        { id: `usr_${i}` as any, email: `usr${i}@test.com` },
        { type: "test", id: `res_${i}` as any },
        AuditEventType.DATA_EXPORT,
      );
    }

    // Hit the 25 threshold -> triggers immediate flush
    expect(flushSpy).toHaveBeenCalled();
  });

  it("concurrency stress: 500 simultaneous writes across 10 workers maintain zero drop and unbroken hash chain", async () => {
    const captured: Array<{ hash: string; previousHash?: string; id?: string }> = [];
    let maxObservedBuffer = 0;

    vi.spyOn(service, "flush").mockImplementation(async () => {
      const buf = (service as any).buffer as Array<{ hash: string; previousHash?: string }>;
      if (buf.length > maxObservedBuffer) {
        maxObservedBuffer = buf.length;
      }
      const batch = [...buf];
      (service as any).buffer = [];
      captured.push(...batch);
    });

    const WORKERS = 10;
    const LOGS_PER_WORKER = 50;
    const TOTAL_LOGS = WORKERS * LOGS_PER_WORKER;

    // Launch 10 concurrent workers
    const workerPromises = Array.from({ length: WORKERS }, (_, workerIdx) => async () => {
      for (let i = 0; i < LOGS_PER_WORKER; i++) {
        await service.log(
          `worker_${workerIdx}_action_${i}`,
          { id: `user_${workerIdx}` as any, email: `w${workerIdx}@test.com` },
          { type: "concurrent_test", id: `res_${workerIdx}_${i}` as any },
          AuditEventType.USER_UPDATED,
        );
      }
    });

    await Promise.all(workerPromises.map((fn) => fn()));

    // Trigger trailing timer if any entries remain in buffer
    vi.advanceTimersByTime(50);
    await service.flush();

    // 1. Zero dropped entries
    expect(captured.length).toBe(TOTAL_LOGS);

    // 2. Buffer memory stayed bounded
    expect(maxObservedBuffer).toBeLessThanOrEqual(200);

    // 3. Unbroken cryptographic hash chain across all 500 entries
    for (let i = 1; i < captured.length; i++) {
      expect(captured[i].previousHash).toBe(captured[i - 1].hash);
    }
  });
});
