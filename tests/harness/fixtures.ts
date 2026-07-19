/**
 * @file tests/harness/fixtures.ts
 * @description Canonical deterministic fixtures for all test layers (unit, integration, E2E).
 *
 * Every test MUST use these fixtures for identity. Do not invent parallel admin emails.
 *
 * ### Design Principles
 * - Fixed, deterministic IDs — never Math.random() for fixture identity
 * - Credentials match CI seed / setup wizard / integration runner (single universe)
 * - Seeded data is immutable — tests receive a deep copy via cloneFixture()
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
// Canonical password (CI seed, setup wizard default, integration, E2E)
// ---------------------------------------------------------------------------

/** Shared test password — must satisfy PASSWORD_MIN_LENGTH + complexity. */
export const TEST_PASSWORD = "Password123!";

// ---------------------------------------------------------------------------
// Users (identity = admin@example.com universe used by /api/testing seed)
// ---------------------------------------------------------------------------

export const USERS = {
  admin: {
    _id: "user_00000000-0000-4000-a000-0000000000a1" as const,
    username: "admin",
    email: "admin@example.com",
    password: TEST_PASSWORD,
    role: "admin",
    isAdmin: true,
    tenantId: PRIMARY_TENANT,
  },
  developer: {
    _id: "user_00000000-0000-4000-a000-0000000000d1" as const,
    username: "developer",
    email: "developer@test.com",
    password: TEST_PASSWORD,
    role: "developer",
    isAdmin: false,
    tenantId: PRIMARY_TENANT,
  },
  editor: {
    _id: "user_00000000-0000-4000-a000-0000000000e1" as const,
    username: "editor",
    email: "editor@test.com",
    password: TEST_PASSWORD,
    role: "editor",
    isAdmin: false,
    tenantId: PRIMARY_TENANT,
  },
  viewer: {
    _id: "user_00000000-0000-4000-a000-0000000000v1" as const,
    username: "viewer",
    email: "viewer@test.com",
    password: TEST_PASSWORD,
    role: "viewer",
    isAdmin: false,
    tenantId: PRIMARY_TENANT,
  },
} as const;

/**
 * Login credentials for browser/API auth helpers.
 * Prefer these over hard-coding emails in specs.
 */
export const ADMIN_CREDENTIALS = {
  email: USERS.admin.email,
  password: USERS.admin.password,
  username: USERS.admin.username,
} as const;

export const EDITOR_CREDENTIALS = {
  email: USERS.editor.email,
  password: USERS.editor.password,
  username: USERS.editor.username,
} as const;

export const DEVELOPER_CREDENTIALS = {
  email: USERS.developer.email,
  password: USERS.developer.password,
  username: USERS.developer.username,
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
    permissions: ["manage:collection", "manage:media", "manage:widget", "read:system"] as const,
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
  validApiKey: "tkn_test_0000000000000000000000000000000000000000000000000000000000000001",
  expiredApiKey: "tkn_test_expired00000000000000000000000000000000000000000000000000001",
  invalidApiKey: "tkn_test_invalid00000000000000000000000000000000000000000000000000001",
} as const;

// ---------------------------------------------------------------------------
// Deep-copy helper (prevent test-to-test mutation leakage)
// ---------------------------------------------------------------------------

/** Returns a deep clone of any fixture object so tests can safely mutate their copy. */
export function cloneFixture<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
