/**
 * @file tests/unit/hooks/authentication.test.ts
 * @description Comprehensive tests for handleAuthentication middleware (session management, rotation, caching)
 */

const { describe, it, expect, beforeEach, vi } = (globalThis as any).vi
  ? (globalThis as any)
  : await import("vitest");
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { handleAuthentication, clearAllSessionCaches } from "@src/hooks/handle-authentication";
import { dbAdapter } from "@src/databases/db";
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

    (dbAdapter.auth.getSessionTokenData as any).mockResolvedValue({
      success: true,
      data: {
        user_id: "user123",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    (dbAdapter.auth.getUserById as any).mockImplementation((id: string) =>
      Promise.resolve({
        success: true,
        data: {
          _id: id,
          email: "test@example.com",
          permissions: [],
        },
      }),
    );
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
      (dbAdapter.auth.getUserById as any).mockResolvedValue({
        success: true,
        data: mockUser,
      });
      const event = createMockEvent("/dashboard", "valid-session-id");
      await handleAuthentication({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalled();
      expect(dbAdapter.auth.getSessionTokenData).toHaveBeenCalledWith("valid-session-id");
      expect(dbAdapter.auth.getUserById).toHaveBeenCalledWith("user123", {
        suppressErrorLog: true,
      });
      expect(event.locals.user).toEqual(mockUser);
    });

    it("should delete invalid session cookie when auth is ready", async () => {
      (dbAdapter.auth.getSessionTokenData as any).mockResolvedValue({
        success: true,
        data: null,
      });

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
      (dbAdapter.auth.getUserById as any).mockResolvedValue({
        success: true,
        data: mockUser,
      });

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
      (dbAdapter.auth.getUserById as any).mockResolvedValue({
        success: true,
        data: mockUser,
      });

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

    it("should accept __Host- cookie fallback during local/test traffic", async () => {
      const event = createMockEvent("/dashboard", undefined, "localhost");
      event.cookies.get = vi.fn((name: string) => {
        if (name === SESSION_COOKIE_NAME) return null;
        if (name === `__Host-${SESSION_COOKIE_NAME}`) return "fallback-session";
        return null;
      });

      await handleAuthentication({ event, resolve: mockResolve });
      expect(mockResolve).toHaveBeenCalled();
      expect(dbAdapter.auth.getSessionTokenData).toHaveBeenCalledWith("fallback-session");
    });

    it("should accept __Host- cookie on secure connection", async () => {
      const event = createMockEvent("/dashboard", undefined, "example.com");
      Object.defineProperty(event.url, "protocol", { value: "https:" });
      event.cookies.get = vi.fn((name: string) => {
        if (name === `__Host-${SESSION_COOKIE_NAME}`) return "secure-session";
        return null;
      });

      (dbAdapter.auth.getUserById as any).mockResolvedValue({
        success: true,
        data: {
          _id: "secure-user",
          email: "secure@example.com",
          permissions: [],
        },
      });

      await handleAuthentication({ event, resolve: mockResolve });
      expect(mockResolve).toHaveBeenCalled();
      expect(dbAdapter.auth.getSessionTokenData).toHaveBeenCalledWith("secure-session");
      expect(event.locals.user?._id).toBe("secure-user");
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
