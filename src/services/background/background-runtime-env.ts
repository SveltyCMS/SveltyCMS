/**
 * @file src/services/background/background-runtime-env.ts
 * @description Runtime-only replacement for SvelteKit's virtual `$app/env` module.
 *
 * Features:
 * - Keeps the standalone background worker independent of SvelteKit virtual modules
 * - Preserves production/development checks for transitive server services
 * - Declares the worker as a non-browser, non-build runtime
 */
export const browser = false;
export const building = false;
export const dev = process.env.NODE_ENV !== "production";
export const version = process.env.npm_package_version ?? "";
