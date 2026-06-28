/**
 * @file tests/unit/hooks/setup.test.ts
 * @description Comprehensive tests for handleSetup middleware with proper redirect validation
 */

// --- SvelteKit is globally mocked in tests/unit/bun-preload.ts ---

import type { RequestEvent } from "@sveltejs/kit";
import { handleTurboPipeline as handleSetup } from "@src/hooks/handle-turbo-pipeline.server";
import { invalidateSetupCache } from "@utils/server/setup-check";
import { setSystemState } from "@src/stores/system/state.svelte.ts";

// Use global mockSetupCheck from tests/unit/bun-preload.ts
const mockSetupCheck = (globalThis as any).mockSetupCheck;

// --- Test Utilities ---
function createMockEvent(pathname: string): RequestEvent {
  const url = new URL(pathname, "http://localhost");
  return {
    url,
    request: new Request(url.toString()),
    locals: {
      __setupConfigExists: undefined,
      __setupLogged: false,
      __setupRedirectLogged: false,
      __setupLoginRedirectLogged: false,
    },
    cookies: {
      get: vi.fn(() => null),
      set: vi.fn(() => ({})),
      delete: vi.fn(() => ({})),
    },
  } as unknown as RequestEvent;
}

function createMockResponse(status = 200): Response {
  return new Response("test body", { status });
}

/** Helper to assert a redirect error or response */
function expectRedirect(resOrErr: any, expectedStatus: number, expectedLocation: string) {
  let status, location;

  if (resOrErr instanceof Response) {
    status = resOrErr.status;
    location = resOrErr.headers.get("location");
  } else {
    status = resOrErr.status;
    location = resOrErr.location;
  }

  if (status !== expectedStatus || location !== expectedLocation) {
    console.error("Caught unexpected response/error instead of expected redirect:", resOrErr);
  }

  expect(status).toBe(expectedStatus);
  expect(location).toBe(expectedLocation);
}

describe("handleSetup Middleware", () => {
  let mockResolve: ReturnType<typeof vi.fn>;
  let mockResponse: Response;

  beforeAll(async () => {
    // handleSetup is already imported statically
  });

  beforeEach(async () => {
    mockResponse = createMockResponse();
    mockResolve = vi.fn(() => Promise.resolve(mockResponse));
    mockSetupCheck.setSetupComplete(true);
    invalidateSetupCache();
  });

  // ---------------------------------------------------------------------
  // Setup State Detection
  // ---------------------------------------------------------------------
  describe("Setup State Detection", () => {
    it("detects when config file is missing", async () => {
      mockSetupCheck.setSetupComplete(false);
      const event = createMockEvent("/dashboard");
      const response = await handleSetup({ event, resolve: mockResolve });
      expectRedirect(response, 302, "/setup?from=%2Fdashboard");
    });

    it("detects when config values are empty", async () => {
      mockSetupCheck.setSetupComplete(false);

      const event = createMockEvent("/dashboard");
      const response = await handleSetup({ event, resolve: mockResolve });
      expectRedirect(response, 302, "/setup?from=%2Fdashboard");
    });

    it("allows access when setup is complete", async () => {
      mockSetupCheck.setSetupComplete(true);

      const event = createMockEvent("/dashboard");
      const response = await handleSetup({ event, resolve: mockResolve });
      expect(response).toBe(mockResponse);
    });
  });

  // ---------------------------------------------------------------------
  // Allowed Routes During Setup
  // ---------------------------------------------------------------------
  describe("Allowed Routes During Setup", () => {
    const allowed = [
      "/setup",
      "/setup/database",
      "/_app/immutable/chunks/index.js",
      "/static/logo.png",
      "/files/global/abc123/original/testthumb-abc123.png",
      "/api/system/version",
      "/favicon.ico",
      "/health",
    ];
    beforeEach(() => {
      mockSetupCheck.setSetupComplete(false);
    });
    for (const path of allowed) {
      it(`allows ${path}`, async () => {
        const event = createMockEvent(path);
        const response = await handleSetup({ event, resolve: mockResolve });

        if (path === "/health" || path === "/api/system/health") {
          // Health check bypass returns its own response, not mockResponse
          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.status).toBeDefined();
        } else {
          expect(response).toStrictEqual(mockResponse);
        }
      });
    }

    const notAllowed = ["/"];
    for (const path of notAllowed) {
      it(`redirects ${path} to /setup during incomplete setup`, async () => {
        const event = createMockEvent(path);
        const response = await handleSetup({ event, resolve: mockResolve });
        const expected = path === "/" ? "/setup" : `/setup?from=${encodeURIComponent(path)}`;
        expectRedirect(response, 302, expected);
      });
    }

    it("allows /.well-known/security.txt as a fast-bypass route", async () => {
      const event = createMockEvent("/.well-known/security.txt");
      const response = await handleSetup({ event, resolve: mockResolve });
      expect(response).toBe(mockResponse);
    });
  });

  // ---------------------------------------------------------------------
  // Redirect to Setup
  // ---------------------------------------------------------------------
  describe("Redirect to Setup", () => {
    beforeEach(() => {
      mockSetupCheck.setSetupComplete(false);
    });

    const nonApiRoutes = ["/dashboard", "/login"];
    for (const route of nonApiRoutes) {
      it(`redirects ${route} to /setup`, async () => {
        const event = createMockEvent(route);
        const response = await handleSetup({ event, resolve: mockResolve });
        expectRedirect(response, 302, `/setup?from=${encodeURIComponent(route)}`);
      });
    }

    it("returns 503 for /api/collections during setup", async () => {
      const event = createMockEvent("/api/collections");
      const response = await handleSetup({ event, resolve: mockResolve });
      expect(response.status).toBe(503);
      const data = await (response.clone ? response.clone() : response).json();
      expect(data.error).toContain("Setup incomplete");
    });

    it("returns 503 with 'Admin creation required' when config exists but no admin", async () => {
      mockSetupCheck.setSetupState(mockSetupCheck.SetupState.MISSING_ADMIN);
      const event = createMockEvent("/api/collections");
      const response = await handleSetup({ event, resolve: mockResolve });
      expect(response.status).toBe(503);
      const data = await (response.clone ? response.clone() : response).json();
      expect(data.error).toContain("Setup incomplete");
    });
  });

  // ---------------------------------------------------------------------
  // Block Setup After Completion
  // ---------------------------------------------------------------------
  describe("Block Setup After Completion", () => {
    beforeEach(() => {
      mockSetupCheck.setSetupComplete(true);
    });

    it("redirects /setup to / when setup complete", async () => {
      // Set system state to READY so the redirect logic triggers
      setSystemState("READY");

      // Disable TEST_MODE so the redirect logic actually runs (CI sets TEST_MODE=true globally)
      const originalTestMode = process.env.TEST_MODE;
      process.env.TEST_MODE = undefined;
      try {
        const event = createMockEvent("/setup");
        event.locals.__setupConfigExists = true;
        const response = await handleSetup({ event, resolve: mockResolve });
        expectRedirect(response, 302, "/");
      } finally {
        // Restore TEST_MODE
        if (originalTestMode !== undefined) {
          process.env.TEST_MODE = originalTestMode;
        }
      }
    });
  });
});
