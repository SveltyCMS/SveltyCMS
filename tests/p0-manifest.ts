/**
 * @file tests/p0-manifest.ts
 * @description
 * P0 (Priority Zero) manifest — maps every P0 API/integration domain and E2E journey
 * to its corresponding test file(s). Used by the P0 registry and validation scripts
 * to ensure critical paths stay green.
 *
 * ### P0 API / Integration Domains (must stay green on all DBs)
 * ### P0 E2E Journeys (must stay green in CI)
 *
 * Reference: docs/tests/three-layer-completeness.mdx (lines 171-193)
 *
 * ### Features:
 * - typed manifest entries with domain, testFiles, and description
 * - separate exports for API domains and E2E journeys
 * - vitest-compatible (no bun:test imports)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface P0ManifestEntry {
  /** Short unique key for the P0 item */
  key: string;
  /** Human-readable domain or journey name */
  domain: string;
  /** Test file paths relative to project root */
  testFiles: string[];
  /** Brief description of what this P0 item covers */
  description: string;
  /** Whether this is an API/integration domain (vs E2E journey) */
  isApiDomain: boolean;
  /** Whether this is an E2E journey */
  isE2EJourney: boolean;
}

// ---------------------------------------------------------------------------
// P0 API / Integration Domains
// ---------------------------------------------------------------------------

export const P0_API_DOMAINS: P0ManifestEntry[] = [
  {
    key: "auth-login",
    domain: "Auth login/session",
    testFiles: [
      "tests/integration/api/user.test.ts",
      "tests/integration/api/auth-lockout.test.ts",
      "tests/integration/api/session-page-load.test.ts",
      "tests/integration/databases/contract.test.ts",
      "tests/unit/auth/session-cookies.test.ts",
    ],
    description:
      "Admin can login, get session cookie, reuse session on API and (app) __data page loads, wrong credentials rejected; loopback cookies never Secure/__Host-",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "webhooks-http",
    domain: "Webhooks HTTP (Testing 2026 reference)",
    testFiles: ["tests/integration/api/webhooks.test.ts"],
    description:
      "Admin list/create/delete webhooks via /api/webhooks; unauthenticated 401; editor without config:webhooks denied",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "automations-http",
    domain: "Automations HTTP",
    testFiles: ["tests/integration/api/automations.test.ts"],
    description: "Admin list/create/delete automations; unauth 401; editor denied on GET/POST",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "config-admin-surface",
    domain: "Config admin HTTP surface (trash/queue/workflows/sync/widgets/logs)",
    testFiles: [
      "tests/integration/api/config-admin-surface.test.ts",
      "tests/integration/api/collection-structure.test.ts",
    ],
    description:
      "Unauth 401 + admin GET for trash, system-jobs, workflows, config status, widgets list, logs; mutation unauth denials; collections structure readable",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "user-crud",
    domain: "User CRUD + batch",
    testFiles: [
      "tests/integration/api/user.test.ts",
      "tests/integration/api/user-extended.test.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "Admin can create users, perform batch operations (block/unblock), update user attributes",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "collections-crud",
    domain: "Collections content CRUD",
    testFiles: [
      "tests/integration/api/collections.test.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "Collections CRUD via config-sync, list collections, create and read entries, search",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "media-permissions",
    domain: "Media write/delete permissions",
    testFiles: [
      "tests/integration/api/media.test.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "Media upload requires media:write, delete requires media:delete, unauthenticated access rejected",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "setup-gating",
    domain: "Setup gating (post-complete blocked)",
    testFiles: [
      "tests/integration/api/setup-actions.test.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "After setup completes, /api/setup/complete and /api/setup/seed must be blocked with non-200 status",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "fail-closed",
    domain: "Fail-closed unknown / forbidden routes",
    testFiles: [
      "tests/integration/api/security-negative.test.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "Unknown API namespace → 403, unmapped sub-endpoint → 404, protected endpoint without auth → 401",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "multi-tenant",
    domain: "Multi-tenant isolation when MT enabled",
    testFiles: [
      "tests/integration/api/security-negative.test.ts",
      "tests/e2e/multi-tenancy/isolation.spec.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "Cross-tenant data access blocked via spoofed tenantId; tenant-scoped queries enforced",
    isApiDomain: true,
    isE2EJourney: false,
  },
];

// ---------------------------------------------------------------------------
// P0 E2E Journeys
// ---------------------------------------------------------------------------

export const P0_E2E_JOURNEYS: P0ManifestEntry[] = [
  {
    key: "e2e-setup-wizard",
    domain: "Setup wizard completes",
    testFiles: ["tests/e2e/routes/setup/setup-wizard.spec.ts"],
    description: "Full setup wizard flow completes successfully in CI",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-admin-login",
    domain: "Admin login → authenticated shell",
    testFiles: ["tests/e2e/routes/login/login.spec.ts", "tests/e2e/auth.setup.ts"],
    description:
      "Admin can login with valid credentials and reach the authenticated dashboard/shell",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-collection-builder",
    domain: "Collection builder: shell + golden journey",
    testFiles: [
      "tests/e2e/routes/collection-builder/builder.spec.ts",
      "tests/integration/api/collection-structure.test.ts",
      "tests/unit/routes/collectionbuilder-page-server.test.ts",
    ],
    description:
      "Shell: board/add-collection chrome. Golden: schema → entry → API. Structure/utils covered in unit+integration (not 9 E2E files).",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-entry-crud",
    domain: "Create/list entry on a collection",
    testFiles: [
      "tests/e2e/routes/collection-builder/builder.spec.ts",
      "tests/integration/api/collections.test.ts",
    ],
    description:
      "Golden E2E creates entry + API asserts content/status; collections HTTP integration for list/CRUD",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-logout",
    domain: "Logout / unauthenticated redirect",
    testFiles: ["tests/e2e/routes/login/login.spec.ts", "tests/e2e/auth.setup.ts"],
    description: "Logout from admin session and verify redirect to login page",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-permission-denial",
    domain: "Permission denial UI for non-admin",
    testFiles: [
      "tests/e2e/routes/system/permission-enforcement.spec.ts",
      "tests/e2e/routes/system/rbac.spec.ts",
    ],
    description: "Non-admin user sees permission denial UI / navigation restrictions",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-a11y-smoke",
    domain: "A11y smoke on login",
    testFiles: ["tests/e2e/routes/login/accessibility.spec.ts"],
    description: "Login page passes accessibility smoke test (keyboard nav, ARIA, contrast)",
    isApiDomain: false,
    isE2EJourney: true,
  },
];

// ---------------------------------------------------------------------------
// Combined manifest
// ---------------------------------------------------------------------------

export const P0_MANIFEST: P0ManifestEntry[] = [...P0_API_DOMAINS, ...P0_E2E_JOURNEYS];

/** Count of P0 API domains */
export const P0_API_DOMAIN_COUNT = P0_API_DOMAINS.length;

/** Count of P0 E2E journeys */
export const P0_E2E_JOURNEY_COUNT = P0_E2E_JOURNEYS.length;

/** Total P0 items */
export const P0_TOTAL_COUNT = P0_MANIFEST.length;
