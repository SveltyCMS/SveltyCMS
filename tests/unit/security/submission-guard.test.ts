/**
 * @file tests/unit/security/submission-guard.test.ts
 * @description Real behaviour of the HTML form double-submit / replay guard.
 *
 * The guard had 0% unit coverage because it was only imported by the security
 * middleware. These tests exercise the real CSPRNG generator, the RFC 9562 v7
 * bit checks, the sliding-TTL replay cache, and its bounded-eviction policy.
 *
 * ### Features:
 * - generated IDs are valid RFC 9562 v7 UUIDs and unique
 * - structural validation rejects v1/v4, bad variants, wrong delimiters and non-hex
 * - first submission accepted, replay rejected, expiry re-accepted
 * - lazy pruning and the 10k capacity ceiling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SUBMISSION_CACHE_ENTRIES,
  SUBMISSION_ID_TTL_MS,
  clearSubmissionReplayCache,
  generateSubmissionId,
  getSubmissionCacheStats,
  isValidSubmissionId,
  markSubmissionSeen,
  pruneExpiredSubmissions,
} from "@utils/security/submission-guard";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateSubmissionId", () => {
  it("returns a valid, unique RFC 9562 v7 UUID", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = generateSubmissionId();
      expect(id).toMatch(UUID_V7);
      expect(isValidSubmissionId(id)).toBe(true);
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });
});

describe("isValidSubmissionId", () => {
  it("accepts v7 UUIDs with an RFC 4122 variant", () => {
    expect(isValidSubmissionId("018f4f8e-7b3a-7c2b-8d4e-1234567890ab")).toBe(true);
    expect(isValidSubmissionId("018F4F8E-7B3A-7C2B-BD4E-1234567890AB")).toBe(true);
  });

  it("rejects non-strings, wrong lengths, and bad delimiters", () => {
    expect(isValidSubmissionId(undefined)).toBe(false);
    expect(isValidSubmissionId(null)).toBe(false);
    expect(isValidSubmissionId(123)).toBe(false);
    expect(isValidSubmissionId("")).toBe(false);
    expect(isValidSubmissionId("018f4f8e-7b3a-7c2b-8d4e-1234567890a")).toBe(false);
    expect(isValidSubmissionId("018f4f8e_7b3a_7c2b_8d4e_1234567890ab")).toBe(false);
  });

  it("rejects non-v7 versions and non-RFC variants", () => {
    // version nibble 4 (UUIDv4)
    expect(isValidSubmissionId("018f4f8e-7b3a-4c2b-8d4e-1234567890ab")).toBe(false);
    // variant nibble c/d/e/f (not 10xx)
    expect(isValidSubmissionId("018f4f8e-7b3a-7c2b-cd4e-1234567890ab")).toBe(false);
    expect(isValidSubmissionId("018f4f8e-7b3a-7c2b-ed4e-1234567890ab")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidSubmissionId("018f4f8e-7b3a-7c2b-8d4e-1234567890zz")).toBe(false);
    expect(isValidSubmissionId("018f4f8e-7b3a-7c2b-8d4e-1234567890a ")).toBe(false);
  });
});

describe("submission replay cache", () => {
  beforeEach(() => {
    clearSubmissionReplayCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearSubmissionReplayCache();
  });

  it("accepts the first submission and rejects a replay", () => {
    const id = generateSubmissionId();
    expect(markSubmissionSeen(id)).toBe(true);
    expect(markSubmissionSeen(id)).toBe(false);
    expect(getSubmissionCacheStats().size).toBe(1);
  });

  it("accepts the same id after its TTL expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));

    const id = generateSubmissionId();
    expect(markSubmissionSeen(id, 1_000)).toBe(true);
    expect(markSubmissionSeen(id, 1_000)).toBe(false);

    vi.setSystemTime(new Date("2026-10-18T12:00:02Z"));
    expect(markSubmissionSeen(id, 1_000)).toBe(true);
  });

  it("uses the documented 60s default TTL", () => {
    expect(SUBMISSION_ID_TTL_MS).toBe(60_000);
  });

  it("prunes expired entries and reports how many were removed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));

    expect(markSubmissionSeen("a", 1_000)).toBe(true);
    expect(markSubmissionSeen("b", 1_000)).toBe(true);
    expect(markSubmissionSeen("c", 60_000)).toBe(true);

    vi.setSystemTime(new Date("2026-10-18T12:00:02Z"));
    expect(pruneExpiredSubmissions()).toBe(2);
    expect(getSubmissionCacheStats()).toEqual({
      size: 1,
      maxCapacity: MAX_SUBMISSION_CACHE_ENTRIES,
    });
  });

  it("stays bounded when the cache is full of live entries", () => {
    for (let i = 0; i < MAX_SUBMISSION_CACHE_ENTRIES; i++) {
      markSubmissionSeen(`live-${i}`);
    }
    expect(getSubmissionCacheStats().size).toBe(MAX_SUBMISSION_CACHE_ENTRIES);

    markSubmissionSeen("one-more");
    expect(getSubmissionCacheStats().size).toBe(MAX_SUBMISSION_CACHE_ENTRIES);

    // The oldest key was evicted, so it is accepted again.
    expect(markSubmissionSeen("live-0")).toBe(true);
  });

  it("clears the cache on demand", () => {
    markSubmissionSeen(generateSubmissionId());
    expect(getSubmissionCacheStats().size).toBe(1);
    clearSubmissionReplayCache();
    expect(getSubmissionCacheStats().size).toBe(0);
  });
});
