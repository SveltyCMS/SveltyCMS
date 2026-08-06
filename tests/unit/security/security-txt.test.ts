/**
 * @file tests/unit/security/security-txt.test.ts
 * @description RFC 9116 (security.txt) compliance for static/.well-known/security.txt —
 * the machine-readable disclosure endpoint referenced by SECURITY.md and the hooks'
 * `.well-known/` fast-path.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SECURITY_TXT = readFileSync(
  join(process.cwd(), "static", ".well-known", "security.txt"),
  "utf8",
);

function field(name: string): string[] {
  const re = new RegExp(`^${name}:\\s*(.+)$`, "gm");
  return [...SECURITY_TXT.matchAll(re)].map((m) => m[1].trim());
}

describe("security.txt (RFC 9116)", () => {
  it("exposes at least one Contact (mailto or URL)", () => {
    const contacts = field("Contact");
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.some((c) => c.startsWith("mailto:") || c.startsWith("https://"))).toBe(true);
  });

  it("has an Expires date within one year (RFC requirement)", () => {
    const expires = field("Expires")[0];
    expect(expires).toBeDefined();
    const exp = new Date(expires);
    expect(Number.isNaN(exp.getTime())).toBe(false);
    const now = new Date();
    expect(exp.getTime()).toBeGreaterThan(now.getTime());
    expect(exp.getTime() - now.getTime()).toBeLessThanOrEqual(366 * 24 * 60 * 60 * 1000);
  });

  it("declares Preferred-Languages and Canonical", () => {
    expect(field("Preferred-Languages")[0]).toBe("en");
    expect(field("Canonical")[0]).toMatch(
      /^https:\/\/sveltycms\.com\/\.well-known\/security\.txt$/,
    );
  });

  it("links the full policy (SECURITY.md)", () => {
    const policy = field("Policy")[0] ?? "";
    expect(policy).toMatch(/SECURITY\.md/);
  });

  it("uses the correct security contact email (no .org drift)", () => {
    const contacts = field("Contact");
    expect(contacts.some((c) => c.includes("security@sveltycms.com"))).toBe(true);
    expect(SECURITY_TXT).not.toContain("sveltycms.org");
  });
});
