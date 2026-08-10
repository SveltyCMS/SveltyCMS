/**
 * @file tests/unit/media/sharing.test.ts
 * @description Unit tests for secure media share link generation and validation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import {
  createLink,
  validateLink,
  revoke,
  extend,
  stats,
  filterLinks,
  newToken,
} from "../../../src/utils/media/sharing";
import {
  hashSharePassword,
  hashSharePasswordWithLegacy,
  verifySharePassword,
} from "../../../src/utils/media/share-link-hash.server";

// The global settings mock (tests/unit/setup.ts) reads JWT_SECRET_KEY from
// globalThis.privateEnv — required by the share-link HMAC derivation. A global
// beforeEach in setup.ts wipes privateEnv before every test, so it must be
// re-seeded here per test.
const TEST_JWT_SECRET = "unit-test-jwt-secret-for-share-link-hmac";

beforeEach(() => {
  (globalThis as any).privateEnv = {
    ...(globalThis as any).privateEnv,
    JWT_SECRET_KEY: TEST_JWT_SECRET,
  };
});

describe("sharing — createLink", () => {
  it("generates a valid share link with defaults", () => {
    const link = createLink("file_1" as any, "user_1" as any);

    expect(link.token).toBeTruthy();
    expect(link.rawToken).toBeTruthy();
    expect(link.rawToken.length).toBeGreaterThan(32);
    expect(link.fileId).toBe("file_1");
    expect(link.active).toBe(true);
    expect(link.downloadCount).toBe(0);

    const expiresAt = new Date(link.expiresAt);
    const diffHours = (expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(diffHours).toBeGreaterThan(23);
    expect(diffHours).toBeLessThan(25);
  });

  it("applies custom hours and maxDownloads", () => {
    const link = createLink("f1" as any, "u1" as any, {
      hours: 48,
      maxDownloads: 5,
    });
    expect(link.maxDownloads).toBe(5);
    const diffHours = (new Date(link.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(diffHours).toBeGreaterThan(47);
  });

  it("generates unique tokens", () => {
    const a = createLink("f1" as any, "u1" as any);
    const b = createLink("f1" as any, "u1" as any);
    expect(a.rawToken).not.toBe(b.rawToken);
  });
});

describe("sharing — validateLink", () => {
  function makeLink(overrides: Partial<ReturnType<typeof createLink>> = {}) {
    return createLink("f1" as any, "u1" as any, overrides as any);
  }

  it("validates active link", () => {
    expect(validateLink(makeLink()).ok).toBe(true);
  });

  it("rejects inactive link", () => {
    expect(validateLink({ ...makeLink(), active: false }).reason).toBe("inactive");
  });

  it("rejects expired link", () => {
    const expired = {
      ...makeLink(),
      expiresAt: new Date(Date.now() - 1000).toISOString() as any,
    };
    expect(validateLink(expired).reason).toBe("expired");
  });

  it("rejects when download limit reached", () => {
    const limited = { ...makeLink(), maxDownloads: 3, downloadCount: 3 };
    expect(validateLink(limited).reason).toBe("limit");
  });

  it("validates IP restrictions", () => {
    const ipLink = { ...makeLink(), allowedIPs: ["192.168.1.1"] };
    expect(validateLink(ipLink, "10.0.0.1").reason).toBe("ip");
    expect(validateLink(ipLink, "192.168.1.1").ok).toBe(true);
  });
});

describe("sharing — revoke / extend", () => {
  it("revoke sets active to false", () => {
    const link = createLink("f1" as any, "u1" as any);
    expect(revoke({ ...link }).active).toBe(false);
  });

  it("extend pushes expiry forward", () => {
    const link = createLink("f1" as any, "u1" as any);
    const original = new Date(link.expiresAt).getTime();
    const extended = extend({ ...link }, 24);
    expect(new Date(extended.expiresAt).getTime()).toBeGreaterThan(original + 23 * 3_600_000);
  });
});

describe("sharing — filterLinks", () => {
  it("separates active and expired links", () => {
    const active = createLink("f1" as any, "u1" as any);
    const expired = {
      ...createLink("f2" as any, "u1" as any),
      expiresAt: new Date(Date.now() - 1).toISOString() as any,
    };
    const result = filterLinks([active, expired]);
    expect(result.active).toHaveLength(1);
    expect(result.expired).toHaveLength(1);
  });
});

describe("sharing — stats", () => {
  it("computes stats from link logs", () => {
    const link = createLink("f1" as any, "u1" as any, { maxDownloads: 10 });
    const now = new Date().toISOString() as any;

    link.logs.push(
      { action: "view", at: now, ip: "1.1.1.1", ua: "test", ok: true },
      { action: "download", at: now, ip: "1.1.1.1", ua: "test", ok: true },
    );
    link.downloadCount = 1;

    const s = stats(link);
    expect(s.total).toBe(2);
    expect(s.views).toBe(1);
    expect(s.downloads).toBe(1);
    expect(s.downloadsLeft).toBe(9);
  });
});

describe("sharing — newToken", () => {
  it("generates base64url token, 32 bytes → 43 chars", () => {
    const token = newToken();
    expect(token.length).toBe(43);
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
    expect(token).not.toContain("=");
  });
});

describe("sharing — password hashing (HMAC)", () => {
  it("hashSharePassword produces a deterministic 64-char hex HMAC", () => {
    const a = hashSharePassword("hunter2");
    const b = hashSharePassword("hunter2");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashSharePassword differs from the legacy plain-SHA-256 digest", () => {
    const { legacy } = hashSharePasswordWithLegacy("hunter2");
    // HMAC (keyed) must never equal the unkeyed digest of the same input
    expect(hashSharePassword("hunter2")).not.toBe(legacy);
  });

  it("produces different hashes for different passwords", () => {
    expect(hashSharePassword("alpha")).not.toBe(hashSharePassword("beta"));
  });

  it("hashSharePasswordWithLegacy returns distinct current and legacy forms", () => {
    const { current, legacy } = hashSharePasswordWithLegacy("s3cret");
    expect(current).toMatch(/^[0-9a-f]{64}$/);
    expect(legacy).toMatch(/^[0-9a-f]{64}$/);
    expect(current).not.toBe(legacy);
    expect(current).toBe(hashSharePassword("s3cret"));
  });

  it("verifySharePassword accepts the current HMAC stored value", () => {
    const stored = hashSharePassword("correct horse");
    expect(verifySharePassword("correct horse", stored)).toBe(true);
    expect(verifySharePassword("wrong horse", stored)).toBe(false);
  });

  it("verifySharePassword accepts legacy plain-SHA-256 stored values (backward compat)", () => {
    const legacyStored = createHash("sha256").update("old-password").digest("hex");
    expect(verifySharePassword("old-password", legacyStored)).toBe(true);
    expect(verifySharePassword("different", legacyStored)).toBe(false);
  });

  it("verifySharePassword rejects malformed stored hashes without throwing", () => {
    expect(verifySharePassword("x", "")).toBe(false);
    expect(verifySharePassword("x", "not-a-hex-hash")).toBe(false);
  });

  it("fails closed when JWT_SECRET_KEY is unavailable", () => {
    const env = (globalThis as any).privateEnv;
    const hadKey = env && "JWT_SECRET_KEY" in env;
    if (env) delete env.JWT_SECRET_KEY;
    expect(() => hashSharePassword("x")).toThrow(/JWT_SECRET_KEY/);
    if (hadKey) env.JWT_SECRET_KEY = TEST_JWT_SECRET;
  });
});
