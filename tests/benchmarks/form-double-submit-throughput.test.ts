/**
 * @file tests/benchmarks/form-double-submit-throughput.test.ts
 * @description Benchmark for RFC 4122 v4 Form Submission Guard and Replay Protection.
 * @summary Measures generation speed, strict nibble validation throughput, replay cache RPS, and memory bounding.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "../unit/bun-preload.ts";
import {
  generateSubmissionId,
  isValidSubmissionId,
  markSubmissionSeen,
  clearSubmissionReplayCache,
  getSubmissionCacheStats,
  MAX_SUBMISSION_CACHE_ENTRIES,
} from "@utils/security/submission-guard";

describe("Form Double-Submit & Replay Guard Benchmark", () => {
  beforeEach(() => {
    clearSubmissionReplayCache();
  });

  it("measures submission ID generation throughput", () => {
    const N = 20_000;
    // JIT warm-up
    for (let i = 0; i < 1_000; i++) {
      generateSubmissionId();
    }

    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      generateSubmissionId();
    }
    const elapsed = performance.now() - t0;
    const rps = (N / elapsed) * 1000;

    console.log(
      `[Benchmark] generateSubmissionId: ${rps.toFixed(0)} IDs/sec (${(elapsed / N).toFixed(4)} ms/id)`,
    );
    expect(rps).toBeGreaterThan(100_000);
  });

  it("measures strict RFC-4122 v4 validation throughput", () => {
    const validId = generateSubmissionId();
    const invalidLength = "12345678-1234-4234-8234";
    const invalidVersion = "12345678-1234-1234-8234-123456789abc"; // version 1
    const invalidVariant = "12345678-1234-4234-0234-123456789abc"; // variant 0
    const nonHex = "12345678-1234-4234-8234-123456789xyz";

    expect(isValidSubmissionId(validId)).toBe(true);
    expect(isValidSubmissionId(invalidLength)).toBe(false);
    expect(isValidSubmissionId(invalidVersion)).toBe(false);
    expect(isValidSubmissionId(invalidVariant)).toBe(false);
    expect(isValidSubmissionId(nonHex)).toBe(false);

    const N = 100_000;
    // JIT warm-up
    for (let i = 0; i < 5_000; i++) {
      isValidSubmissionId(validId);
      isValidSubmissionId(invalidVersion);
    }

    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      isValidSubmissionId(validId);
    }
    const elapsed = performance.now() - t0;
    const rps = (N / elapsed) * 1000;

    console.log(
      `[Benchmark] isValidSubmissionId: ${rps.toFixed(0)} validations/sec (${(elapsed / N).toFixed(5)} ms/check)`,
    );
    expect(rps).toBeGreaterThan(1_000_000);
  });

  it("measures replay cache throughput and duplicate submission rejection", () => {
    const N = 10_000;
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      ids.push(generateSubmissionId());
    }

    // Measure First-Submission Throughput (Accepted)
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const accepted = markSubmissionSeen(ids[i]);
      expect(accepted).toBe(true);
    }
    const insertElapsed = performance.now() - t0;
    const insertRps = (N / insertElapsed) * 1000;

    // Measure Replay Rejection Throughput (Blocked 429)
    const t1 = performance.now();
    for (let i = 0; i < N; i++) {
      const accepted = markSubmissionSeen(ids[i]);
      expect(accepted).toBe(false); // Must reject as replay!
    }
    const replayElapsed = performance.now() - t1;
    const replayRps = (N / replayElapsed) * 1000;

    console.log(
      `[Benchmark] Replay Cache Insertion: ${insertRps.toFixed(0)} ops/sec (${(insertElapsed / N).toFixed(4)} ms/op)`,
    );
    console.log(
      `[Benchmark] Replay Rejection:        ${replayRps.toFixed(0)} ops/sec (${(replayElapsed / N).toFixed(4)} ms/op)`,
    );

    expect(insertRps).toBeGreaterThan(500_000);
    expect(replayRps).toBeGreaterThan(500_000);
  });

  it("verifies memory bounding and lazy pruning under high volume", () => {
    const N = 15_000; // Exceeds MAX_SUBMISSION_CACHE_ENTRIES (10,000)

    for (let i = 0; i < N; i++) {
      markSubmissionSeen(generateSubmissionId(), 5); // 5ms TTL
    }

    const stats = getSubmissionCacheStats();
    expect(stats.size).toBeLessThanOrEqual(MAX_SUBMISSION_CACHE_ENTRIES);
  });
});
