/**
 * @file tests/unit/hooks/system-state-security.test.ts
 * @description Security-focused tests for handleSystemState host validation.
 *
 * Features:
 * - Localhost trust validation
 * - Configured host validation (HOST_DEV/HOST_PROD)
 * - Untrusted host blocking (403)
 * - Bootstrap route allowing/blocking
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { setSystemState, resetSystemState, updateServiceHealth } from "@src/stores/system/state";

// Disable TEST_MODE early to run hook logic
const originalTestMode = process.env.TEST_MODE;
process.env.TEST_MODE = "false";

import { handleSystemState } from "@src/hooks/handle-system-state";
import { isSetupComplete } from "@src/utils/setup-check";

// Mock setup check to control bootstrap behavior
vi.mock("@src/utils/setup-check", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    isSetupComplete: vi.fn(() => true),
  };
});

/**
 * Helper to create a minimal RequestEvent for testing
 */
function createMockEvent(pathname: string, host: string = "localhost"): RequestEvent {
  return {
    url: new URL(`http://${host}${pathname}`),
    request: new Request(`http://${host}${pathname}`),
    params: {},
    route: { id: pathname },
    locals: {},
    cookies: {
      get: () => undefined,
      set: () => {},
      delete: () => {},
      serialize: () => "",
      getAll: () => [],
    },
    fetch: global.fetch,
    getClientAddress: () => "127.0.0.1",
    platform: undefined,
    isDataRequest: false,
    isSubRequest: false,
    setHeaders: () => {},
  } as unknown as RequestEvent;
}

const mockResolve = vi.fn(() => Promise.resolve(new Response("OK", { status: 200 })));

describe("handleSystemState - Host Validation Security", () => {
  beforeEach(() => {
    resetSystemState();
    mockResolve.mockClear();

    // Reset healthy status to all services
    const services = ["database", "auth", "cache", "contentSystem", "themeManager", "widgets"];
    for (const s of services) {
      updateServiceHealth(s as any, "healthy", "Mocked");
    }

    // Set default test hosts
    process.env.HOST_PROD = "sveltycms.com";
    process.env.HOST_DEV = "dev.sveltycms.com";

    // Ensure TEST_MODE is disabled for hook logic
    process.env.TEST_MODE = "false";
  });

  afterAll(() => {
    process.env.TEST_MODE = originalTestMode;
  });

  it("should allow bootstrap routes on localhost in any state (dev)", async () => {
    setSystemState("IDLE");
    const event = createMockEvent("/setup", "localhost:5173");
    const response = await handleSystemState({ event, resolve: mockResolve });
    expect(response.status).toBe(200);
  });

  it("should allow bootstrap routes on configured HOST_DEV in dev mode", async () => {
    // Note: The 'dev' variable from $app/environment is usually true in tests
    setSystemState("IDLE");
    const event = createMockEvent("/setup", "dev.sveltycms.com");
    const response = await handleSystemState({ event, resolve: mockResolve });
    expect(response.status).toBe(200);
  });

  it("should block bootstrap routes on untrusted hosts during restricted states", async () => {
    setSystemState("IDLE");
    const event = createMockEvent("/setup", "attacker.com");

    try {
      await handleSystemState({ event, resolve: mockResolve });
      expect(true).toBe(false); // Should not reach here
    } catch (err: any) {
      // SvelteKit error() throws an object with status and body
      expect(err.status).toBe(403);
      expect(err.body.message).toContain("Access from untrusted host blocked");
    }
  });

  it("should allow /api/auth routes as they are now bootstrap routes", async () => {
    setSystemState("MAINTENANCE");
    const event = createMockEvent("/api/auth/session", "localhost");
    const response = await handleSystemState({ event, resolve: mockResolve });
    expect(response.status).toBe(200);
  });

  it("should block non-bootstrap routes during MAINTENANCE even on trusted host", async () => {
    setSystemState("MAINTENANCE");
    const event = createMockEvent("/api/content/entries", "localhost");

    // API routes return error Response via handleApiError
    const response = await handleSystemState({ event, resolve: mockResolve });
    expect(response.status).toBe(503);
    // Check that it's a JSON error response
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("SYSTEM_MAINTENANCE");
  });

  it("should allow /api/content/version if it is added to bootstrap routes", async () => {
    setSystemState("IDLE");
    const event = createMockEvent("/api/content/version", "localhost");
    const response = await handleSystemState({ event, resolve: mockResolve });
    expect(response.status).toBe(200);
  });

  it("should correctly handle SETUP state with root redirect", async () => {
    vi.mocked(isSetupComplete).mockReturnValue(false);
    setSystemState("SETUP");
    const event = createMockEvent("/", "localhost");
    const response = await handleSystemState({ event, resolve: mockResolve });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/setup");
  });
});
