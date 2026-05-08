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
        Promise.resolve({ _id: "user123", email: "test@example.com", permissions: [] }),
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
      (auth!.validateSession as any).mockResolvedValue({ success: true, data: mockUser });
      const event = createMockEvent("/dashboard", "valid-session-id");
      await handleAuthentication({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalled();
      expect(auth!.validateSession).toHaveBeenCalledWith("valid-session-id", { suppressErrorLog: true });
    });

    it("should delete invalid session cookie when auth is ready", async () => {
      (auth!.validateSession as any).mockImplementation(() => Promise.resolve({ success: true, data: null }));

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
      (auth!.validateSession as any).mockImplementation(() => Promise.resolve({ success: true, data: mockUser }));

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
      (auth!.validateSession as any).mockImplementation(() => Promise.resolve({ success: true, data: mockUser }));

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
});
