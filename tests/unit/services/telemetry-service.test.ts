/**
 * @file tests/unit/services/telemetry-service.test.ts
 * @description Tests for telemetry service
 *
 * Tests:
 * - Environment checks
 * - Test mode detection
 * - CI detection
 * - Vitest detection
 * - Node env detection
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { telemetryService } from "@src/services/observability/telemetry-service";

// Boundary mock: the encryption path must not depend on worker-global DB state.
// A sibling test file can register a *disconnected* adapter on the global
// registry, which would make `dbAdapter.isConnected()` answer false and send
// `checkUpdateStatus` down the early-return branch before the payload is built.
vi.mock("@src/databases/db", () => ({
  getPrivateEnv: () => ({}),
  dbAdapter: {
    isConnected: () => true,
  },
}));

describe("TelemetryService Environment Checks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return test_mode status when TEST_MODE is true", async () => {
    vi.stubEnv("TEST_MODE", "true");
    const result = (await telemetryService.checkUpdateStatus()) as any;
    expect(result.status).toBe("test_mode");
  });

  it("should return test_mode status when CI is true", async () => {
    vi.stubEnv("CI", "true");
    const result = (await telemetryService.checkUpdateStatus()) as any;
    expect(result.status).toBe("test_mode");
  });

  it("should return test_mode status when VITEST is true", async () => {
    vi.stubEnv("VITEST", "true");
    const result = (await telemetryService.checkUpdateStatus()) as any;
    expect(result.status).toBe("test_mode");
  });

  it("should return test_mode status when NODE_ENV is test", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const result = (await telemetryService.checkUpdateStatus()) as any;
    expect(result.status).toBe("test_mode");
  });

  it("should not crash when checking status without env vars", async () => {
    vi.stubEnv("TEST_MODE", undefined);
    vi.stubEnv("CI", undefined);
    vi.stubEnv("VITEST", undefined);
    vi.stubEnv("NODE_ENV", undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await telemetryService.checkUpdateStatus();
    expect(result).toBeDefined();
    fetchSpy.mockRestore();
  });

  it("should encrypt telemetry payload using AES-256-GCM with themes included", async () => {
    vi.stubEnv("TEST_MODE", undefined);
    vi.stubEnv("CI", undefined);
    vi.stubEnv("VITEST", undefined);
    vi.stubEnv("NODE_ENV", "production");
    // CI sets `DO_NOT_TRACK=1` at the workflow level (ci.yml env) and the
    // service honours it by disabling telemetry — without clearing it the
    // encryption branch is never reached and this test only fails on CI.
    vi.stubEnv("DO_NOT_TRACK", undefined);
    vi.stubEnv("SVELTY_TELEMETRY_DISABLED", undefined);

    const settingsServiceMod = await import("@src/services/core/settings-service");
    vi.spyOn(settingsServiceMod, "getPrivateSetting").mockResolvedValue("test-client-secret-123");
    vi.spyOn(telemetryService, "register").mockResolvedValue("test-client-secret-123");
    let capturedBody: any = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (init?.body) {
        try {
          const parsed = JSON.parse(init.body as string);
          if (parsed.encrypted) {
            capturedBody = parsed;
          }
        } catch {}
      }
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await telemetryService.checkUpdateStatus();
    expect(capturedBody).toBeDefined();
    expect(capturedBody.encrypted).toBe(true);
    expect(typeof capturedBody.ciphertext).toBe("string");
    expect(typeof capturedBody.iv).toBe("string");
    expect(typeof capturedBody.tag).toBe("string");
    expect(typeof capturedBody.signature).toBe("string");

    // Decrypt using the test client secret to verify the decrypted payload
    const crypto = await import("node:crypto");
    const key = crypto.createHash("sha256").update("test-client-secret-123").digest();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(capturedBody.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(capturedBody.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(capturedBody.ciphertext, "base64")),
      decipher.final(),
    ]);
    const payload = JSON.parse(decrypted.toString("utf8"));

    expect(Array.isArray(payload.themes)).toBe(true);
    expect(payload.themes).toContain("default");
    expect(Array.isArray(payload.widgets)).toBe(true);
    expect(Array.isArray(payload.dashboard_widgets)).toBe(true);
    expect(Array.isArray(payload.plugins)).toBe(true);

    fetchSpy.mockRestore();
  });
});
