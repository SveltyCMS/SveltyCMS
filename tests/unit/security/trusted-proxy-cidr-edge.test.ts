/**
 * @file tests/unit/security/trusted-proxy-cidr-edge.test.ts
 * @description Malformed IPv6 / CIDR entries must be rejected, never trusted and never thrown on.
 *
 * WHY: `::` must stand for at least one omitted group, so eight explicit groups plus `::` is
 * invalid; the previous expansion computed a negative fill length and threw a RangeError.
 * An exception inside the client-IP resolver is a request-level failure, and a fallback that
 * "trusts on error" would let a malformed entry widen the allowlist.
 */
import { describe, it, expect } from "vitest";
import { isTrustedProxyIp } from "@src/utils/hook-utils";

describe("trusted-proxy: malformed entries fail closed", () => {
  it("rejects an overlong compressed address without throwing", () => {
    const bad = ["1:2:3:4:5:6:7:8::/64", "1:2:3:4:5:6:7:8:9/64"];
    for (const entry of bad) {
      expect(() => isTrustedProxyIp("2001:db8::1", [entry])).not.toThrow();
      expect(isTrustedProxyIp("2001:db8::1", [entry])).toBe(false);
      expect(isTrustedProxyIp("1:2:3:4:5:6:7:8", [entry])).toBe(false);
    }
  });

  it("rejects double compression and stray colons", () => {
    for (const entry of ["1::2::3/64", "1:::2/64", ":1::2/64", "1::2:/64"]) {
      expect(() => isTrustedProxyIp("1:2::3", [entry])).not.toThrow();
      expect(isTrustedProxyIp("1:2::3", [entry])).toBe(false);
    }
  });

  it("rejects out-of-range prefixes", () => {
    expect(isTrustedProxyIp("10.0.0.1", ["10.0.0.0/33"])).toBe(false);
    expect(isTrustedProxyIp("2001:db8::1", ["2001:db8::/129"])).toBe(false);
    expect(isTrustedProxyIp("10.0.0.1", ["10.0.0.0/-1"])).toBe(false);
  });

  it("still accepts valid edge forms", () => {
    expect(isTrustedProxyIp("2001:db8::1", ["::/0"])).toBe(true);
    expect(isTrustedProxyIp("::1", ["::1/128"])).toBe(true);
    expect(isTrustedProxyIp("1:2:3:4:5:6:7:8", ["1:2:3:4:5:6:7:8/128"])).toBe(true);
  });
});
