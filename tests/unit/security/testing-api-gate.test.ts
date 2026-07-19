/**
 * @file tests/unit/security/testing-api-gate.test.ts
 * @description Runtime gate tests for /api/testing — no backdoor without harness env + secret.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("testing API runtime gate", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...envSnapshot, NODE_ENV: "production" };
    delete process.env.TEST_MODE;
    delete process.env.BENCHMARK;
    delete process.env.SVELTY_BENCHMARK_SUITE;
    delete process.env.TEST_API_SECRET;
    delete process.env.VITE_TEST_MODE;
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.resetModules();
  });

  it("rejects hardcoded benchmark secret when harness env is unset", async () => {
    const event = {
      request: new Request("http://localhost/api/testing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": "SVELTYCMS_TEST_SECRET_2026",
        },
        body: JSON.stringify({ action: "seed", email: "a@b.com", password: "x" }),
      }),
      url: new URL("http://localhost/api/testing"),
    } as any;

    const { handleTestingRoutes } = await import("@src/routes/api/[...path]/handlers/testing");

    // Production NODE_ENV hard-closes with 403 (not 401) — fail-closed, no backdoor
    await expect(handleTestingRoutes(event, {} as any, "global" as any, [])).rejects.toMatchObject({
      status: 403,
      code: "TESTING_DISABLED_PRODUCTION",
    });
  });

  it("rejects wrong secret even when BENCHMARK is set", async () => {
    process.env.NODE_ENV = "test";
    process.env.BENCHMARK = "true";
    process.env.TEST_API_SECRET = "correct-secret";

    const event = {
      request: new Request("http://localhost/api/testing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": "wrong-secret",
        },
        body: JSON.stringify({ action: "seed", email: "a@b.com", password: "x" }),
      }),
      url: new URL("http://localhost/api/testing"),
    } as any;

    const { handleTestingRoutes } = await import("@src/routes/api/[...path]/handlers/testing");

    await expect(handleTestingRoutes(event, {} as any, "global" as any, [])).rejects.toMatchObject({
      status: 401,
    });
  });
});
