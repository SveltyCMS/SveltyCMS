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

// Boundary mock: the payload path must not depend on worker-global DB state.
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

  it("should send the documented plaintext payload contract with themes included", async () => {
    vi.stubEnv("TEST_MODE", undefined);
    vi.stubEnv("CI", undefined);
    vi.stubEnv("VITEST", undefined);
    vi.stubEnv("NODE_ENV", "production");
    // CI sets `DO_NOT_TRACK=1` at the workflow level (ci.yml env) and the
    // service honours it by disabling telemetry — without clearing it the
    // payload branch is never reached and this test only fails on CI.
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
          if (parsed.payload) {
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
    // Wire contract (telemetry-ecology.mdx §4): auth fields at the top level,
    // metrics in `payload`. The receiver validates `payload.current_version`
    // in plaintext, so the payload must NOT be replaced by a ciphertext
    // envelope (that answered 400 "Invalid version").
    expect(capturedBody.encrypted).toBeUndefined();
    expect(typeof capturedBody.signature).toBe("string");
    expect(typeof capturedBody.timestamp).toBe("number");
    expect(typeof capturedBody.payload.current_version).toBe("string");
    expect(typeof capturedBody.payload.installation_id).toBe("string");

    expect(Array.isArray(capturedBody.payload.themes)).toBe(true);
    expect(capturedBody.payload.themes).toContain("default");
    expect(Array.isArray(capturedBody.payload.widgets)).toBe(true);
    expect(Array.isArray(capturedBody.payload.dashboard_widgets)).toBe(true);
    expect(Array.isArray(capturedBody.payload.plugins)).toBe(true);

    fetchSpy.mockRestore();
  });
});
