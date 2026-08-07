/**
 * @file tests/unit/utils/setup-api-public-gate.test.ts
 * @description Ensures /api/setup/* is not classified as a public route after install
 * (CWE-306 unauthenticated setup complete → admin session).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const isSetupComplete = vi.fn(() => false);

vi.mock("@src/utils/setup-check-fast", () => ({
  isSetupComplete: () => isSetupComplete(),
  invalidateFastSetupCache: vi.fn(),
}));

// hook-utils imports ./setup-check-fast relative — mock both resolution paths
vi.mock("../../../src/utils/setup-check-fast", () => ({
  isSetupComplete: () => isSetupComplete(),
  invalidateFastSetupCache: vi.fn(),
}));

import { classifyRequest, isPublicRoute, isBootstrapRoute } from "@utils/hook-utils";

describe("setup API public classification (admin takeover defense)", () => {
  beforeEach(() => {
    isSetupComplete.mockReset();
    isSetupComplete.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("isBootstrapRoute still includes /api/setup (first-time install surface)", () => {
    expect(isBootstrapRoute("/api/setup/complete")).toBe(true);
    expect(isBootstrapRoute("/api/setup/seed-db")).toBe(true);
  });

  it("isPublicRoute does not treat /api/setup as a localized public path", () => {
    // Regression: [a-z]{2,5} matched "api" → /api/setup/* was public (CWE-306)
    expect(isPublicRoute("/api/setup/complete")).toBe(false);
    expect(isPublicRoute("/api/setup/seed-db")).toBe(false);
    expect(isPublicRoute("/api/setup")).toBe(false);
    expect(isPublicRoute("/api/send-mail")).toBe(false);
    expect(isPublicRoute("/api/sendMail")).toBe(false);
    // Real locale routes remain public
    expect(isPublicRoute("/en/setup")).toBe(true);
    expect(isPublicRoute("/de/login")).toBe(true);
  });

  it("classifyRequest treats /api/setup as public only while setup is incomplete", () => {
    isSetupComplete.mockReturnValue(false);
    const locals: any = {};
    const flags = classifyRequest("/api/setup/complete", locals);
    expect(flags.isBootstrap).toBe(true);
    expect(flags.isPublic).toBe(true);
  });

  it("classifyRequest locks /api/setup after setup is complete (not public)", () => {
    isSetupComplete.mockReturnValue(true);
    const locals: any = {};
    const flags = classifyRequest("/api/setup/complete", locals);
    expect(flags.isBootstrap).toBe(true);
    expect(flags.isPublic).toBe(false);
  });

  it("classifyRequest locks seed-db after setup is complete", () => {
    isSetupComplete.mockReturnValue(true);
    const locals: any = {};
    const flags = classifyRequest("/api/setup/seed-db", locals);
    expect(flags.isPublic).toBe(false);
  });

  it("does not force-public other bootstrap routes when setup is complete", () => {
    isSetupComplete.mockReturnValue(true);
    // /login remains public via isPublicRoute exact set
    const loginFlags = classifyRequest("/login", {} as any);
    expect(loginFlags.isPublic).toBe(true);
  });
});
