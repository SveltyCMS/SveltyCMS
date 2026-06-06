/**
 * @file tests/harness/index.ts
 * @description Canonical test harness — single import for all test infrastructure.
 *
 * Usage:
 * ```ts
 * import { fixture, contract, cloneFixture } from "@tests/harness";
 * ```
 *
 * This is the ONLY import test files should need for fixtures and contracts.
 * No test file should define its own tenant IDs, user fixtures, or mock data.
 */

export * from "./fixtures";
export * from "./contracts";
