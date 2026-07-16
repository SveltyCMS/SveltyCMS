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

const CWD = process.cwd();

export const paths = {
  root: CWD,

  /** Static: config directory root */
  config: path.join(CWD, "config"),

  /** Static: flat collection directory (no tenant) */
  collections: path.join(CWD, "config", "collections"),

  /** Static: global media directory */
  media: path.join(CWD, "mediaFolder", "global"),

  /**
   * Dynamic: resolves collection directory based on active tenant.
   * Falls back to flat collections if no context is set.
   */
  getCollections: (): string => {
    const tenantId = sveltyContext.getStore()?.tenantId;
    return tenantId
      ? path.join(CWD, "config", tenantId, "collections")
      : path.join(CWD, "config", "collections");
  },

  /**
   * 🛡️ Strict: throws ContextMissingError if no tenant context is set.
   * Use this in multi-tenant request handlers where a fallback is dangerous.
   */
  requireCollections: (): string => {
    const tenantId = requireTenantId();
    return path.join(CWD, "config", tenantId, "collections");
  },

  /**
   * Dynamic: resolves media directory based on active tenant.
   * Falls back to global media if no context is set.
   */
  getMedia: (): string => {
    const tenantId = sveltyContext.getStore()?.tenantId;
    return tenantId
      ? path.join(CWD, "mediaFolder", tenantId)
      : path.join(CWD, "mediaFolder", "global");
  },

  /** Static: compiled collections output directory */
  compiledCollections: path.join(CWD, ".compiledCollections"),

  /** Static: database directory */
  database: path.join(CWD, "config", "database"),

  /** Static: private config file */
  privateConfig: path.join(CWD, "config", "private.ts"),

  /** Benchmark-specific paths (isolated from user live data) */
  benchmark: {
    collections: path.join(CWD, "config", "collections", "test"),
    compiled: path.join(CWD, ".compiledCollections", "test"),
    sandboxCompiled: path.join(CWD, ".compiledCollections", "test", "_local_sandbox"),
    sandboxMedia: path.join(CWD, "config", "benchmark-sandbox", "media"),
  },

  /**
   * 🛡️ Path traversal guard using path.relative.
   * True when `target` is inside `base` (handles symlinks and OS separators).
   */
  isSafe: (base: string, target: string): boolean => {
    const relative = path.relative(base, target);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  },
} as const;
