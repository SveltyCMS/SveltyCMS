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

import { telemetryService } from "@src/services/observability/telemetry-service";

describe("TelemetryService Environment Checks", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return test_mode status when TEST_MODE is true", async () => {
    process.env.TEST_MODE = "true";
    const result = (await telemetryService.checkUpdateStatus()) as any;
    expect(result.status).toBe("test_mode");
  });

  it("should return test_mode status when CI is true", async () => {
    process.env.CI = "true";
    const result = (await telemetryService.checkUpdateStatus()) as any;
    expect(result.status).toBe("test_mode");
  });

  it("should return test_mode status when VITEST is true", async () => {
    process.env.VITEST = "true";
    const result = (await telemetryService.checkUpdateStatus()) as any;
    expect(result.status).toBe("test_mode");
  });

  it("should return test_mode status when NODE_ENV is test", async () => {
    process.env.NODE_ENV = "test";
    const result = (await telemetryService.checkUpdateStatus()) as any;
    expect(result.status).toBe("test_mode");
  });

  it("should not crash when checking status without env vars", async () => {
    delete process.env.TEST_MODE;
    delete process.env.CI;
    delete process.env.VITEST;
    delete process.env.NODE_ENV;
    const result = await telemetryService.checkUpdateStatus();
    expect(result).toBeDefined();
  });
});
