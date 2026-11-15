/**
 * @file tests/unit/services/stale-window.test.ts
 * @description Unit tests for the pure stale-while-revalidate window policy:
 * normalization/clamping, stale eligibility and the disclosure header.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_STALE_WINDOW_MS,
  parseCacheControlStalePolicy,
  resolveStaleWindow,
  shouldServeStale,
  staleResponseHeader,
  type StaleWindowPolicy,
} from "@src/services/cache/stale-window";

function policyFor(raw: unknown): StaleWindowPolicy {
  return resolveStaleWindow(raw);
}

describe("resolveStaleWindow", () => {
  it("disables the window for missing or unusable input", () => {
    const inputs: unknown[] = [undefined, null, "", NaN, Infinity, -Infinity, -5, "   ", "abc"];
    for (const raw of inputs) {
      const policy = policyFor(raw);
      expect(policy.enabled, `raw=${String(raw)}`).toBe(false);
      expect(policy.windowMs).toBe(0);
      expect(policy.source).toBe("default");
    }
  });

  it("treats an explicit zero as disabled", () => {
    for (const raw of [0, "0", " 0 "]) {
      const policy = policyFor(raw);
      expect(policy.enabled).toBe(false);
      expect(policy.windowMs).toBe(0);
    }
  });

  it("enables a positive window from a number or numeric string", () => {
    expect(policyFor(250)).toMatchObject({ windowMs: 250, enabled: true, source: "setting" });
    expect(policyFor("250")).toMatchObject({ windowMs: 250, enabled: true, source: "env" });
  });

  it("clamps values above the ceiling", () => {
    expect(policyFor(MAX_STALE_WINDOW_MS + 1).windowMs).toBe(MAX_STALE_WINDOW_MS);
    expect(policyFor(999_999).windowMs).toBe(MAX_STALE_WINDOW_MS);
    expect(policyFor(String(MAX_STALE_WINDOW_MS * 10))).toMatchObject({
      windowMs: MAX_STALE_WINDOW_MS,
      enabled: true,
    });
    expect(policyFor(MAX_STALE_WINDOW_MS).windowMs).toBe(MAX_STALE_WINDOW_MS);
  });
});

describe("shouldServeStale", () => {
  const policy = resolveStaleWindow(250);

  it("serves an entry younger than the window", () => {
    expect(shouldServeStale(0, policy)).toBe(true);
    expect(shouldServeStale(249, policy)).toBe(true);
  });

  it("rejects an entry at or beyond the window bound", () => {
    expect(shouldServeStale(250, policy)).toBe(false);
    expect(shouldServeStale(251, policy)).toBe(false);
  });

  it("fails closed on clock skew and non-finite ages", () => {
    expect(shouldServeStale(-1, policy)).toBe(false);
    expect(shouldServeStale(-0.5, policy)).toBe(false);
    expect(shouldServeStale(NaN, policy)).toBe(false);
    expect(shouldServeStale(Infinity, policy)).toBe(false);
    expect(shouldServeStale(-Infinity, policy)).toBe(false);
  });

  it("never serves stale on a disabled policy", () => {
    const disabled = resolveStaleWindow(0);
    expect(shouldServeStale(0, disabled)).toBe(false);
    expect(shouldServeStale(-0, disabled)).toBe(false);
    expect(shouldServeStale(1, disabled)).toBe(false);
  });
});

describe("staleResponseHeader", () => {
  const policy = resolveStaleWindow(250);

  it("returns null when the response is not stale", () => {
    expect(staleResponseHeader(false, policy)).toBeNull();
  });

  it("returns null when the window is disabled", () => {
    expect(staleResponseHeader(true, resolveStaleWindow(0))).toBeNull();
    expect(staleResponseHeader(false, resolveStaleWindow(0))).toBeNull();
  });

  it("discloses the applied window on a stale response", () => {
    expect(staleResponseHeader(true, policy)).toBe("stale; window=250");
    expect(staleResponseHeader(true, resolveStaleWindow("5000"))).toBe("stale; window=5000");
  });
});

describe("parseCacheControlStalePolicy", () => {
  it("stays disabled when the header is missing or has no stale directive", () => {
    for (const header of [undefined, null, "", "max-age=60", "public, max-age=120"]) {
      const policy = parseCacheControlStalePolicy(header);
      expect(policy.enabled).toBe(false);
      expect(policy.windowMs).toBe(0);
    }
  });

  it("parses stale-while-revalidate and max-stale seconds clamped to MAX_STALE_WINDOW_MS", () => {
    expect(parseCacheControlStalePolicy("max-age=60, stale-while-revalidate=2")).toMatchObject({
      enabled: true,
      windowMs: 2_000,
      source: "header",
    });
    expect(parseCacheControlStalePolicy("stale-while-revalidate")).toMatchObject({
      enabled: true,
      windowMs: MAX_STALE_WINDOW_MS,
      source: "header",
    });
    expect(parseCacheControlStalePolicy("max-stale=3, no-transform")).toMatchObject({
      enabled: true,
      windowMs: 3_000,
      source: "header",
    });
    expect(parseCacheControlStalePolicy("stale-while-revalidate=9999")).toMatchObject({
      enabled: true,
      windowMs: MAX_STALE_WINDOW_MS,
      source: "header",
    });
  });

  it("fails closed on no-store, no-cache, or max-age=0", () => {
    for (const header of [
      "no-store, stale-while-revalidate=30",
      "no-cache, stale-while-revalidate=30",
      "max-age=0, stale-while-revalidate=30",
    ]) {
      const policy = parseCacheControlStalePolicy(header);
      expect(policy.enabled).toBe(false);
      expect(policy.windowMs).toBe(0);
    }
  });
});
