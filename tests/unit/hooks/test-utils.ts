/**
 * @file tests/unit/hooks/test-utils.ts
 * @description Shared hook test utilities — eliminates repeated mock event creation across 12 files.
 */
import { vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { PRIMARY_TENANT } from "@tests/harness/fixtures";

export interface MockEventOptions {
  pathname?: string;
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string | null>;
  user?: any;
  tenantId?: string;
  protocol?: "http:" | "https:";
  hostname?: string;
  sessionCookie?: string | null;
  ip?: string;
  userAgent?: string;
}

/**
 * Single createMockEvent for all hook tests. Use this instead of ad-hoc factories.
 */
export function createMockEvent(
  pathname: string = "/dashboard",
  options: MockEventOptions = {},
): RequestEvent {
  const protocol = options.protocol || "http:";
  const host = options.hostname || "localhost";
  const url = new URL(pathname, `${protocol}//${host}`);

  const cookieStore: Record<string, string> = {};
  if (options.cookies) {
    for (const [k, v] of Object.entries(options.cookies)) {
      if (v !== null && v !== undefined) cookieStore[k] = v;
    }
  }
  if (options.sessionCookie) cookieStore[SESSION_COOKIE_NAME] = options.sessionCookie;

  return {
    url,
    request: new Request(url, {
      method: options.method || "GET",
      headers: {
        ...(options.ip ? { "x-forwarded-for": options.ip } : {}),
        ...(options.userAgent ? { "user-agent": options.userAgent } : {}),
        ...options.headers,
      },
    }),
    cookies: {
      get: vi.fn((name: string) => cookieStore[name] ?? null),
      getAll: vi.fn(() => Object.entries(cookieStore).map(([name, value]) => ({ name, value }))),
      set: vi.fn((name: string, value: string) => {
        cookieStore[name] = value;
      }),
      delete: vi.fn((name: string) => {
        delete cookieStore[name];
      }),
      serialize: vi.fn((name: string, value: string) => `${name}=${value}`),
    },
    locals: {
      user: options.user ?? null,
      tenantId: options.tenantId || PRIMARY_TENANT,
      isAdmin: options.user?.isAdmin ?? false,
      roles: options.user?.roles || [],
      cms: {
        auth: {},
        collections: {},
        media: {},
        widgets: {},
        system: {},
        db: {},
      },
    } as any,
    params: {},
    route: { id: pathname },
    getClientAddress: () => options.ip || "127.0.0.1",
    setHeaders: vi.fn(),
  } as unknown as RequestEvent;
}

/** Resolves with 200 OK by default — override per test if needed. */
export const mockResolve = vi.fn((_event: RequestEvent) =>
  Promise.resolve(new Response("OK", { status: 200 })),
);

/**
 * Creates an admin event with a valid session cookie.
 */
export function createAdminEvent(pathname = "/admin") {
  return createMockEvent(pathname, {
    protocol: "https:",
    sessionCookie: "valid-admin-session",
    user: {
      _id: "admin1",
      email: "admin@test.com",
      role: "admin",
      isAdmin: true,
      roles: [{ name: "admin", isAdmin: true, permissions: ["*"] }],
    },
  });
}

/**
 * Creates an unauthenticated event (no session, no user).
 */
export function createPublicEvent(pathname = "/api/test") {
  return createMockEvent(pathname, {
    sessionCookie: null,
    user: null,
    tenantId: PRIMARY_TENANT,
  });
}
