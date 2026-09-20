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
});
