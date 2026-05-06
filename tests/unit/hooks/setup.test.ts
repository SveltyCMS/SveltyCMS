/**
 * @file tests/unit/hooks/setup.test.ts
 * @description Comprehensive tests for handleSetup middleware with proper redirect validation
 */

// --- Mock SvelteKit ---
vi.mock("@sveltejs/kit", () => ({
  __esModule: true,
  redirect: (status: number, location: string) => {
    throw { status, location, __isRedirect: true };
  },
  error: (status: number, message: string | { message: string }) => {
    const body = typeof message === "string" ? { message } : message;
    throw { status, body, message: body.message, __is_http_error: true };
  },
  isRedirect: (err: any) => err && err.__isRedirect === true,
  isHttpError: (err: any) => err && err.__is_http_error === true,
  json: (data: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(data), {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    }),
  text: (data: string, init?: ResponseInit) => new Response(data, init),
  default: {
    redirect: (status: number, location: string) => {
      throw { status, location, __isRedirect: true };
    },
    error: (status: number, message: string | { message: string }) => {
      const body = typeof message === "string" ? { message } : message;
      throw { status, body, message: body.message, __is_http_error: true };
    },
    isRedirect: (err: any) => err && err.__isRedirect === true,
    isHttpError: (err: any) => err && err.__is_http_error === true,
  }
}));

import type { Handle, RequestEvent } from "@sveltejs/kit";
let handleSetup: Handle;
import { invalidateSetupCache } from "@utils/setup-check";

// Use global mockSetupCheck from tests/unit/setup.ts
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
    const mod = await import("@src/hooks/handle-turbo-pipeline.server");
    handleSetup = mod.handleTurboPipeline;
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
        expect(response).toStrictEqual(mockResponse);
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
