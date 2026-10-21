/**
 * @file tests/unit/utils/optimistic-lock.test.ts
 * @description Version-token normalization and comparison for optimistic locking.
 *
 * Pins the accepted shapes (`updatedAt` ISO, epoch ms, wire ETag, `If-Match: *`)
 * and the fail-closed rule: an unreadable row version is a conflict, never a pass.
 *
 * @see src/utils/optimistic-lock.ts
 */

import { describe, expect, it } from "vitest";
import { matchesVersion, normalizeExpectedVersion, versionKey } from "@utils/optimistic-lock";

const ISO = "2026-10-21T15:04:05.000Z";
const MS = Date.parse(ISO);

describe("optimistic-lock", () => {
  describe("normalizeExpectedVersion", () => {
    it("accepts a bare ISO timestamp", () => {
      expect(normalizeExpectedVersion(ISO)).toBe(ISO);
    });

    it("accepts epoch milliseconds", () => {
      expect(normalizeExpectedVersion(MS)).toBe(MS);
      expect(normalizeExpectedVersion(String(MS))).toBe(String(MS));
    });

    it("strips the id prefix from a wire ETag", () => {
      expect(normalizeExpectedVersion(`"01a15f16e20e74a28a3a8acdf1d04e2f-${ISO}"`)).toBe(ISO);
      expect(normalizeExpectedVersion(`W/"doc-${MS}"`)).toBe(String(MS));
    });

    it("treats If-Match: * and an absent token as no precondition", () => {
      expect(normalizeExpectedVersion("*")).toBeNull();
      expect(normalizeExpectedVersion(undefined)).toBeNull();
      expect(normalizeExpectedVersion(null)).toBeNull();
      expect(normalizeExpectedVersion("")).toBeNull();
    });

    it("keeps an unrecognized token so the comparison can fail closed", () => {
      expect(normalizeExpectedVersion("not-a-version")).toBe("not-a-version");
    });
  });

  describe("versionKey", () => {
    it("normalizes Date, ISO and epoch to the same millisecond value", () => {
      expect(versionKey(new Date(ISO))).toBe(MS);
      expect(versionKey(ISO)).toBe(MS);
      expect(versionKey(MS)).toBe(MS);
    });

    it("returns null for values that cannot be read as a time", () => {
      expect(versionKey(null)).toBeNull();
      expect(versionKey(undefined)).toBeNull();
      expect(versionKey("")).toBeNull();
      expect(versionKey("nope")).toBeNull();
      expect(versionKey({})).toBeNull();
    });
  });

  describe("matchesVersion", () => {
    it("matches across token shapes", () => {
      expect(matchesVersion(ISO, ISO)).toBe(true);
      expect(matchesVersion(new Date(ISO), String(MS))).toBe(true);
      expect(matchesVersion(MS, `"id-${ISO}"`)).toBe(true);
    });

    it("keeps the UTC offset on a wire ETag (same instant as the Z form)", () => {
      const offset = "2026-10-21T17:04:05+02:00";
      expect(normalizeExpectedVersion(`"id-${offset}"`)).toBe(offset);
      expect(matchesVersion(ISO, `"id-${offset}"`)).toBe(true);
    });

    it("rejects a stale version", () => {
      expect(matchesVersion(ISO, "2026-10-21T15:04:06.000Z")).toBe(false);
    });

    it("treats an absent token as unconditional", () => {
      expect(matchesVersion(ISO, null)).toBe(true);
    });

    it("fails closed when the stored version is unreadable", () => {
      expect(matchesVersion(undefined, ISO)).toBe(false);
      expect(matchesVersion("garbage", ISO)).toBe(false);
    });
  });
});
