/**
 * @file tests/unit/utils/mock-event.ts
 * @description Centralized utility for creating Mock RequestEvents for API tests.
 * Standardizes CSRF, headers, and locals mocking to reduce boilerplate and prevent security middleware failures.
 */

import { vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { CSRF_TOKEN_HEADER, CSRF_TOKEN_COOKIE_NAME } from "@src/utils/security/csrf-utils";

export interface MockEventOptions {
  method?: string;
  url?: string;
  body?: any;
  user?: any;
  tenantId?: string;
  roles?: any[];
  dbAdapter?: any;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

/**
 * Creates a robust RequestEvent mock for use in API route tests.
 */
export function createMockRequestEvent(options: MockEventOptions = {}): RequestEvent {
  const method = options.method || "GET";
  const urlString = options.url || "http://localhost/api/test";
  const url = new URL(urlString);
  const path = url.pathname.replace("/api/", "");

  const body = options.body || {};
  const user =
    "user" in options ? options.user : { _id: "u1", email: "test@example.com", isAdmin: true };
  const tenantId = "tenantId" in options ? options.tenantId : "t1";
  const roles =
    "roles" in options
      ? options.roles
      : [{ _id: "admin", name: "Administrator", isAdmin: true, permissions: [] }];

  // Default CSRF token for state-changing methods if not provided
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const csrfToken = "mock-csrf-token-12345";

  const mergedHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...(isStateChanging ? { [CSRF_TOKEN_HEADER]: csrfToken } : {}),
    ...options.headers,
  };

  const mergedCookies: Record<string, string> = {
    ...(isStateChanging ? { [CSRF_TOKEN_COOKIE_NAME]: csrfToken } : {}),
    ...options.cookies,
  };

  const headersMap = new Map();
  for (const [key, value] of Object.entries(mergedHeaders)) {
    headersMap.set(key.toLowerCase(), value);
  }

  return {
    url,
    params: { path },
    request: {
      method,
      headers: {
        get: vi.fn((name: string) => headersMap.get(name.toLowerCase())),
        entries: vi.fn(() => headersMap.entries()),
        forEach: vi.fn((cb: any) => headersMap.forEach(cb)),
        has: vi.fn((name: string) => headersMap.has(name.toLowerCase())),
        [Symbol.iterator]: vi.fn(() => headersMap.entries()[Symbol.iterator]()),
      },
      json: vi.fn().mockResolvedValue(body),
      formData: vi.fn().mockImplementation(async () => {
        const fd = new FormData();
        if (typeof body === "object" && body !== null) {
          for (const [k, v] of Object.entries(body)) {
            fd.append(k, v as any);
          }
        }
        return fd;
      }),
      blob: vi.fn(),
      text: vi.fn().mockResolvedValue(JSON.stringify(body)),
      clone: vi.fn().mockReturnThis(),
    },
    locals: {
      user,
      tenantId,
      roles,
      dbAdapter: options.dbAdapter || {
        auth: {},
        collection: {
          getModel: vi.fn().mockResolvedValue({}),
        },
        collections: {},
        media: {},
        widgets: {},
        system: {},
        crud: {},
      },
      isAdmin: user?.isAdmin || false,
      __testBypass: true,
    },
    cookies: {
      get: vi.fn((name: string) => mergedCookies[name]),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(() => Object.entries(mergedCookies).map(([name, value]) => ({ name, value }))),
    },
    fetch: vi.fn(),
    isDataRequest: false,
    platform: {},
    route: { id: "/api/[...path]" },
  } as unknown as RequestEvent;
}
