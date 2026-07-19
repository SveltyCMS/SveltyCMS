/**
 * @file src/utils/private-config-policy.ts
 * @description
 * Hard policy for bootstrap config files during tests vs live development.
 *
 * ### Rules
 * - **Local** (developer machine): tests, precheck, integration, local E2E, and
 *   benchmarks must **never create, overwrite, rename, or delete**
 *   `config/private.ts`. Source of truth for automated runs is
 *   `config/private.test.ts` only (Vite aliases `@config/private` → that file
 *   when `TEST_MODE` / `COMPILE_ALL_ADAPTERS` is set).
 * - **CI** (`CI=true` / `GITHUB_ACTIONS=true`): runners may write an ephemeral
 *   `config/private.ts` as a mirror of the test config. That file is never
 *   committed (gitignored / not pushed).
 *
 * ### Features:
 * - isCiRunner() detection
 * - assertLocalMustNotMutatePrivateTs() for writers
 */

/** True when running on GitHub Actions or other CI that may own private.ts. */
export function isCiRunner(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CI === "true" || env.GITHUB_ACTIONS === "true";
}

/**
 * Call before any code that would write `config/private.ts`.
 * Throws on local machines so developer live config cannot be clobbered.
 */
export function assertLocalMustNotMutatePrivateTs(
  action: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isCiRunner(env)) return;
  throw new Error(
    `[private-config-policy] Refused to ${action} config/private.ts on a local machine. ` +
      "Automated tests and precheck must use config/private.test.ts only. " +
      "CI may create an ephemeral private.ts (never committed).",
  );
}

/** Paths relative to repo root — for logging and docs. */
export const PRIVATE_CONFIG_LIVE = "config/private.ts";
export const PRIVATE_CONFIG_TEST = "config/private.test.ts";
