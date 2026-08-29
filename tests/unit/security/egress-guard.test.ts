/**
 * @file tests/unit/security/egress-guard.test.ts
 * @description Unit tests for SSRF egress guard (private IP / metadata / protocol).
 *
 * Covers the remote media upload SSRF class: user-supplied URLs must not reach
 * loopback, RFC1918, link-local, or cloud metadata endpoints.
 */

import { describe, it, expect } from "vitest";
import { validateEgressUrl, EgressError } from "../../../src/utils/egress-guard";

describe("validateEgressUrl — SSRF defense", () => {
  // allowHttp so we exercise private-IP rules (production also rejects plain HTTP first)
  const opts = { allowHttp: true };

  it("blocks loopback IPv4", async () => {
    await expect(
      validateEgressUrl("http://127.0.0.1:9000/internal-proof.txt", opts),
    ).rejects.toThrow(/private|Blocked/i);
  });

  it("blocks localhost hostname", async () => {
    await expect(validateEgressUrl("http://localhost/secret", opts)).rejects.toThrow(/Blocked/i);
  });

  it("blocks cloud metadata IP", async () => {
    await expect(
      validateEgressUrl("http://169.254.169.254/latest/meta-data/", opts),
    ).rejects.toThrow(/Blocked|private/i);
  });

  it("blocks RFC1918 private ranges", async () => {
    await expect(validateEgressUrl("http://10.0.0.5/admin", opts)).rejects.toThrow(
      /private|Blocked/i,
    );
    await expect(validateEgressUrl("http://192.168.1.1/", opts)).rejects.toThrow(
      /private|Blocked/i,
    );
    await expect(validateEgressUrl("http://172.16.0.1/", opts)).rejects.toThrow(/private|Blocked/i);
  });

  it("blocks IPv6 loopback, link-local and ULA (both fc00: and fd00: halves)", async () => {
    await expect(validateEgressUrl("http://[::1]/secret", opts)).rejects.toThrow(
      /private|Blocked/i,
    );
    await expect(validateEgressUrl("http://[fe80::1]/secret", opts)).rejects.toThrow(
      /private|Blocked/i,
    );
    await expect(validateEgressUrl("http://[fc00::1]/secret", opts)).rejects.toThrow(
      /private|Blocked/i,
    );
    // ULA fd00::/8 — the second half of fc00::/7 (pen-test M5 gap).
    await expect(validateEgressUrl("http://[fd00::1]/secret", opts)).rejects.toThrow(
      /private|Blocked/i,
    );
    await expect(validateEgressUrl("http://[fd12:3456::1]/secret", opts)).rejects.toThrow(
      /private|Blocked/i,
    );
    // IPv4-mapped IPv6 loopback
    await expect(validateEgressUrl("http://[::ffff:127.0.0.1]/", opts)).rejects.toThrow(
      /private|Blocked/i,
    );
  });

  it("blocks CGNAT / shared address space (100.64.0.0/10)", async () => {
    await expect(validateEgressUrl("http://100.64.0.1/", opts)).rejects.toThrow(/private|Blocked/i);
    await expect(validateEgressUrl("http://100.100.100.100/", opts)).rejects.toThrow(
      /private|Blocked/i,
    );
    await expect(validateEgressUrl("http://100.127.255.254/", opts)).rejects.toThrow(
      /private|Blocked/i,
    );
    // Just outside the CGNAT range stays allowed (no DNS needed for an IP literal)
    await expect(validateEgressUrl("http://100.63.0.1/", opts)).resolves.toBeTruthy();
    await expect(validateEgressUrl("http://100.128.0.1/", opts)).resolves.toBeTruthy();
  });

  it("blocks non-http(s) protocols", async () => {
    await expect(validateEgressUrl("file:///etc/passwd")).rejects.toThrow(/protocol|Blocked/i);
    await expect(validateEgressUrl("gopher://127.0.0.1/")).rejects.toThrow(/protocol|Blocked/i);
  });

  it("allows public https URLs (structure only; DNS may fail offline)", async () => {
    // Public IPs are allowed without DNS when the host is already an IP
    const parsed = await validateEgressUrl("https://1.1.1.1/cdn-cgi/trace");
    expect(parsed.protocol).toBe("https:");
    expect(parsed.hostname).toBe("1.1.1.1");
  });

  it("throws EgressError subclass for callers to distinguish SSRF blocks", async () => {
    try {
      await validateEgressUrl("http://127.0.0.1/", opts);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EgressError);
    }
  });
});
