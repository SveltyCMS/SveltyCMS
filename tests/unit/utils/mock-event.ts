/**
 * @file tests/unit/utils/mock-event.ts
 * @description Shared RequestEvent factory + thin catch-all API dispatcher caller for unit tests.
 *
 * Prefer this over per-file `createMockEvent` copies and over a full in-process HTTP client.
 * Speed is the same order as hand-rolled mocks; the win is consistency and less boilerplate.
 *
 * ### Features:
 * - CSRF double-submit defaults for state-changing methods
 * - Explicit `user: null` / `tenantId: null` for auth isolation tests
 * - Optional `__testBypass` (default true for unit dispatcher tests)
 * - `callApiDispatcher` / `invokeApi` / `expectApi` / `invokeGraphql`
 * - `mockFormData` for media/DAM multipart unit tests
 * - RBAC tables: see `rbac-matrix.ts` (`runRbacMatrix`)
 */

import { vi, expect } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { CSRF_TOKEN_HEADER, CSRF_TOKEN_COOKIE_NAME } from "@src/utils/security/csrf-utils";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface MockEventOptions {
  method?: HttpMethod | string;
  /** Full URL or path under /api/… (e.g. `http://localhost/api/user` or `/api/user`) */
  url?: string;
  /** API path without /api/ prefix (e.g. `user`, `ai/chat`). Overrides path derived from url. */
  path?: string;
  body?: unknown;
  /**
   * Optional FormData-like object (get/getAll/has) for multipart handlers.
   * When set, `request.formData()` resolves to this instead of building from `body`.
   * Prefer `mockFormData({ … })` helper.
   */
  formData?: {
    get: (k: string) => unknown;
    getAll: (k: string) => unknown[];
    has: (k: string) => boolean;
  };
  /** Pass `null` for unauthenticated. Omit for default admin-like user. */
  user?: Record<string, any> | null;
  /** Pass `null` for missing tenant. Omit for default `"t1"`. */
  tenantId?: string | null;
  roles?: Array<Record<string, unknown>>;
  dbAdapter?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  /** When true (default), sets locals.__testBypass for unit tests. */
  bypass?: boolean;
  /** Extra fields merged into locals (after core fields). */
  locals?: Record<string, unknown>;
}

/**
 * Minimal FormData-like bag for multipart handler unit tests (media/DAM).
 * Not a real browser FormData — only get/getAll/has.
 */
export function mockFormData(entries: Record<string, unknown>): {
  get: (k: string) => unknown;
  getAll: (k: string) => unknown[];
  has: (k: string) => boolean;
} {
  return {
    get: (key: string) => entries[key],
    getAll: (key: string) => {
      const v = entries[key];
      if (v === undefined) return [];
      return Array.isArray(v) ? v : [v];
    },
    has: (key: string) => key in entries,
  };
}

const DEFAULT_ADMIN = { _id: "u1", email: "test@example.com", isAdmin: true, role: "admin" };

/**
 * Creates a robust RequestEvent mock for use in API route unit tests.
 */
export function createMockRequestEvent(options: MockEventOptions = {}): RequestEvent {
  const method = (options.method || "GET").toUpperCase();
  const urlString = options.url
    ? options.url.startsWith("http")
      ? options.url
      : `http://localhost${options.url.startsWith("/") ? options.url : `/${options.url}`}`
    : options.path
      ? `http://localhost/api/${options.path.replace(/^\//, "")}`
      : "http://localhost/api/test";
  const url = new URL(urlString);
  const path =
    options.path?.replace(/^\/api\//, "").replace(/^\//, "") ||
    url.pathname.replace(/^\/api\//, "").replace(/^\//, "");

  const body = options.body ?? {};
  const user = "user" in options ? options.user : DEFAULT_ADMIN;
  const tenantId = "tenantId" in options ? options.tenantId : "t1";
  const roles =
    "roles" in options
      ? options.roles
      : user
        ? [
            {
              _id: "admin",
              name: "Administrator",
              isAdmin: true,
              permissions: [],
            },
          ]
        : [];
  const bypass = options.bypass !== false;

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

  const headersMap = new Map<string, string>();
  for (const [key, value] of Object.entries(mergedHeaders)) {
    headersMap.set(key.toLowerCase(), value);
  }

  return {
    url,
    params: { path },
    request: {
      method,
      headers: {
        get: vi.fn((name: string) => headersMap.get(name.toLowerCase()) ?? null),
        entries: vi.fn(() => headersMap.entries()),
        forEach: vi.fn((cb: any) => headersMap.forEach(cb)),
        has: vi.fn((name: string) => headersMap.has(name.toLowerCase())),
        [Symbol.iterator]: vi.fn(() => headersMap.entries()),
      },
      json: vi.fn().mockResolvedValue(body),
      formData: vi.fn().mockImplementation(async () => {
        if (options.formData) return options.formData;
        const fd = new FormData();
        if (typeof body === "object" && body !== null && !(body instanceof FormData)) {
          for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
            fd.append(k, v as string | Blob);
          }
        }
        return fd;
      }),
      blob: vi.fn(),
      text: vi.fn().mockResolvedValue(typeof body === "string" ? body : JSON.stringify(body ?? {})),
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
        media: {
          files: {
            getByFolder: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }),
            getByHash: vi.fn().mockResolvedValue({ success: true, data: null }),
            upload: vi.fn().mockResolvedValue({ success: true, data: { _id: "m1" } }),
            delete: vi.fn().mockResolvedValue({ success: true }),
          },
        },
        widgets: {},
        system: {
          preferences: { getMany: vi.fn().mockResolvedValue({ success: true, data: {} }) },
          widgets: { getActiveWidgets: vi.fn().mockResolvedValue({ success: true, data: [] }) },
        },
        crud: {
          findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
          findOne: vi.fn().mockResolvedValue({ success: true, data: null }),
        },
      },
      isAdmin: user?.isAdmin === true,
      ...(bypass ? { __testBypass: true } : {}),
      ...options.locals,
    },
    cookies: {
      get: vi.fn((name: string) => mergedCookies[name]),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(() => Object.entries(mergedCookies).map(([name, value]) => ({ name, value }))),
    },
    fetch: vi.fn(),
    getClientAddress: () => "127.0.0.1",
    isDataRequest: false,
    isSubRequest: false,
    platform: undefined,
    route: { id: "/api/[...path]" },
    setHeaders: () => {},
  } as unknown as RequestEvent;
}

let dispatcherCache: Record<
  HttpMethod,
  (event: RequestEvent) => Promise<Response> | Response
> | null = null;

/**
 * Lazy-load catch-all API handlers so `vi.mock` can run first.
 */
async function getDispatchers() {
  if (dispatcherCache) return dispatcherCache;
  const mod = await import("@src/routes/api/[...path]/+server");
  dispatcherCache = {
    GET: mod.GET,
    POST: mod.POST,
    PUT: mod.PUT,
    PATCH: mod.PATCH,
    DELETE: mod.DELETE,
  };
  return dispatcherCache;
}

/** Reset cached dispatcher after module resets in tests. */
export function resetApiDispatchers(): void {
  dispatcherCache = null;
}

/**
 * Invoke the production catch-all API dispatcher with a mock event.
 */
export async function callApiDispatcher(method: string, event: RequestEvent): Promise<Response> {
  const m = method.toUpperCase() as HttpMethod;
  const dispatchers = await getDispatchers();
  const handler = dispatchers[m] || dispatchers.GET;
  const response = await handler(event);
  if (!(response instanceof Response)) {
    throw new Error(`callApiDispatcher: expected Response, got ${typeof response}`);
  }
  return response;
}

/**
 * One-liner: build event + call dispatcher.
 *
 * @example
 * const res = await invokeApi("GET", { path: "user", user: admin });
 * expect(res.status).toBe(200);
 * expect(await res.json()).toMatchObject({ success: true });
 */
export async function invokeApi(
  method: HttpMethod | string,
  options: MockEventOptions = {},
): Promise<Response> {
  const event = createMockRequestEvent({ ...options, method });
  return callApiDispatcher(method, event);
}

/**
 * invokeApi + assert status (and optional JSON body). Keeps tests terse without a fat client.
 *
 * @example
 * const body = await expectApi("POST", { path: "ai/chat", user: null }, 401);
 */
export async function expectApi<T = unknown>(
  method: HttpMethod | string,
  options: MockEventOptions,
  expectedStatus: number | number[],
): Promise<{ response: Response; data: T }> {
  const response = await invokeApi(method, options);
  const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  expect(
    allowed,
    `expected status in [${allowed.join(", ")}], got ${response.status} for ${method} /api/${options.path ?? ""}`,
  ).toContain(response.status);

  let data = null as T;
  const ct = response.headers.get("content-type") || "";
  if (ct.includes("json")) {
    data = (await response.json()) as T;
  } else {
    const text = await response.text();
    data = (text ? text : null) as T;
  }
  return { response, data };
}

/**
 * Thin GraphQL POST helper (still catch-all /api/graphql — no second client).
 *
 * @example
 * const res = await invokeGraphql("{ __typename }", {}, { user: null, bypass: false });
 * expect(res.status).toBe(401);
 */
export async function invokeGraphql(
  query: string,
  variables: Record<string, unknown> = {},
  options: Omit<MockEventOptions, "path" | "body" | "method"> = {},
): Promise<Response> {
  return invokeApi("POST", {
    ...options,
    path: "graphql",
    body: { query, variables },
  });
}
