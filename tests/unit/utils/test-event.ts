/**
 * @file tests/unit/utils/test-event.ts
 * @description Unified RequestEvent factory — single source of truth for all test event creation.
 *
 * Replaces scattered ad-hoc `createMockEvent()` functions across 20+ test files.
 * Every test that needs a RequestEvent should use this.
 *
 * ### Features:
 * - Automatic tenant, user, roles population
 * - Override any property via `overrides`
 * - Permission-aware: set user role and get correct permissions
 */

import type { RequestEvent } from "@sveltejs/kit";
import { PRIMARY_TENANT, USERS, ROLES } from "@tests/harness/fixtures";
import type { Role } from "@src/databases/auth/types";

export interface TestEventOverrides {
  path?: string;
  method?: string;
  user?: Partial<typeof USERS.admin> | null;
  role?: string;
  tenantId?: string;
  roles?: Partial<Role>[];
  isAdmin?: boolean;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

/**
 * Creates a fully-populated RequestEvent for test use.
 *
 * @example
 * // Admin accessing settings
 * const event = createTestEvent("system/settings", { role: "admin" });
 *
 * @example
 * // Unauthenticated request
 * const event = createTestEvent("public/page", { user: null });
 *
 * @example
 * // Cross-tenant spoofing attempt
 * const event = createTestEvent("collections/posts", {
 *   tenantId: "evil-tenant",
 *   user: USERS.editor,
 * });
 */
export function createTestEvent(
  path: string = "test",
  overrides: TestEventOverrides = {},
): RequestEvent {
  const method = overrides.method || "GET";
  const tenantId = overrides.tenantId || PRIMARY_TENANT;

  // Build user (null = unauthenticated)
  const userTemplate = overrides.user === null ? null : overrides.user || USERS.admin;

  const user = userTemplate
    ? {
        _id: userTemplate._id,
        email: userTemplate.email,
        role: overrides.role || userTemplate.role,
        username: userTemplate.username,
        isAdmin: overrides.isAdmin ?? (overrides.role === "admin" || userTemplate.isAdmin),
        tenantId,
      }
    : undefined;

  // Build roles
  const defaultRoles = user
    ? [
        {
          name: user.role,
          isAdmin: user.isAdmin,
          permissions: ROLES[user.role as keyof typeof ROLES]?.permissions || [],
        },
      ]
    : [];

  const roles = overrides.roles || defaultRoles;

  // Build URL
  const url = overrides.path
    ? new URL(`http://127.0.0.1:4173/${overrides.path.replace(/^\//, "")}`)
    : new URL(`http://127.0.0.1:4173/${path}`);

  // Build headers
  const requestHeaders = new Headers(overrides.headers || {});
  if (overrides.cookies) {
    const cookieStr = Object.entries(overrides.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    requestHeaders.set("cookie", cookieStr);
  }

  const cookieStore: Record<string, string> = { ...overrides.cookies };

  return {
    url,
    params: { path },
    request: new Request(url.toString(), {
      method,
      headers: requestHeaders,
    }),
    getClientAddress: () => "127.0.0.1",
    locals: {
      user,
      tenantId,
      roles,
      isAdmin: user?.isAdmin ?? false,
    },
    cookies: {
      get: (name: string) => cookieStore[name],
      getAll: () => Object.entries(cookieStore).map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => {
        cookieStore[name] = value;
      },
      delete: (name: string) => {
        delete cookieStore[name];
      },
      serialize: () => "",
    },
    platform: {},
    route: { id: `/api/${path}` },
    isDataRequest: false,
    isSubRequest: false,
  } as unknown as RequestEvent;
}
