/**
 * @file tests/harness/index.ts
 * @description Canonical test harness — single import for fixtures and contracts.
 *
 * Usage:
 * ```ts
 * import { PRIMARY_TENANT, USERS, ROLES } from "@tests/harness";
 * ```
 *
 * For API unit tests, prefer `createMockRequestEvent` / `invokeApi` from
 * `tests/unit/utils/mock-event.ts` (shared event + thin dispatcher helper).
 *
 * No test file should invent its own tenant IDs, user fixtures, or mock data.
 */

export * from "./fixtures";
export * from "./contracts";
