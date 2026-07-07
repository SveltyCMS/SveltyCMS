/**
 * @file src/utils/runtime-env.ts
 * @description Runtime environment variable accessors that survive Vite production builds.
 *
 * Vite replaces `process.env.X` with `{}.X` (undefined) at build time because it
 * treats `process.env` as a build-time concern. By accessing `globalThis.process`
 * indirectly, we prevent the inlining and ensure runtime env vars are read correctly.
 *
 * ### Why not `import.meta.env`?
 * `import.meta.env` is also build-time inlined by Vite. It's useful for values
 * known at build time (e.g., `DEV`, `PROD`) but NOT for runtime secrets like
 * `TEST_API_SECRET` that are set via `export` in CI scripts.
 *
 * ### Usage:
 * ```ts
 * import { getRuntimeEnv, isTestMode, isBenchmarkMode } from "@utils/runtime-env";
 *
 * if (isTestMode()) { ... }
 * const secret = getRuntimeEnv("TEST_API_SECRET");
 * ```
 */

/** Indirect access to process.env that Vite cannot statically inline to `{}`. */
function getProcess(): NodeJS.Process | undefined {
  if (typeof globalThis !== "undefined") {
    return (globalThis as typeof globalThis & { process?: NodeJS.Process }).process;
  }
  return undefined;
}

/** Read a runtime environment variable. Returns undefined if not set or process unavailable. */
export function getRuntimeEnv(key: string): string | undefined {
  return getProcess()?.env?.[key];
}

/**
 * Alias for {@link getRuntimeEnv}.
 *
 * Some modules import this name; keep it as a thin re-export so both naming
 * conventions resolve to the same Vite-safe runtime env accessor.
 */
export const readRuntimeEnv = getRuntimeEnv;

/** True when TEST_MODE, VITE_TEST_MODE, PLAYWRIGHT_TEST, or NODE_ENV=test is set. */
export function isTestMode(): boolean {
  const env = getProcess()?.env;
  if (!env) return false;
  return (
    env.TEST_MODE === "true" ||
    env.VITE_TEST_MODE === "true" ||
    env.PLAYWRIGHT_TEST === "true" ||
    env.NODE_ENV === "test"
  );
}

/** True when BENCHMARK or SVELTY_BENCHMARK_SUITE is set. */
export function isBenchmarkMode(): boolean {
  const env = getProcess()?.env;
  if (!env) return false;
  return env.BENCHMARK === "true" || env.SVELTY_BENCHMARK_SUITE === "true";
}

/** Combined test or benchmark mode check. */
export function isTestOrBenchmarkEnvironment(): boolean {
  return isTestMode() || isBenchmarkMode();
}

/** Get the test API secret from env or fall back to the file-based secret. */
export function getRuntimeTestApiSecret(): string | undefined {
  return getRuntimeEnv("TEST_API_SECRET") || getRuntimeEnv("VITE_TEST_API_SECRET");
}
