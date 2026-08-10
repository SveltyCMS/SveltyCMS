/**
 * @file src/services/collaboration/ws-auth-registry.ts
 * @description Cross-bundle WebSocket authentication bridge.
 *
 * `yjs-sync-server.ts` is bundled separately from the SvelteKit app (esbuild →
 * `build/yjs-sync-server.js`), so it cannot import app internals — but it runs
 * in the same Node process (mounted by `index.cjs`). The app registers its
 * authenticator here at boot; the registry stores it on `globalThis` (shared
 * process state) so the standalone WS bundle can enforce session validation at
 * upgrade time. Fail-closed: if no authenticator is registered, upgrades are
 * rejected.
 *
 * ### Features:
 * - process-global bridge between the app bundle and the WS bundle
 * - fail-closed default (no authenticator ⇒ 401)
 * - no runtime dependencies (safe for both bundle graphs)
 */

export interface WsAuthResult {
  /** Resolved user id (authoritative). */
  userId: string;
  /** Resolved tenant id (authoritative when present). */
  tenantId: string | null;
}

export type WsAuthenticator = (request: {
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}) => Promise<WsAuthResult | null>;

const KEY = "__SVELTY_WS_AUTH__";

/** Registers the app-side authenticator (called once at server boot). */
export function registerWsAuthenticator(fn: WsAuthenticator | null): void {
  (globalThis as Record<string, unknown>)[KEY] = fn;
}

/** Reads the authenticator (called per upgrade from the WS bundle). */
export function getWsAuthenticator(): WsAuthenticator | null {
  return ((globalThis as Record<string, unknown>)[KEY] as WsAuthenticator | null) ?? null;
}
