/**
 * @file tests/unit/security/test-mode-gate.test.ts
 * @description Production gate for `IS_TEST_MODE` (`resolveTestMode`).
 *
 * ### Features:
 * - A production server ignores TEST_MODE / VITE_TEST_MODE without a secret
 * - A non-empty TEST_API_SECRET or the explicit override enables it
 * - Development keeps the flag for the E2E preview servers
 * - No test flag means no bypass anywhere
 */

import { describe, expect, it } from "vitest";
import { resolveTestMode } from "@utils/hook-utils";

describe("resolveTestMode", () => {
  it("fails closed on a production server without a secret", () => {
    expect(
      resolveTestMode({ NODE_ENV: "production", TEST_MODE: "true", TEST_API_SECRET: "" }),
    ).toBe(false);
    expect(resolveTestMode({ NODE_ENV: "production", VITE_TEST_MODE: "true" })).toBe(false);
    expect(resolveTestMode({ NODE_ENV: "production", PLAYWRIGHT_TEST: "true" })).toBe(false);
  });

  it("honours a non-empty TEST_API_SECRET in production", () => {
    expect(
      resolveTestMode({ NODE_ENV: "production", TEST_MODE: "true", TEST_API_SECRET: "s3cret" }),
    ).toBe(true);
  });

  it("honours the explicit production override", () => {
    expect(
      resolveTestMode({
        NODE_ENV: "production",
        TEST_MODE: "true",
        ALLOW_TEST_MODE_IN_PROD: "true",
      }),
    ).toBe(true);
  });

  it("keeps the flag in development for the E2E preview servers", () => {
    expect(resolveTestMode({ NODE_ENV: "development", TEST_MODE: "true" })).toBe(true);
    expect(resolveTestMode({ TEST_MODE: "true" })).toBe(true);
  });

  it("requires a test flag", () => {
    expect(resolveTestMode({ NODE_ENV: "development" })).toBe(false);
    expect(resolveTestMode(undefined)).toBe(false);
  });
});
