/**
 * @file tests/unit/server/preflight.test.ts
 * @description Unit tests for production boot preflight checks.
 */

import { describe, it, expect } from "vitest";
import { checkProductionPreflight } from "@src/server/preflight";

const VALID_32 = "a".repeat(32);
const VALID_32_ALT = "b".repeat(32);
const VALID_32_ENC = "c".repeat(32);

describe("checkProductionPreflight", () => {
  it("skips checks outside production", () => {
    const res = checkProductionPreflight({ NODE_ENV: "development" });
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("fails when required secrets are missing or too short in production", () => {
    const res = checkProductionPreflight({
      NODE_ENV: "production",
      JWT_SECRET_KEY: "short",
    });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("fails when RATE_LIMIT_SECRET equals JWT_SECRET_KEY", () => {
    const res = checkProductionPreflight({
      NODE_ENV: "production",
      JWT_SECRET_KEY: VALID_32,
      ENCRYPTION_KEY: VALID_32_ENC,
      RATE_LIMIT_SECRET: VALID_32,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("distinct"))).toBe(true);
  });

  it("requires ORIGIN for node adapter and explicit opt-in for unbounded sessions", () => {
    const res = checkProductionPreflight({
      NODE_ENV: "production",
      ADAPTER: "node",
      JWT_SECRET_KEY: VALID_32,
      ENCRYPTION_KEY: VALID_32_ENC,
      RATE_LIMIT_SECRET: VALID_32_ALT,
      SESSION_MAX_PER_USER: "0",
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("ORIGIN"))).toBe(true);
    expect(res.errors.some((e) => e.includes("ALLOW_UNBOUNDED_SESSIONS"))).toBe(true);
  });

  it("passes when all production invariants are satisfied", () => {
    const res = checkProductionPreflight({
      NODE_ENV: "production",
      ADAPTER: "node",
      ORIGIN: "https://cms.example.com",
      JWT_SECRET_KEY: VALID_32,
      ENCRYPTION_KEY: VALID_32_ENC,
      RATE_LIMIT_SECRET: VALID_32_ALT,
      SESSION_MAX_PER_USER: "5",
    });
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("allows pre-setup and config-file production boots unless env secrets are weak", () => {
    expect(checkProductionPreflight({ NODE_ENV: "production" }, { setupComplete: false }).ok).toBe(
      true,
    );
    expect(
      checkProductionPreflight({ NODE_ENV: "production" }, { allowConfigFileSecrets: true }).ok,
    ).toBe(true);
    expect(
      checkProductionPreflight(
        { NODE_ENV: "production", JWT_SECRET_KEY: "weak" },
        { allowConfigFileSecrets: true },
      ).ok,
    ).toBe(false);
    expect(checkProductionPreflight({ NODE_ENV: "production", TEST_MODE: "true" }).ok).toBe(true);
  });
});
