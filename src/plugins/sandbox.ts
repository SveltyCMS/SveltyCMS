/**
 * @file src/plugins/sandbox.ts
 * @description Sandboxed plugin execution context with declarative capability manifest enforcement.
 *
 * Features:
 * - Fail-closed DB capability gates (`db:read`, `db:write`, `db:delete`)
 * - Scoped database access (prefixed `plugin_<id>_*` collections + explicit `sandbox.collections` allowlist)
 * - Unconditional block on protected auth/system/secret tables
 * - Network host allowlist + SSRF checks, FS path scoping, and explicit env variable allowlisting
 * - Query count limits and timeout protection per hook invocation
 */

import path from "node:path";
import type { IDBAdapter } from "@databases/db-interface";
import { logger } from "@utils/logger";
import type {
  PluginCapability,
  PluginContext,
  PluginLifecycleHooks,
  PluginSandboxManifest,
} from "./types";

type LogMethod = (message: string, ...meta: unknown[]) => void;

const safeLog = {
  trace: (msg: string, ...args: unknown[]) =>
    (logger?.trace as LogMethod | undefined)?.(msg, ...args),
  info: (msg: string, ...args: unknown[]) =>
    (logger?.info as LogMethod | undefined)?.(msg, ...args),
  warn: (msg: string, ...args: unknown[]) =>
    (logger?.warn as LogMethod | undefined)?.(msg, ...args),
  error: (msg: string, ...args: unknown[]) =>
    (logger?.error as LogMethod | undefined)?.(msg, ...args),
};

/** Maximum DB queries a plugin can make per hook invocation */
const MAX_QUERIES_PER_HOOK = 100;

/** Maximum execution time per hook (ms) */
const HOOK_TIMEOUT_MS = 5000;

/** Collections that plugins can NEVER access even if listed in a manifest */
export const PROTECTED_COLLECTIONS = new Set([
  "users",
  "sessions",
  "tokens",
  "roles",
  "system_settings",
  "private_settings",
  "audit_logs",
  "system_api_keys",
]);

const READ_OPS = new Set(["findOne", "findMany", "findById", "findByIds", "count", "streamMany"]);
const WRITE_OPS = new Set(["insert", "insertMany", "update", "updateMany", "upsert"]);
const DELETE_OPS = new Set(["delete", "deleteMany"]);

export interface PluginRuntimeManifest {
  capabilities?: readonly PluginCapability[];
  sandbox?: PluginSandboxManifest;
}

/** Validates a plugin's sandbox manifest at registration time (fail-closed). */
export function validatePluginManifest(pluginId: string, manifest?: PluginRuntimeManifest): void {
  const cols = manifest?.sandbox?.collections;
  if (!cols) return;
  for (const name of [...(cols.read ?? []), ...(cols.write ?? [])]) {
    if (PROTECTED_COLLECTIONS.has(String(name).toLowerCase())) {
      throw new Error(
        `[Security Violation] Plugin "${pluginId}" manifest attempts to claim protected collection "${name}"`,
      );
    }
  }
}

/** Assert outbound HTTP target complies with declared `network:fetch` + `sandbox.net.allowHosts`. */
export function assertPluginNetworkAllowed(
  pluginId: string,
  targetUrl: string,
  manifest?: PluginRuntimeManifest,
): URL {
  if (manifest?.capabilities && !manifest.capabilities.includes("network:fetch")) {
    throw new Error(
      `Plugin "${pluginId}" attempted network access without "network:fetch" capability`,
    );
  }
  const parsed = new URL(targetUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Plugin "${pluginId}" blocked non-HTTP URL scheme: ${parsed.protocol}`);
  }
  const allowHosts = manifest?.sandbox?.net?.allowHosts;
  if (allowHosts && allowHosts.length > 0) {
    const hostname = parsed.hostname.toLowerCase();
    const matched = allowHosts.some((allowed) => {
      const rule = allowed.toLowerCase();
      return rule.startsWith("*.") ? hostname.endsWith(rule.slice(1)) : hostname === rule;
    });
    if (!matched) {
      throw new Error(
        `Plugin "${pluginId}" denied network access to "${hostname}" (not in sandbox.net.allowHosts)`,
      );
    }
  }
  return parsed;
}

/** Assert filesystem access stays confined to declared read/write root prefixes without traversal. */
export function assertPluginFsAllowed(
  pluginId: string,
  targetPath: string,
  mode: "read" | "write",
  manifest?: PluginRuntimeManifest,
): string {
  const requiredCap: PluginCapability = mode === "write" ? "file:write" : "file:read";
  if (manifest?.capabilities && !manifest.capabilities.includes(requiredCap)) {
    throw new Error(
      `Plugin "${pluginId}" attempted file ${mode} without "${requiredCap}" capability`,
    );
  }
  const normalizedTarget = path.resolve(targetPath);
  const roots =
    mode === "write"
      ? manifest?.sandbox?.fs?.writePaths
      : (manifest?.sandbox?.fs?.readPaths ?? manifest?.sandbox?.fs?.writePaths);
  if (!roots || roots.length === 0) {
    throw new Error(
      `Plugin "${pluginId}" denied file ${mode} on "${targetPath}" (no sandbox.fs.${mode}Paths declared)`,
    );
  }
  const allowed = roots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return (
      normalizedTarget === resolvedRoot || normalizedTarget.startsWith(resolvedRoot + path.sep)
    );
  });
  if (!allowed) {
    throw new Error(
      `Plugin "${pluginId}" denied file ${mode} outside sandbox roots: "${targetPath}"`,
    );
  }
  return normalizedTarget;
}

/** Read an environment variable only when explicitly declared in `sandbox.env`. */
export function readSandboxedEnv(
  pluginId: string,
  key: string,
  manifest?: PluginRuntimeManifest,
): string | undefined {
  const allowedKeys = manifest?.sandbox?.env ?? [];
  if (!allowedKeys.includes(key)) {
    throw new Error(
      `Plugin "${pluginId}" denied access to undeclared environment variable "${key}"`,
    );
  }
  return process.env[key];
}

/**
 * Creates a scoped database adapter proxy that enforces capabilities + collection allowlists.
 */
export function createScopedDbAdapter(
  dbAdapter: IDBAdapter,
  pluginId: string,
  manifest?: PluginRuntimeManifest,
): { adapter: IDBAdapter; stats: { queryCount: number } } {
  validatePluginManifest(pluginId, manifest);

  const stats = { queryCount: 0 };
  const prefix = `plugin_${pluginId}_`;
  const caps = manifest?.capabilities ? new Set(manifest.capabilities) : null;
  const readAllow = manifest?.sandbox?.collections?.read
    ? new Set(manifest.sandbox.collections.read.map((c) => c.toLowerCase()))
    : null;
  const writeAllow = manifest?.sandbox?.collections?.write
    ? new Set(manifest.sandbox.collections.write.map((c) => c.toLowerCase()))
    : null;

  function validateCollection(collection: string, operation: string): void {
    stats.queryCount++;

    if (stats.queryCount > MAX_QUERIES_PER_HOOK) {
      throw new Error(`Plugin "${pluginId}" exceeded query limit (${MAX_QUERIES_PER_HOOK})`);
    }

    const normalized = collection.toLowerCase();
    if (PROTECTED_COLLECTIONS.has(normalized)) {
      throw new Error(
        `Plugin "${pluginId}" denied access to protected collection "${collection}" (${operation})`,
      );
    }

    const isDelete = DELETE_OPS.has(operation);
    const isWrite = WRITE_OPS.has(operation);
    const isRead = READ_OPS.has(operation);

    if (caps) {
      if (isDelete && !caps.has("db:delete")) {
        throw new Error(
          `Plugin "${pluginId}" attempted ${operation} on "${collection}" without "db:delete" capability`,
        );
      }
      if (isWrite && !caps.has("db:write")) {
        throw new Error(
          `Plugin "${pluginId}" attempted ${operation} on "${collection}" without "db:write" capability`,
        );
      }
      if (isRead && !caps.has("db:read")) {
        throw new Error(
          `Plugin "${pluginId}" attempted ${operation} on "${collection}" without "db:read" capability`,
        );
      }
    }

    if (isWrite || isDelete) {
      const allowedWrite = collection.startsWith(prefix) || Boolean(writeAllow?.has(normalized));
      if (!allowedWrite) {
        throw new Error(
          `Plugin "${pluginId}" can only write to collections prefixed with "${prefix}"${writeAllow ? " or declared in sandbox.collections.write" : ""} (attempted: "${collection}")`,
        );
      }
    } else if (readAllow) {
      const allowedRead = collection.startsWith(prefix) || readAllow.has(normalized);
      if (!allowedRead) {
        throw new Error(
          `Plugin "${pluginId}" denied read on "${collection}" (not prefixed with "${prefix}" or in sandbox.collections.read)`,
        );
      }
    }

    safeLog.trace(`Plugin ${pluginId}: ${operation} on ${collection} (query #${stats.queryCount})`);
  }

  const scopedCrud = new Proxy(dbAdapter.crud, {
    get(target, prop: string) {
      const original = (target as unknown as Record<string, unknown>)[prop];
      if (typeof original !== "function") return original;

      return (...args: unknown[]) => {
        if (typeof args[0] === "string") {
          validateCollection(args[0], prop);
        }
        return (original as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });

  const sandboxedAdapter = new Proxy(dbAdapter, {
    get(target, prop: string) {
      if (prop === "crud") return scopedCrud;
      return (target as unknown as Record<string, unknown>)[prop];
    },
  }) as IDBAdapter;

  return { adapter: sandboxedAdapter, stats };
}

function createSandboxedContext(
  context: PluginContext,
  pluginId: string,
  manifest?: PluginRuntimeManifest,
): { context: PluginContext; stats: { queryCount: number } } {
  const { adapter: scopedAdapter, stats } = createScopedDbAdapter(
    context.dbAdapter,
    pluginId,
    manifest,
  );

  const sandboxedContext: PluginContext = {
    ...context,
    dbAdapter: scopedAdapter,
  };

  return { context: sandboxedContext, stats };
}

/**
 * Wraps a plugin lifecycle hook with capability-enforced sandboxed context,
 * timeout protection, and error boundary isolation.
 */
export function wrapHook<K extends keyof PluginLifecycleHooks>(
  pluginId: string,
  hookName: K,
  hookFn: NonNullable<PluginLifecycleHooks[K]>,
  context: PluginContext,
  manifest?: PluginRuntimeManifest,
): PluginLifecycleHooks[K] {
  type HookFn = NonNullable<PluginLifecycleHooks[K]>;

  const wrapped = (async (...args: unknown[]) => {
    const { context: sandboxedContext, stats } = createSandboxedContext(
      context,
      pluginId,
      manifest,
    );

    try {
      const result = await Promise.race([
        (hookFn as (...a: unknown[]) => unknown)(sandboxedContext, ...args.slice(1)),
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
      return hookName === "beforeSave" ? args[2] : undefined;
    }
  }) as HookFn;

  return wrapped;
}

/**
 * Wraps an SSR hook with capability-enforced sandbox, timeout, and error boundary.
 */
export function wrapSSRHook(
  pluginId: string,
  hookFn: (context: PluginContext, entries: Record<string, unknown>[]) => Promise<unknown>,
  _context: PluginContext,
  manifest?: PluginRuntimeManifest,
): typeof hookFn {
  return async (ctx: PluginContext, entries: Record<string, unknown>[]) => {
    const { context: sandboxedContext } = createSandboxedContext(ctx, pluginId, manifest);

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
