/**
 * @file tests/unit/media/sharing.test.ts
 * @description Unit tests for secure media share link generation and validation.
 */

import { describe, it, expect } from "vitest";
import {
  createLink,
  validateLink,
  revoke,
  extend,
  stats,
  filterLinks,
  newToken,
} from "../../../src/utils/media/sharing";

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
