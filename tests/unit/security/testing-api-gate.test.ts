/**
 * @file tests/unit/security/testing-api-gate.test.ts
 * @description Runtime gate tests for /api/testing — no backdoor without harness env + secret.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleTestingRoutes } from "@src/routes/api/[...path]/handlers/testing";

describe("testing API runtime gate", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TEST_MODE", undefined);
    vi.stubEnv("BENCHMARK", undefined);
    vi.stubEnv("TEST_API_SECRET", undefined);
    vi.stubEnv("VITE_TEST_MODE", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

    // Production NODE_ENV hard-closes with 403 (not 401) — fail-closed, no backdoor
    await expect(handleTestingRoutes(event, {} as any, "global" as any, [])).rejects.toMatchObject({
      status: 403,
      code: "TESTING_DISABLED_PRODUCTION",
    });
  });

  it("rejects wrong secret even when BENCHMARK is set", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BENCHMARK", "true");
    vi.stubEnv("TEST_API_SECRET", "correct-secret");

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

    await expect(handleTestingRoutes(event, {} as any, "global" as any, [])).rejects.toMatchObject({
      status: 401,
    });
  });
});
