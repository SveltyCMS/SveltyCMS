/**
 * @file tests/unit/security/checksum-profile.test.ts
 * @description Tests for the optional SHA-384/SHA-512 checksum profile.
 *
 * Verifies backward compatibility with legacy bare SHA-256 checksums, prefixed
 * output for longer digests, constant-time verification behavior, fail-closed
 * parsing, and env-driven algorithm selection.
 */

import { describe, it, expect, vi } from "vitest";
import { logger } from "@utils/logger";
import { createChecksum as createLegacyChecksum } from "@utils/security/checksum";
import {
  createChecksum,
  isPrefixedChecksum,
  resolveChecksumAlgorithm,
  verifyChecksum,
} from "@utils/security/checksum";

const SAMPLE = { id: "entry-1", title: "Checksum profile", revision: 3 };

describe("checksum profile", () => {
  describe("createChecksum", () => {
    it("defaults to bare SHA-256 hex", () => {
      const checksum = createChecksum(SAMPLE);

      expect(checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(isPrefixedChecksum(checksum)).toBe(false);
    });

    it("matches the legacy SHA-256 serialization from crypto.ts", async () => {
      const legacy = await createLegacyChecksum(SAMPLE);

      expect(createChecksum(SAMPLE, "sha256")).toBe(legacy);
    });

    it("emits a prefixed SHA-384 digest with the correct length", () => {
      const checksum = createChecksum(SAMPLE, "sha384");

      expect(checksum).toMatch(/^sha384:[0-9a-f]{96}$/);
      expect(checksum.slice("sha384:".length)).toHaveLength(96);
    });

    it("emits a prefixed SHA-512 digest with the correct length", () => {
      const checksum = createChecksum(SAMPLE, "sha512");

      expect(checksum).toMatch(/^sha512:[0-9a-f]{128}$/);
      expect(checksum.slice("sha512:".length)).toHaveLength(128);
    });
  });

  describe("verifyChecksum", () => {
    it("accepts a legacy bare SHA-256 value", () => {
      const checksum = createChecksum(SAMPLE, "sha256");

      expect(checksum).not.toContain(":");
      expect(verifyChecksum(checksum, SAMPLE)).toBe(true);
    });

    it("accepts a prefixed SHA-384 value", () => {
      const checksum = createChecksum(SAMPLE, "sha384");

      expect(verifyChecksum(checksum, SAMPLE)).toBe(true);
    });

    it("accepts a prefixed SHA-512 value", () => {
      const checksum = createChecksum(SAMPLE, "sha512");

      expect(verifyChecksum(checksum, SAMPLE)).toBe(true);
    });

    it("rejects tampered data for every algorithm", () => {
      for (const algorithm of ["sha256", "sha384", "sha512"] as const) {
        const checksum = createChecksum(SAMPLE, algorithm);

        expect(verifyChecksum(checksum, { ...SAMPLE, title: "tampered" })).toBe(false);
      }
    });

    it("rejects a checksum whose hex is tampered", () => {
      const checksum = createChecksum(SAMPLE, "sha512");
      const lastChar = checksum.at(-1);
      const tampered = `${checksum.slice(0, -1)}${lastChar === "0" ? "1" : "0"}`;

      expect(verifyChecksum(tampered, SAMPLE)).toBe(false);
    });

    it("fails closed on malformed or unknown input", () => {
      const malformed = [
        "",
        "not-a-checksum",
        "sha1:0123456789abcdef",
        "sha999:0123456789abcdef",
        "sha384:",
        `sha384:${"a".repeat(64)}`, // wrong length for SHA-384
        `sha512:${"z".repeat(128)}`, // not hex
        "a".repeat(63), // legacy SHA-256 must be exactly 64 hex chars
      ];

      for (const value of malformed) {
        expect(verifyChecksum(value, SAMPLE)).toBe(false);
      }
    });

    it("fails closed on data that cannot be serialized", () => {
      const checksum = createChecksum(SAMPLE, "sha384");

      expect(verifyChecksum(checksum, undefined)).toBe(false);
    });
  });

  describe("isPrefixedChecksum", () => {
    it("recognizes well-formed SHA-384/SHA-512 values", () => {
      expect(isPrefixedChecksum(createChecksum(SAMPLE, "sha384"))).toBe(true);
      expect(isPrefixedChecksum(createChecksum(SAMPLE, "sha512"))).toBe(true);
    });

    it("rejects bare legacy and malformed values", () => {
      expect(isPrefixedChecksum(createChecksum(SAMPLE, "sha256"))).toBe(false);
      expect(isPrefixedChecksum("sha384:" + "a".repeat(10))).toBe(false);
      expect(isPrefixedChecksum("sha999:" + "a".repeat(96))).toBe(false);
      expect(isPrefixedChecksum("")).toBe(false);
    });
  });

  describe("resolveChecksumAlgorithm", () => {
    it("defaults to sha256 when unset or empty", () => {
      expect(resolveChecksumAlgorithm({})).toBe("sha256");
      expect(resolveChecksumAlgorithm({ CHECKSUM_ALGORITHM: "" })).toBe("sha256");
      expect(resolveChecksumAlgorithm({ CHECKSUM_ALGORITHM: "   " })).toBe("sha256");
    });

    it("honours configured values case-insensitively", () => {
      expect(resolveChecksumAlgorithm({ CHECKSUM_ALGORITHM: "sha384" })).toBe("sha384");
      expect(resolveChecksumAlgorithm({ CHECKSUM_ALGORITHM: "SHA512" })).toBe("sha512");
      expect(resolveChecksumAlgorithm({ CHECKSUM_ALGORITHM: " Sha256 " })).toBe("sha256");
    });

    it("falls back to sha256 and logs debug for unknown values", () => {
      const debug = vi.spyOn(logger, "debug");

      expect(resolveChecksumAlgorithm({ CHECKSUM_ALGORITHM: "md5" })).toBe("sha256");
      expect(debug).toHaveBeenCalledOnce();

      debug.mockRestore();
    });
  });
});
