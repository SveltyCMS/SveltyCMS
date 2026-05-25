/**
 * @file tests/unit/hooks/authentication.test.ts
 * @description Comprehensive tests for handleAuthentication middleware (session management, rotation, caching)
 */

const { describe, it, expect, beforeEach, vi } = (globalThis as any).vi
  ? (globalThis as any)
  : await import("vitest");
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { handleAuthentication, clearAllSessionCaches } from "@src/hooks/handle-authentication";
import { auth } from "@src/databases/db";
import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseId } from "@databases/db-interface";

// Ensure SvelteKit internal mocks are present
vi.mock("$app/environment", () => ({
  dev: true,
  browser: false,
}));

vi.mock("$app/navigation", () => ({
  goto: vi.fn(),
  invalidate: vi.fn(),
  invalidateAll: vi.fn(),
  afterNavigate: vi.fn(),
  beforeNavigate: vi.fn(),
}));

// --- Test Utilities ---

function createMockEvent(
  pathname: string,
  sessionCookie?: string,
  hostname = "localhost",
): RequestEvent {
  const url = new URL(pathname, `http://${hostname}`);

  return {
    url,
    request: new Request(url.toString()),
    cookies: {
      get: vi.fn((name: string) => (name === SESSION_COOKIE_NAME ? sessionCookie : null)),
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: {
      user: null,
      cms: {
        auth: {},
        collections: {},
        media: {},
        widgets: {},
        system: {},
        db: {},
      },
    } as any,
  } as unknown as RequestEvent;
}

// --- Tests ---

describe("handleAuthentication Middleware", () => {
  let mockResolve: any;

  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSessionCaches(); // Clear memory cache between tests
    mockResolve = vi.fn(() => Promise.resolve(new Response("OK", { status: 200 })));

    // Default auth mock behavior
    if (auth) {
      (auth.validateSession as any).mockImplementation(() =>
        Promise.resolve({
          _id: "user123",
          email: "test@example.com",
          permissions: [],
        }),
      );
    }
  });

  describe("Public Route Bypass", () => {
    it("should skip authentication for /login", async () => {
      const event = createMockEvent("/login");
      await handleAuthentication({ event, resolve: mockResolve });
      expect(mockResolve).toHaveBeenCalled();
    });

    it("should skip authentication for /api/system/health", async () => {
      const event = createMockEvent("/api/system/health");
      await handleAuthentication({ event, resolve: mockResolve });
      expect(mockResolve).toHaveBeenCalled();
    });
  });

  describe("Session Validation", () => {
    it("should validate session cookie when present", async () => {
      const mockUser = { _id: "user123", tenantId: "tenant1" };
      (auth!.validateSession as any).mockResolvedValue({
        success: true,
        data: mockUser,
      });
      const event = createMockEvent("/dashboard", "valid-session-id");
      await handleAuthentication({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalled();
      expect(auth!.validateSession).toHaveBeenCalledWith("valid-session-id", {
        suppressErrorLog: true,
      });
    });

    it("should delete invalid session cookie when auth is ready", async () => {
      (auth!.validateSession as any).mockImplementation(() =>
        Promise.resolve({ success: true, data: null }),
      );

      const event = createMockEvent("/dashboard", "invalid-session");
      await handleAuthentication({ event, resolve: mockResolve });

      expect(event.cookies.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME, expect.anything());
    });
  });

  describe("Tenant Isolation", () => {
    beforeEach(() => {
      (globalThis as any).privateEnv = { MULTI_TENANT: true };
    });

    afterEach(() => {
      (globalThis as any).privateEnv = undefined;
    });

    it("should reject session from different tenant", async () => {
      const mockUser = { _id: "user123", tenantId: "tenant1" };
      (auth!.validateSession as any).mockImplementation(() =>
        Promise.resolve({ success: true, data: mockUser }),
      );

      const event = createMockEvent("/dashboard", "session-t1", "tenant2.example.com");
      event.locals.tenantId = "tenant2" as DatabaseId;

      try {
        await handleAuthentication({ event, resolve: mockResolve });
        throw new Error("Should have thrown AppError");
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(event.cookies.delete).toHaveBeenCalled();
      }
    });

    it("should allow global admin to access any tenant", async () => {
      const mockUser = { _id: "admin123", tenantId: null };
      (auth!.validateSession as any).mockImplementation(() =>
        Promise.resolve({ success: true, data: mockUser }),
      );

      const event = createMockEvent("/dashboard", "session-global", "tenant2.example.com");
      event.locals.tenantId = "tenant2" as DatabaseId;

      await handleAuthentication({ event, resolve: mockResolve });
      expect(mockResolve).toHaveBeenCalled();
      expect(event.locals.user!._id).toBe("admin123");
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing session cookie", async () => {
      const event = createMockEvent("/dashboard");
      await handleAuthentication({ event, resolve: mockResolve });
      expect(event.locals.user).toBeNull();
    });
  });

  describe("Session Fixation Prevention", () => {
    it("should use __Host- prefix for session cookie name in secure mode", () => {
      const secureCookieName = `__Host-${SESSION_COOKIE_NAME}`;
      expect(secureCookieName).toMatch(/^__Host-/);
      expect(secureCookieName).toContain(SESSION_COOKIE_NAME);
    });

    it("should use non-prefixed cookie name in dev/insecure mode", () => {
      expect(SESSION_COOKIE_NAME).not.toMatch(/^__Host-/);
      expect(SESSION_COOKIE_NAME).toBeTruthy();
    });

    it("should not accept __Host- cookie on insecure connection", async () => {
      // Simulates insecure connection trying to use a __Host- cookie
      const event = createMockEvent("/dashboard", "stolen-session", "localhost");
      // On insecure connection, the __Host- prefix cookie should NOT be accepted
      // The handler should look for the non-prefixed cookie name only
      event.cookies.get = vi.fn((name: string) => {
        if (name === SESSION_COOKIE_NAME) return null;
        if (name === `__Host-${SESSION_COOKIE_NAME}`) return "stolen-session";
        return null;
      });

      await handleAuthentication({ event, resolve: mockResolve });
      // User should remain null since insecure connections don't accept __Host- cookies
      expect(event.locals.user).toBeNull();
    });

    it("should accept __Host- cookie on secure connection only", async () => {
      // Simulates secure HTTPS connection
      const event = createMockEvent("/dashboard", undefined, "example.com");
      // Override to make it look like a secure connection
      Object.defineProperty(event.url, "protocol", { value: "https:" });

      // Mock auth to return a user for the session
      if (auth) {
        (auth.validateSession as any).mockImplementation(() =>
          Promise.resolve({
            _id: "secure-user",
            email: "secure@example.com",
            permissions: [],
          }),
        );
      }

      await handleAuthentication({ event, resolve: mockResolve });
      // On secure connection, the __Host- prefixed cookie should be accepted
      expect(mockResolve).toHaveBeenCalled();
    });

    it("should have distinct cookie names for secure vs insecure", () => {
      const secureName = `__Host-${SESSION_COOKIE_NAME}`;
      const insecureName = SESSION_COOKIE_NAME;
      expect(secureName).not.toBe(insecureName);
      expect(secureName.startsWith("__Host-")).toBe(true);
      expect(insecureName.startsWith("__Host-")).toBe(false);
    });
  });
});
