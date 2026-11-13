/**
 * @file tests/unit/security/trusted-proxy-cidr.test.ts
 * @description TRUSTED_PROXIES must honour CIDR blocks, not only exact addresses.
 *
 * WHY: the matcher was `list.includes(ip)`, while the configuration documents CIDR.
 * With `TRUSTED_PROXIES=10.0.0.0/8` nothing matched, so `X-Forwarded-For` was never
 * trusted (broken deployments) — and the inverse misconfiguration, a wrongly narrow
 * entry, was invisible. A proxied deployment depends on this to find the real client IP
 * that rate limiting and audit records use.
 */
import { describe, it, expect } from "vitest";
import { isTrustedProxyIp } from "@src/utils/hook-utils";

describe("isTrustedProxyIp", () => {
  it("matches an exact IPv4 entry", () => {
    expect(isTrustedProxyIp("10.1.2.3", ["10.1.2.3"])).toBe(true);
    expect(isTrustedProxyIp("10.1.2.4", ["10.1.2.3"])).toBe(false);
  });

  it("matches IPv4 CIDR blocks", () => {
    expect(isTrustedProxyIp("10.4.5.6", ["10.0.0.0/8"])).toBe(true);
    expect(isTrustedProxyIp("11.4.5.6", ["10.0.0.0/8"])).toBe(false);
    expect(isTrustedProxyIp("172.20.1.1", ["172.16.0.0/12"])).toBe(true);
    expect(isTrustedProxyIp("172.32.1.1", ["172.16.0.0/12"])).toBe(false);
    expect(isTrustedProxyIp("192.168.0.12", ["192.168.0.0/24"])).toBe(true);
    expect(isTrustedProxyIp("192.168.1.12", ["192.168.0.0/24"])).toBe(false);
  });

  it("handles the /32 and /0 edges", () => {
    expect(isTrustedProxyIp("10.0.0.1", ["10.0.0.1/32"])).toBe(true);
    expect(isTrustedProxyIp("10.0.0.2", ["10.0.0.1/32"])).toBe(false);
    expect(isTrustedProxyIp("8.8.8.8", ["0.0.0.0/0"])).toBe(true);
  });

  it("matches IPv6 and IPv6 CIDR", () => {
    expect(isTrustedProxyIp("::1", ["::1"])).toBe(true);
    expect(isTrustedProxyIp("2001:db8:1::5", ["2001:db8::/32"])).toBe(true);
    expect(isTrustedProxyIp("2001:db9:1::5", ["2001:db8::/32"])).toBe(false);
  });

  it("normalises IPv4-mapped IPv6 addresses", () => {
    expect(isTrustedProxyIp("::ffff:10.0.0.5", ["10.0.0.0/8"])).toBe(true);
    expect(isTrustedProxyIp("10.0.0.5", ["::ffff:10.0.0.0/104"])).toBe(true);
  });

  it('honours the "all" sentinel and an empty list', () => {
    expect(isTrustedProxyIp("203.0.113.9", "all")).toBe(true);
    expect(isTrustedProxyIp("203.0.113.9", [])).toBe(false);
  });

  it("ignores malformed entries instead of trusting everything", () => {
    expect(isTrustedProxyIp("10.0.0.1", ["10.0.0.0/99"])).toBe(false);
    expect(isTrustedProxyIp("10.0.0.1", ["not-an-ip"])).toBe(false);
  });
});
