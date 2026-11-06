/**
 * @file tests/unit/security/egress-guard.test.ts
 * @description Unit tests for SSRF egress guard (private IP / metadata / protocol).
 *
 * Covers the remote media upload SSRF class: user-supplied URLs must not reach
 * loopback, RFC1918, link-local, or cloud metadata endpoints.
 */

import { describe, it, expect, vi } from "vitest";
import {
  allowTestEgressOrigin,
  safeFetch,
  validateEgressUrl,
  EgressError,
  pinDnsResolution,
  getPinnedDnsResolution,
} from "../../../src/utils/egress-guard";

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
    // Every second octet 64–127 is inside the /10, including the values the
    // earlier `1[0-2][0-7]` regex skipped (108, 109, 118, 119).
    for (const second of [108, 109, 118, 119]) {
      await expect(validateEgressUrl(`http://100.${second}.0.1/`, opts)).rejects.toThrow(
        /private|Blocked/i,
      );
    }
    // Just outside the CGNAT range stays allowed (no DNS needed for an IP literal)
    await expect(validateEgressUrl("http://100.63.0.1/", opts)).resolves.toBeTruthy();
    await expect(validateEgressUrl("http://100.128.0.1/", opts)).resolves.toBeTruthy();
  });

  it("keeps CGNAT blocked even with allowPrivate", async () => {
    const localOpts = { allowHttp: true, allowPrivate: true };
    for (const second of [64, 100, 108, 109, 118, 119, 127]) {
      await expect(validateEgressUrl(`http://100.${second}.0.1/`, localOpts)).rejects.toThrow(
        /private|Blocked/i,
      );
    }
  });

  it("blocks non-http(s) protocols", async () => {
    await expect(validateEgressUrl("file:///etc/passwd")).rejects.toThrow(/protocol|Blocked/i);
    await expect(validateEgressUrl("gopher://127.0.0.1/")).rejects.toThrow(/protocol|Blocked/i);
  });

  it("blocks protocol-relative URLs", async () => {
    await expect(validateEgressUrl("//evil.com/payload")).rejects.toThrow(
      /Protocol-relative URL forbidden/i,
    );
    await expect(validateEgressUrl("/\\evil.com/payload")).rejects.toThrow(
      /Protocol-relative URL forbidden/i,
    );
  });

  it("enforces allowedOrigins and allowedHosts scope constraints", async () => {
    const originOpts = { allowedOrigins: ["https://1.1.1.1", "https://9.9.9.9"] };
    await expect(validateEgressUrl("https://1.1.1.1/v1/user", originOpts)).resolves.toBeTruthy();
    await expect(validateEgressUrl("https://8.8.8.8/data", originOpts)).rejects.toThrow(
      /Origin not in allowedOrigins list/i,
    );

    const hostOpts = { allowedHosts: ["1.1.1.1", /^9\./] };
    await expect(validateEgressUrl("https://1.1.1.1/dns-query", hostOpts)).resolves.toBeTruthy();
    await expect(validateEgressUrl("https://9.9.9.9/api", hostOpts)).resolves.toBeTruthy();
    await expect(validateEgressUrl("https://8.8.8.8/test", hostOpts)).rejects.toThrow(
      /Hostname not in allowedHosts list/i,
    );
  });

  it("enforces custom urlScope predicate", async () => {
    const scopeOpts = { urlScope: (url: URL) => url.pathname.startsWith("/api/safe/") };
    await expect(
      validateEgressUrl("https://1.1.1.1/api/safe/items", scopeOpts),
    ).resolves.toBeTruthy();
    await expect(validateEgressUrl("https://1.1.1.1/admin/secret", scopeOpts)).rejects.toThrow(
      /urlScope predicate/i,
    );
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

describe("allowPrivate — opt-in local-service allowance", () => {
  const localOpts = { allowHttp: true, allowPrivate: true };

  it("is opt-in: loopback stays blocked without it", async () => {
    await expect(
      validateEgressUrl("http://127.0.0.1:11434/api/tags", { allowHttp: true }),
    ).rejects.toThrow(/private|Blocked/i);
  });

  it("permits loopback, localhost and RFC1918 hosts when explicitly requested", async () => {
    await expect(
      validateEgressUrl("http://127.0.0.1:11434/api/tags", localOpts),
    ).resolves.toBeTruthy();
    await expect(validateEgressUrl("http://localhost:11434", localOpts)).resolves.toBeTruthy();
    await expect(validateEgressUrl("http://10.0.0.5:11434", localOpts)).resolves.toBeTruthy();
    await expect(validateEgressUrl("http://192.168.1.10:11434", localOpts)).resolves.toBeTruthy();
    await expect(validateEgressUrl("http://172.16.0.1:11434", localOpts)).resolves.toBeTruthy();
  });

  it("still blocks cloud metadata and link-local endpoints", async () => {
    await expect(
      validateEgressUrl("http://169.254.169.254/latest/meta-data/", localOpts),
    ).rejects.toThrow(/private|Blocked/i);
    await expect(
      validateEgressUrl("http://metadata.google.internal/computeMetadata/v1/", localOpts),
    ).rejects.toThrow(/Blocked/i);
    await expect(validateEgressUrl("http://[fe80::1]/", localOpts)).rejects.toThrow(
      /private|Blocked/i,
    );
    // IPv4-mapped IPv6 must not slip past the opt-in relaxation.
    await expect(validateEgressUrl("http://[::ffff:169.254.169.254]/", localOpts)).rejects.toThrow(
      /private|Blocked/i,
    );
  });
});

describe("safeFetch — redirect re-validation", () => {
  it("does not follow a redirect to a private address", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1:11434/api/tags" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await safeFetch("https://1.1.1.1/start", {
        allowHttp: true,
        timeoutMs: 2000,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/private|Blocked/i);
      // The redirect target was validated and rejected before a second request.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("blocks redirects that break out of allowedOrigins or allowedHosts", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://8.8.8.8/escaped" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await safeFetch("https://1.1.1.1/start", {
        allowedHosts: ["1.1.1.1"],
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/allowedHosts/i);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("blocks protocol downgrade from https to http across redirect hops", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://1.1.1.1/downgraded" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await safeFetch("https://1.1.1.1/start", {
        allowHttp: true,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/protocol downgrade forbidden/i);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("allowTestEgressOrigin — explicit test-only allowlist", () => {
  it("permits exactly the registered origin and still blocks other loopback ports", async () => {
    const dispose = allowTestEgressOrigin("http://127.0.0.1:43219");
    try {
      await expect(
        validateEgressUrl("http://127.0.0.1:43219/.well-known/openid-configuration", {
          allowHttp: false,
        }),
      ).resolves.toBeTruthy();

      await expect(
        validateEgressUrl("http://127.0.0.1:43220/", { allowHttp: true }),
      ).rejects.toThrow(/private|Blocked/i);
      await expect(
        validateEgressUrl("http://localhost:43219/", { allowHttp: true }),
      ).rejects.toThrow(/Blocked/i);
    } finally {
      dispose();
    }
  });

  it("revokes the allowance when the disposer runs", async () => {
    const dispose = allowTestEgressOrigin("http://127.0.0.1:43221");
    await expect(
      validateEgressUrl("http://127.0.0.1:43221/jwks", { allowHttp: true }),
    ).resolves.toBeTruthy();

    dispose();
    await expect(
      validateEgressUrl("http://127.0.0.1:43221/jwks", { allowHttp: true }),
    ).rejects.toThrow(/private|Blocked/i);
  });

  it("refuses to register outside a test runtime", () => {
    const previousTestMode = process.env.TEST_MODE;
    const previousPlaywright = process.env.PLAYWRIGHT_TEST;

    process.env.TEST_MODE = "false";
    delete process.env.PLAYWRIGHT_TEST;

    try {
      expect(() => allowTestEgressOrigin("http://127.0.0.1:43222")).toThrow(/test-only/i);
    } finally {
      if (previousTestMode === undefined) delete process.env.TEST_MODE;
      else process.env.TEST_MODE = previousTestMode;

      if (previousPlaywright === undefined) delete process.env.PLAYWRIGHT_TEST;
      else process.env.PLAYWRIGHT_TEST = previousPlaywright;
    }
  });

  it("pins resolved DNS addresses to eliminate secondary lookup and TOCTOU rebinding", () => {
    pinDnsResolution("api.trusted-partner.com", "93.184.216.34", 4);
    const pinned = getPinnedDnsResolution("api.trusted-partner.com");
    expect(pinned).not.toBeNull();
    expect(pinned?.address).toBe("93.184.216.34");
    expect(pinned?.family).toBe(4);
    expect(getPinnedDnsResolution("non-existent-host.com")).toBeNull();
  });
});
