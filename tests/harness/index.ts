/**
 * @file tests/harness/index.ts
 * @description Canonical test harness — single import for fixtures and contracts.
 *
 * Usage:
 * ```ts
 * import { PRIMARY_TENANT, USERS, ROLES, ADMIN_CREDENTIALS } from "@tests/harness";
 * ```
 *
 * Identity universe (all layers):
 * - admin@example.com / Password123!  (ADMIN_CREDENTIALS)
 * - editor@test.com / Password123!    (EDITOR_CREDENTIALS)
 *
 * For API unit tests, prefer `createMockRequestEvent` / `invokeApi` from
 * `tests/unit/utils/mock-event.ts` (shared event + thin dispatcher helper).
 *
 * No test file should invent its own tenant IDs, user fixtures, or mock data.
 */

export * from "./fixtures";
export * from "./contracts";
