/**
 * @file scripts/lint/lib/module-boundary.ts
 * @description Canonical module-boundary classification for the AST gates.
 *
 * The linkmap, the tenant-scope lint and any future probe must agree on what
 * "client entry" and "server-only" mean. A second copy drifts silently, and a
 * drift here changes which modules are reported as client→server leaks — the
 * exact class of bug the gate exists to catch. This module is therefore the
 * only definition; `analyze-linkmap.ts` re-exports it so existing callers and
 * fixtures keep working.
 *
 * `scripts/security/slop-scanner.ts` keeps a deliberately *broader* heuristic
 * for its CSRF check (it also skips `src/services/**`), because a false CSRF
 * finding there is noise rather than a boundary decision; that exception is
 * documented at its call site.
 *
 * Features:
 * - SvelteKit conventions (`.server.ts`, `+server.ts`, `.remote.ts`, hooks)
 * - server-only trees (`databases/**`, `hooks/**`, `routes/api/**`, plugin `server/`)
 * - documented static server stubs (client-safe facades that wrap server work)
 * - client entrypoints (`hooks.client.ts`, route `.svelte`, `+page.ts`, `+layout.ts`)
 */

/**
 * Files that *look* client-safe (no `.server` suffix) but must never be pulled
 * into a browser graph: they are facades over server state or carry Node-only
 * imports. Keep this list narrow — only add a path when the build or the
 * linkmap proves the module cannot run in a browser.
 */
export const SERVER_STUB_PATHS: ReadonlySet<string> = new Set([
  "src/databases/db.ts",
  "src/databases/database-resilience.ts",
  "src/databases/cache/cache-service.ts",
  "src/databases/cache/cache-warming-service.ts",
  "src/databases/cache/cache-metrics.ts",
  "src/databases/config-state.ts",
  "src/databases/theme-manager.ts",
  "src/databases/db-utils.ts",
  "src/databases/schemas.ts",
  "src/databases/auth/index.ts",
  "src/databases/auth/auth-service.ts",
  "src/databases/auth/session-manager.ts",
  "src/databases/auth/two-factor-auth.ts",
  "src/databases/auth/permissions.ts",
  "src/content/engine.server.ts",
  "src/content/loader.server.ts",
  "src/services/security/audit-service.ts",
  "src/services/core/settings-service.ts",
]);

/**
 * True when `relPath` may only execute on the server.
 *
 * The decision is structural (path convention / owning tree), never content
 * based: a module must be classifiable before it is parsed.
 */
export function isServerOnlyPath(relPath: string): boolean {
  if (relPath === "src/hooks.server.ts" || relPath === "src/hooks.ws.ts") return true;
  if (
    relPath.endsWith(".server.ts") ||
    relPath.endsWith("+server.ts") ||
    relPath.endsWith(".remote.ts")
  ) {
    return true;
  }
  if (SERVER_STUB_PATHS.has(relPath)) return true;
  if (
    /^src\/databases\/(?:sqlite|postgresql|mariadb|mongodb|core)\//.test(relPath) ||
    relPath.startsWith("src/hooks/") ||
    relPath.startsWith("src/routes/api/") ||
    /^src\/plugins\/[^/]+\/server\//.test(relPath)
  ) {
    return true;
  }
  return false;
}

/**
 * True when `relPath` starts the client graph on its own: the browser hook and
 * any route component/loader. A `+page.server.ts` is NOT a client entry.
 */
export function isClientEntrypoint(relPath: string): boolean {
  if (relPath === "src/hooks.client.ts") return true;
  if (relPath.startsWith("src/routes/")) {
    if (relPath.endsWith(".svelte")) return true;
    if (relPath.endsWith("+page.ts") || relPath.endsWith("+layout.ts")) return true;
  }
  return false;
}
