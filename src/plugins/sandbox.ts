/**
 * @file src/plugins/sandbox.ts
 * @description Sandboxed plugin execution context with security boundaries
 *
 * Features:
 * - Scoped database access (plugins restricted to prefixed collections)
 * - Query count limits per hook invocation
 * - Timeout protection for hook execution
 * - Audit logging of plugin operations
 * - Error boundaries (plugin crashes don't break CMS)
 */

import type { IDBAdapter } from "@databases/db-interface";
import type { PluginContext, PluginLifecycleHooks } from "./types";

// Lazy-loaded logger — avoids crashes when logger singleton isn't initialized (e.g., during tests)
let LOGGER: any = null;
let LOGGER_LOADED = false;

function getLogger(): any {
  if (!LOGGER_LOADED) {
    LOGGER_LOADED = true;
    try {
      // Dynamic import at first use — lazy loaded
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      LOGGER = require("@utils/logger.server")?.logger;
    } catch {
      LOGGER = null;
    }
  }
  return LOGGER;
}

const safeLog = {
  trace: (...args: any[]) => getLogger()?.trace?.(...args),
  info: (...args: any[]) => getLogger()?.info?.(...args),
  warn: (...args: any[]) => getLogger()?.warn?.(...args),
  error: (...args: any[]) => getLogger()?.error?.(...args),
};

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Maximum DB queries a plugin can make per hook invocation */
const MAX_QUERIES_PER_HOOK = 100;

/** Maximum execution time per hook (ms) */
const HOOK_TIMEOUT_MS = 5000;

/** Collections that plugins can NEVER access */
const PROTECTED_COLLECTIONS = [
  "users",
  "sessions",
  "tokens",
  "roles",
  "system_settings",
  "private_settings",
  "audit_logs",
];

// ============================================================================
// SANDBOXED DB ADAPTER
// ============================================================================

/**
 * Creates a scoped database adapter proxy that restricts plugin access.
 * - Plugins can only access collections prefixed with `plugin_<pluginId>_`
 * - Protected system collections are blocked
 * - Query counts are tracked and limited
 */
export function createScopedDbAdapter(
  dbAdapter: IDBAdapter,
  pluginId: string,
): { adapter: IDBAdapter; stats: { queryCount: number } } {
  const stats = { queryCount: 0 };
  const prefix = `plugin_${pluginId}_`;

  /**
   * Validates that a collection name is allowed for this plugin.
   * Plugins can access:
   * - Their own prefixed collections (plugin_<id>_*)
   * - Public read-only collections (collections, media) — via specific methods only
   */
  function validateCollection(collection: string, operation: string): void {
    stats.queryCount++;

    if (stats.queryCount > MAX_QUERIES_PER_HOOK) {
      throw new Error(`Plugin "${pluginId}" exceeded query limit (${MAX_QUERIES_PER_HOOK})`);
    }

    // Block protected collections always
    if (PROTECTED_COLLECTIONS.includes(collection.toLowerCase())) {
      throw new Error(
        `Plugin "${pluginId}" denied access to protected collection "${collection}" (${operation})`,
      );
    }

    // For write operations, require plugin prefix
    const writeOps = ["insert", "update", "updateMany", "delete", "deleteMany"];
    if (writeOps.includes(operation) && !collection.startsWith(prefix)) {
      throw new Error(
        `Plugin "${pluginId}" can only write to collections prefixed with "${prefix}" (attempted: "${collection}")`,
      );
    }

    safeLog.trace(`Plugin ${pluginId}: ${operation} on ${collection} (query #${stats.queryCount})`);
  }

  // Create a proxy that intercepts all CRUD operations
  const scopedCrud = new Proxy(dbAdapter.crud, {
    get(target, prop: string) {
      const original = (target as any)[prop];
      if (typeof original !== "function") return original;

      return (...args: any[]) => {
        // First arg is typically the collection name
        if (typeof args[0] === "string") {
          validateCollection(args[0], prop);
        }
        return original.apply(target, args);
      };
    },
  });

  // Create the sandboxed adapter
  const sandboxedAdapter = new Proxy(dbAdapter, {
    get(target, prop: string) {
      if (prop === "crud") return scopedCrud;
      return (target as any)[prop];
    },
  }) as IDBAdapter;

  return { adapter: sandboxedAdapter, stats };
}

// ============================================================================
// SANDBOXED CONTEXT
// ============================================================================

/**
 * Creates a sandboxed plugin context with restricted capabilities.
 */
export function createSandboxedContext(
  context: PluginContext,
  pluginId: string,
): { context: PluginContext; stats: { queryCount: number } } {
  const { adapter: scopedAdapter, stats } = createScopedDbAdapter(context.dbAdapter, pluginId);

  const sandboxedContext: PluginContext = {
    ...context,
    dbAdapter: scopedAdapter,
  };

  return { context: sandboxedContext, stats };
}

// ============================================================================
// HOOK WRAPPERS WITH ERROR BOUNDARIES
// ============================================================================

/**
 * Wraps a plugin lifecycle hook with:
 * - Sandboxed context
 * - Timeout protection
 * - Error boundary (catches plugin errors, logs, returns gracefully)
 */
export function wrapHook<K extends keyof PluginLifecycleHooks>(
  pluginId: string,
  hookName: K,
  hookFn: NonNullable<PluginLifecycleHooks[K]>,
  context: PluginContext,
): PluginLifecycleHooks[K] {
  type HookFn = NonNullable<PluginLifecycleHooks[K]>;

  const wrapped = (async (...args: any[]) => {
    const { context: sandboxedContext, stats } = createSandboxedContext(context, pluginId);

    try {
      const result = await Promise.race([
        (hookFn as any)(sandboxedContext, ...args.slice(1)),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Plugin "${pluginId}" hook "${hookName}" timed out (${HOOK_TIMEOUT_MS}ms)`,
                ),
              ),
            HOOK_TIMEOUT_MS,
          ),
        ),
      ]);

      safeLog.trace(`Plugin ${pluginId}.${hookName} completed (${stats.queryCount} queries)`);
      return result;
    } catch (error) {
      safeLog.error(`Plugin "${pluginId}" hook "${hookName}" failed`, {
        error,
        pluginId,
        hookName,
        queryCount: stats.queryCount,
      });
      // Error boundary: don't crash the CMS
      return hookName === "beforeSave" ? args[2] : undefined;
    }
  }) as HookFn;

  return wrapped;
}

/**
 * Wraps an SSR hook with timeout and error boundary.
 */
export function wrapSSRHook(
  pluginId: string,
  hookFn: (context: PluginContext, entries: Record<string, unknown>[]) => Promise<any>,
  _context: PluginContext,
): typeof hookFn {
  return async (ctx: PluginContext, entries: Record<string, unknown>[]) => {
    const { context: sandboxedContext } = createSandboxedContext(ctx, pluginId);

    try {
      return await Promise.race([
        hookFn(sandboxedContext, entries),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`Plugin "${pluginId}" SSR hook timed out (${HOOK_TIMEOUT_MS}ms)`)),
            HOOK_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (error) {
      safeLog.error(`Plugin "${pluginId}" SSR hook failed`, {
        error,
        pluginId,
      });
      return [];
    }
  };
}
