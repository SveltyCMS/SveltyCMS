/**
 * @file src/utils/path-resolver.ts
 * @description Centralized, context-aware path resolution for SveltyCMS.
 *
 * Replaces hardcoded `path.join(process.cwd(), ...)` logic scattered across
 * migration, benchmark, and compilation utilities. Paths are resolved dynamically
 * based on the active AsyncLocalStorage context, enabling "Virtual Namespacing"
 * — no physical file moves required when tenants are added or removed.
 *
 * ### Features:
 * - Context-aware getCollections() and getMedia() read tenantId from sveltyContext
 * - Static paths for config root, compiled collections, and database directories
 * - isSafe() path traversal guard
 * - Benchmark isolation paths
 */

import path from "node:path";
import { sveltyContext, requireTenantId } from "./context";
import { resolvePrivateConfigFileName } from "./private-config-policy";

/** Always resolve from live process.cwd() so tests/chdir and tooling stay correct. */
function cwd(): string {
  return process.cwd();
}

export const paths = {
  get root(): string {
    return cwd();
  },

  /** Config directory root */
  get config(): string {
    return path.join(cwd(), "config");
  },

  /** Flat collection directory (no tenant) — live user schemas */
  get collections(): string {
    return path.join(cwd(), "config", "collections");
  },

  /** Global media directory */
  get media(): string {
    return path.join(cwd(), "mediaFolder", "global");
  },

  /**
   * Dynamic: resolves collection directory based on active tenant.
   * Falls back to flat collections if no context is set.
   */
  getCollections: (): string => {
    const tenantId = sveltyContext.getStore()?.tenantId;
    return tenantId
      ? path.join(cwd(), "config", tenantId, "collections")
      : path.join(cwd(), "config", "collections");
  },

  /**
   * 🛡️ Strict: throws ContextMissingError if no tenant context is set.
   * Use this in multi-tenant request handlers where a fallback is dangerous.
   */
  requireCollections: (): string => {
    const tenantId = requireTenantId();
    return path.join(cwd(), "config", tenantId, "collections");
  },

  /**
   * Dynamic: resolves media directory based on active tenant.
   * Falls back to global media if no context is set.
   */
  getMedia: (): string => {
    const tenantId = sveltyContext.getStore()?.tenantId;
    return tenantId
      ? path.join(cwd(), "mediaFolder", tenantId)
      : path.join(cwd(), "mediaFolder", "global");
  },

  /** Compiled collections output directory */
  get compiledCollections(): string {
    return path.join(cwd(), ".compiledCollections");
  },

  /** Database directory */
  get database(): string {
    return path.join(cwd(), "config", "database");
  },

  /**
   * Live developer bootstrap only (`config/private.ts`).
   * Prefer `activePrivateConfig` for loaders that run under TEST_MODE / precheck.
   */
  get privateConfigLive(): string {
    return path.join(cwd(), "config", "private.ts");
  },

  /** Isolated test bootstrap (`config/private.test.ts`). */
  get privateConfigTest(): string {
    return path.join(cwd(), "config", "private.test.ts");
  },

  /**
   * Active bootstrap file for this process.
   * Automated harnesses → private.test.ts (never live private.ts / user DB).
   * Normal dev/prod → private.ts.
   */
  get privateConfig(): string {
    return path.join(cwd(), "config", resolvePrivateConfigFileName());
  },

  /** Benchmark-specific paths (isolated from user live data) */
  get benchmark() {
    const root = cwd();
    return {
      collections: path.join(root, "config", "collections", "test"),
      compiled: path.join(root, ".compiledCollections", "test"),
      sandboxCompiled: path.join(root, ".compiledCollections", "test", "_local_sandbox"),
      sandboxMedia: path.join(root, "config", "benchmark-sandbox", "media"),
    };
  },

  /**
   * 🛡️ Path traversal guard using path.relative.
   * True when `target` is inside `base` (handles symlinks and OS separators).
   */
  isSafe: (base: string, target: string): boolean => {
    const relative = path.relative(base, target);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  },
};
