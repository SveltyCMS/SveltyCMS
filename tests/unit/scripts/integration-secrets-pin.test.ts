/**
 * @file tests/unit/scripts/integration-secrets-pin.test.ts
 * @description Ensures integration TEST_API_SECRET is resolved once and shared
 * across private.test.ts content and server/test process env (no dual generation).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildIntegrationServerEnv,
  createIntegrationContext,
  DEFAULT_INTEGRATION_TEST_API_SECRET,
  getIntegrationTestApiSecret,
  pinIntegrationSecrets,
  resetPinnedIntegrationSecrets,
  resolveIntegrationSecrets,
  writePrivateTestConfig,
} from "../../../scripts/integration-harness.ts";

describe("integration secret pin (single-adapter HTTP)", () => {
  const prev = {
    TEST_API_SECRET: process.env.TEST_API_SECRET,
    JWT_SECRET_KEY: process.env.JWT_SECRET_KEY,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  };
  let tmpRoot: string;

  beforeEach(() => {
    resetPinnedIntegrationSecrets();
    delete process.env.TEST_API_SECRET;
    delete process.env.JWT_SECRET_KEY;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ADMIN_PASSWORD;
    tmpRoot = mkdtempSync(join(tmpdir(), "svelty-int-secrets-"));
  });

  afterEach(() => {
    resetPinnedIntegrationSecrets();
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("resolveIntegrationSecrets is stable across calls (no second random)", () => {
    const a = resolveIntegrationSecrets();
    const b = resolveIntegrationSecrets();
    // First call does not pin until pinIntegrationSecrets / createIntegrationContext
    expect(a.testApiSecret).toBe(DEFAULT_INTEGRATION_TEST_API_SECRET);
    expect(b.testApiSecret).toBe(a.testApiSecret);
  });

  it("pinIntegrationSecrets writes process.env once and ignores later regeneration", () => {
    const first = pinIntegrationSecrets();
    expect(process.env.TEST_API_SECRET).toBe(first.testApiSecret);

    process.env.TEST_API_SECRET = "SHOULD-NOT-WIN";
    const second = pinIntegrationSecrets();
    expect(second.testApiSecret).toBe(first.testApiSecret);
    expect(process.env.TEST_API_SECRET).toBe(first.testApiSecret);
  });

  it("createIntegrationContext + writePrivateTestConfig + serverEnv share one secret", () => {
    process.env.TEST_API_SECRET = "integration-secret-from-ci";
    const ctx = createIntegrationContext(tmpRoot, { dbType: "sqlite" });

    expect(ctx.secrets.testApiSecret).toBe("integration-secret-from-ci");
    expect(process.env.TEST_API_SECRET).toBe("integration-secret-from-ci");
    expect(getIntegrationTestApiSecret()).toBe("integration-secret-from-ci");

    writePrivateTestConfig(ctx);
    const file = readFileSync(join(tmpRoot, "config", "private.test.ts"), "utf8");
    expect(file).toContain('TEST_API_SECRET: "integration-secret-from-ci"');

    const env = buildIntegrationServerEnv(ctx);
    expect(env.TEST_API_SECRET).toBe("integration-secret-from-ci");
    expect(env.TEST_API_SECRET).toBe(ctx.secrets.testApiSecret);
  });

  it("default secret matches integration test helper fallback", () => {
    const ctx = createIntegrationContext(tmpRoot);
    expect(ctx.secrets.testApiSecret).toBe(DEFAULT_INTEGRATION_TEST_API_SECRET);
    const env = buildIntegrationServerEnv(ctx);
    expect(env.TEST_API_SECRET).toBe(DEFAULT_INTEGRATION_TEST_API_SECRET);
  });
});
