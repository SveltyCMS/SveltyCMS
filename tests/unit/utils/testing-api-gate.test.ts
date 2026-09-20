/**
 * @file tests/unit/utils/testing-api-gate.test.ts
 * @description Security tests: /api/testing gate never opens in production or without secret.
 * Covers seed actions' shared fail-closed entry (assertTestingApiAllowed).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  assertTestingApiAllowed,
  isTestOrBenchmarkEnvironment,
  applyTestBypassFromRequest,
} from "@utils/test-bypass.server";

function req(secret?: string) {
  const headers = new Headers();
  if (secret) headers.set("x-test-secret", secret);
  return new Request("http://localhost/api/testing", { method: "POST", headers });
}

describe("assertTestingApiAllowed / isTestOrBenchmarkEnvironment", () => {
  beforeEach(() => {
    vi.stubEnv("TEST_MODE", undefined);
    vi.stubEnv("VITE_TEST_MODE", undefined);
    vi.stubEnv("PLAYWRIGHT_TEST", undefined);
    vi.stubEnv("BENCHMARK", undefined);
    vi.stubEnv("TEST_API_SECRET", undefined);
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies when no test flags are set", () => {
    expect(isTestOrBenchmarkEnvironment()).toBe(false);
    const gate = assertTestingApiAllowed(req("any"));
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.status).toBe(401);
  });

  it("denies bare NODE_ENV=test without TEST_MODE (no accidental backdoor)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TEST_API_SECRET", "s3cret");
    expect(isTestOrBenchmarkEnvironment()).toBe(false);
    const gate = assertTestingApiAllowed(req("s3cret"));
    expect(gate.allowed).toBe(false);
  });

  it("denies production even if TEST_MODE and secret are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TEST_MODE", "true");
    vi.stubEnv("TEST_API_SECRET", "prod-leak-secret");
    expect(isTestOrBenchmarkEnvironment()).toBe(false);
    const gate = assertTestingApiAllowed(req("prod-leak-secret"));
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.status).toBe(403);
      expect(gate.code).toBe("TESTING_DISABLED_PRODUCTION");
    }
    // Bypass must also stay closed
    expect(applyTestBypassFromRequest(req("prod-leak-secret"), {} as App.Locals)).toBe(false);
  });

  it("denies TEST_MODE without secret header", () => {
    vi.stubEnv("TEST_MODE", "true");
    vi.stubEnv("TEST_API_SECRET", "valid-secret");
    const gate = assertTestingApiAllowed(req());
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("TESTING_SECRET_MISSING");
  });

  it("denies wrong secret", () => {
    vi.stubEnv("TEST_MODE", "true");
    vi.stubEnv("TEST_API_SECRET", "valid-secret");
    const gate = assertTestingApiAllowed(req("wrong-secret"));
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("TESTING_SECRET_INVALID");
  });

  it("allows only with TEST_MODE + matching secret", () => {
    vi.stubEnv("TEST_MODE", "true");
    vi.stubEnv("TEST_API_SECRET", "valid-secret");
    const gate = assertTestingApiAllowed(req("valid-secret"));
    expect(gate).toEqual({ allowed: true });
  });

  it("rejects well-known default e2e secret string in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TEST_MODE", "true");
    vi.stubEnv("TEST_API_SECRET", "SVELTYCMS_TEST_SECRET_2026");
    expect(assertTestingApiAllowed(req("SVELTYCMS_TEST_SECRET_2026")).allowed).toBe(false);
  });
});
