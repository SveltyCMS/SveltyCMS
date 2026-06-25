/**
 * @file src/utils/security/index.ts
 * @description
 * Barrel re-export that forwards all exports from the main `../security.ts`
 * module. This file exists to resolve an ambiguity in Node.js native module
 * resolution: when `@utils/security` is imported, Node may find the
 * `security/` directory before the `security.ts` file. Without this barrel,
 * directory resolution fails because there is no index file.
 *
 * Vite handles this transparently via its alias + resolver system, but the
 * Tailwind CSS v4 Node.js loader hook uses native resolution and requires
 * a real `index.js` (or `index.ts`) to be present.
 *
 * All callers of `@utils/security` expect the exports from `security.ts`.
 */

export * from "../security";
