/**
 * @file src/utils/private-config-policy.ts
 * @description
 * Hard policy for bootstrap config files: live vs automated testing.
 *
 * ### Rules (non-negotiable)
 * 1. **`config/private.ts` is live developer / production bootstrap only.**
 *    Automated local work must **never read, write, or connect through it** —
 *    doing so can wipe or corrupt real data.
 * 2. **Local automated runs** (precheck, unit, integration, E2E, benchmarks,
 *    COMPILE_ALL_ADAPTERS builds) use **`config/private.test.ts` only**.
 * 3. **CI** (`CI=true` / `GITHUB_ACTIONS=true`) may create an ephemeral
 *    `config/private.ts` as a mirror of the test config on the runner.
 *    That file is never committed or pushed.
 *
 * ### Features:
 * - isCiRunner / isAutomatedTestHarness detection
 * - resolvePrivateConfigFileName() — which file may be loaded
 * - assertLocalMustNotMutatePrivateTs() — writers
 * - assertAutomatedMustNotUseLivePrivateTs() — accidental live path
 */

/** True when running on GitHub Actions or other CI that may own private.ts. */
export function isCiRunner(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CI === "true" || env.GITHUB_ACTIONS === "true";
}

/**
 * True when this process is an automated test / precheck / bench harness
 * (not a normal `bun run dev` for the live CMS).
 */
export function isAutomatedTestHarness(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.TEST_MODE === "true") return true;
  if (env.NODE_ENV === "test") return true;
  if (env.COMPILE_ALL_ADAPTERS === "true") return true;
  if (env.BENCHMARK === "true" || env.SVELTY_BENCHMARK_SUITE === "true") return true;
  if (env.PLAYWRIGHT_TEST === "true" || env.PLAYWRIGHT_TEST === "1") return true;
  // Vitest sets VITEST=true
  if (env.VITEST && env.VITEST !== "false" && env.VITEST !== "0") return true;
  if (env.SVELTY_PRECHECK === "true") return true;
  return false;
}

/**
 * Which bootstrap file may be loaded for this process.
 * - Automated harness (local or CI): always private.test.ts
 * - Normal local/prod app: private.ts
 *
 * Note: CI workflows may still *write* private.ts as a mirror; loaders under
 * TEST_MODE still prefer private.test.ts via this helper.
 */
export function resolvePrivateConfigFileName(
  env: NodeJS.ProcessEnv = process.env,
): "private.test.ts" | "private.ts" {
  if (isAutomatedTestHarness(env)) return "private.test.ts";
  return "private.ts";
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
      "Automated tests and precheck must use config/private.test.ts only — " +
      "using private.ts can destroy live data. " +
      "CI may create an ephemeral private.ts (never committed).",
  );
}

/**
 * Call if code is about to open/use config/private.ts while in an automated harness.
 * Local automated runs must never touch the live file (read or write).
 */
export function assertAutomatedMustNotUseLivePrivateTs(
  action: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isAutomatedTestHarness(env)) return;
  // CI may mirror private.ts; still prefer test file for loads, but reading
  // the mirror is OK on CI only. Local automated: hard fail.
  if (isCiRunner(env)) return;
  throw new Error(
    `[private-config-policy] Refused to ${action} config/private.ts during automated testing. ` +
      "Local harnesses must use config/private.test.ts only to protect live data.",
  );
}

/** Paths relative to repo root — for logging and docs. */
export const PRIVATE_CONFIG_LIVE = "config/private.ts";
export const PRIVATE_CONFIG_TEST = "config/private.test.ts";
