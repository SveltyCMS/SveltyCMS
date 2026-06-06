/**
 * @file tests/harness/fixtures.ts
 * @description Canonical deterministic fixtures for all test layers.
 *
 * Every unit, integration, and E2E test MUST use these fixtures.
 * No test file should invent its own tenant IDs, user IDs, or seed data.
 *
 * ### Design Principles
 * - Fixed, deterministic IDs — never Math.random() or Date.now()
 * - Seeded data is immutable — tests receive a deep copy
 * - Multi-tenant ready — every fixture carries a tenantId
 */

import type { ISODateString } from "@src/content/types";

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export const TENANTS = {
  primary: {
    tenantId: "tenant_00000000-0000-4000-a000-000000000001" as const,
    name: "Primary Tenant",
  },
  secondary: {
    tenantId: "tenant_00000000-0000-4000-a000-000000000002" as const,
    name: "Secondary Tenant",
  },
} as const;

export const PRIMARY_TENANT = TENANTS.primary.tenantId;
export const SECONDARY_TENANT = TENANTS.secondary.tenantId;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const USERS = {
  admin: {
    _id: "user_00000000-0000-4000-a000-0000000000a1" as const,
    username: "testadmin",
    email: "admin@test.sveltycms.local",
    role: "admin",
    isAdmin: true,
    tenantId: PRIMARY_TENANT,
  },
  developer: {
    _id: "user_00000000-0000-4000-a000-0000000000d1" as const,
    username: "testdev",
    email: "dev@test.sveltycms.local",
    role: "developer",
    isAdmin: false,
    tenantId: PRIMARY_TENANT,
  },
  editor: {
    _id: "user_00000000-0000-4000-a000-0000000000e1" as const,
    username: "testeditor",
    email: "editor@test.sveltycms.local",
    role: "editor",
    isAdmin: false,
    tenantId: PRIMARY_TENANT,
  },
  viewer: {
    _id: "user_00000000-0000-4000-a000-0000000000v1" as const,
    username: "testviewer",
    email: "viewer@test.sveltycms.local",
    role: "viewer",
    isAdmin: false,
    tenantId: PRIMARY_TENANT,
  },
} as const;

// ---------------------------------------------------------------------------
// Roles & Permissions
// ---------------------------------------------------------------------------

export const ROLES = {
  admin: {
    _id: "role_admin",
    name: "admin",
    isAdmin: true,
    permissions: ["*"] as const,
  },
  developer: {
    _id: "role_developer",
    name: "developer",
    isAdmin: false,
    permissions: [
      "manage:collection",
      "manage:media",
      "manage:widget",
      "read:system",
    ] as const,
  },
  editor: {
    _id: "role_editor",
    name: "editor",
    isAdmin: false,
    permissions: ["manage:collection", "manage:media"] as const,
  },
  viewer: {
    _id: "role_viewer",
    name: "viewer",
    isAdmin: false,
    permissions: [] as const,
  },
} as const;

// ---------------------------------------------------------------------------
// Fixed timestamps (for deterministic tests)
// ---------------------------------------------------------------------------

export const FIXED_DATE = {
  now: "2026-06-06T12:00:00.000Z" as ISODateString,
  past: "2026-01-01T00:00:00.000Z" as ISODateString,
  future: "2026-12-31T23:59:59.000Z" as ISODateString,
} as const;

// ---------------------------------------------------------------------------
// Collection fixtures
// ---------------------------------------------------------------------------

export const COLLECTIONS = {
  posts: {
    _id: "col_00000000-0000-4000-a000-0000000000p1",
    name: "posts",
    label: "Posts",
    tenantId: PRIMARY_TENANT,
  },
  pages: {
    _id: "col_00000000-0000-4000-a000-0000000000p2",
    name: "pages",
    label: "Pages",
    tenantId: PRIMARY_TENANT,
  },
} as const;

// ---------------------------------------------------------------------------
// Token fixtures
// ---------------------------------------------------------------------------

export const TOKENS = {
  validApiKey:
    "tkn_test_0000000000000000000000000000000000000000000000000000000000000001",
  expiredApiKey:
    "tkn_test_expired00000000000000000000000000000000000000000000000000001",
  invalidApiKey:
    "tkn_test_invalid00000000000000000000000000000000000000000000000000001",
} as const;

// ---------------------------------------------------------------------------
// Test password (constant, never changes)
// ---------------------------------------------------------------------------

export const TEST_PASSWORD = "SveltyCMS_Test_2026!";

// ---------------------------------------------------------------------------
// Deep-copy helper (prevent test-to-test mutation leakage)
// ---------------------------------------------------------------------------

/** Returns a deep clone of any fixture object so tests can safely mutate their copy. */
export function cloneFixture<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
