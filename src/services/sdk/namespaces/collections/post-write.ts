/**
 * @file src/services/sdk/namespaces/collections/post-write.ts
 * @description
 * Post-write side effects for the collections namespace: synchronous L1
 * eviction, tick-debounced L2 invalidation, workflow initialization,
 * pub/sub broadcasts, plugin lifecycle hooks, and coalesced outbox emission.
 *
 * Everything here runs detached from the HTTP/SDK response path and is
 * best-effort — side effects must never surface to the caller.
 *
 * ### Features:
 * - synchronous scoped L1 eviction (even when skipSideEffects is set)
 * - tick-debounced + coalesced L2 pattern clears keyed by `${tenant}:${schemaId}`
 * - workflow init only on create with peekWorkflowCache null-check
 * - outbox batch queue with chunked (8) bounded parallel emission
 * - plugin afterSave/afterDelete + beforeSave hooks with tenant settings cache
 */

import { LRUCache } from "lru-cache";
import { logger } from "@utils/logger";
import { nowISODateString } from "@src/utils/date";
import { cacheService } from "@src/databases/cache/cache-service";
import { pluginRegistry } from "@src/plugins/registry";
import type { PluginContext, PluginLifecycleHooks } from "@src/plugins/types";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";
import type { LocalApiOptions } from "../types";
import { evictRequestCache } from "./request-cache";
import {
  getOutboxLazy,
  getPubSubLazy,
  getResponseCacheLazy,
  getWorkflowServiceLazy,
} from "./lazy-services";

/** True when the caller explicitly opted out of write side effects — no outbox, workflow, plugin afterSave, or L2 fan-out. */
export function shouldSkipWriteSideEffects(options: LocalApiOptions): boolean {
  return options.skipSideEffects === true;
}

/**
 * Tick-debounce set for cache invalidation: coalesces consecutive writes in
 * the same macrotask into a single clear pass (keyed by tenant + schema).
 */
let _pendingInvalidationTasks = new Set<string>();
let _pendingInvalidationDirty = new Set<string>();

/**
 * Invalidate L1 (synchronous, scoped) + L2 (tick-debounced, coalesced).
 * Consecutive writes in the same macrotask (batch saves, importers) coalesce
 * into ONE pass instead of N × (response-cache clear + 5-6 pattern walks).
 * Microtasks drain before the next macrotask, so no reader can observe a
 * stale entry between the write and the debounced clear — zero consistency
 * cost.
 */
export function invalidateCache(
  schema: Schema,
  tenantId?: DatabaseId | null,
  opts?: { skipRequestCacheClear?: boolean },
): void {
  // 1. Clear L1 (In-Memory) Cache synchronously (0ms) — scoped to this collection keyspace
  if (!opts?.skipRequestCacheClear) {
    evictRequestCache(schema._id as string, tenantId as string);
  }

  // 2. Tick-debounced L2 pattern clears.
  const tenantTag = (tenantId as string) || "default";
  const schemaId = schema._id as string | undefined;
  const tenantKey = (tenantId as string) || "default";
  const requestKey = `${tenantTag}:${schemaId ?? "*"}`;

  if (_pendingInvalidationTasks.has(requestKey)) {
    _pendingInvalidationDirty.add(requestKey);
    return;
  }
  _pendingInvalidationTasks.add(requestKey);

  queueMicrotask(async () => {
    try {
      const responseCache = await getResponseCacheLazy();
      if (schemaId) {
        responseCache.invalidateCollection(schemaId, tenantKey).catch(() => {});
      } else {
        responseCache.invalidateAll(tenantKey).catch(() => {});
      }

      const patterns = [`cms:content_structure:${tenantTag}`];
      if (schemaId) {
        patterns.push(
          `collection:${schemaId}:`,
          `cms:content_structure:${tenantTag}:${schemaId}`,
          `/api/collections/${schemaId.toLowerCase()}*`,
          `/api/collections/${schemaId}*`,
        );
      }

      await Promise.all(
        patterns.map((pattern) => cacheService.clearByPattern(pattern, tenantKey).catch(() => {})),
      );
    } catch {
    } finally {
      _pendingInvalidationTasks.delete(requestKey);
      if (_pendingInvalidationDirty.has(requestKey)) {
        _pendingInvalidationDirty.delete(requestKey);
        invalidateCache(schema, tenantId, { skipRequestCacheClear: true });
      }
    }
  });
}

/**
 * Detach post-write work from the HTTP/SDK response path.
 * Always clears L1 request cache synchronously; everything else is microtasked
 * (or skipped when the caller passes skipSideEffects explicitly).
 */
export function schedulePostWrite(
  dbAdapter: IDBAdapter,
  action: "create" | "update" | "delete",
  schema: Schema,
  collectionId: string,
  tenantId: DatabaseId | null | undefined,
  id: string,
  data: any,
  user: any,
  options: LocalApiOptions,
): void {
  // L1 clear must be sync so same-tick reads don't see stale request-scoped cache
  evictRequestCache(schema._id as string, tenantId as string);

  if (shouldSkipWriteSideEffects(options)) {
    return;
  }

  const schemaId = schema._id as string;
  const tid = tenantId as string;

  // L2 invalidation starts IMMEDIATELY (debounced + coalesced) — never behind
  // workflow/pubsub work, so save-then-read can't race a stale cached list.
  invalidateCache(schema, tenantId, { skipRequestCacheClear: true });

  queueMicrotask(() => {
    void (async () => {
      try {
        if (action === "create") {
          try {
            const workflowService = await getWorkflowServiceLazy();
            // Negative cache hit: collection has no workflow — skip the
            // extra findMany round-trip that previously ran on every create.
            const peeked =
              typeof workflowService.peekWorkflowCache === "function"
                ? workflowService.peekWorkflowCache(schemaId, tid)
                : undefined;
            if (peeked !== null) {
              await workflowService.initializeWorkflow(id, schemaId, tid);
            }
          } catch {
            /* no workflow for collection / service unavailable */
          }
        }

        try {
          const pubSub = await getPubSubLazy();
          pubSub.publish("entryUpdated", {
            collection: schema.name || schemaId,
            id,
            action,
            data,
            timestamp: nowISODateString(),
            user,
          });
        } catch {}

        const hookName = action === "create" || action === "update" ? "afterSave" : "afterDelete";
        await triggerLifecycleHook(dbAdapter, hookName, collectionId, data ?? id, options, schema);
      } catch {
        /* post-write side effects must never surface to the caller */
      }
    })();
  });
}

/** Tenant settings cache shared by plugin lifecycle hooks. */
const _tenantSettingsCache = new LRUCache<string, { settings: any }>({
  max: 200,
  ttl: 10_000,
});

/**
 * Run a plugin lifecycle hook (beforeSave on the critical path, afterSave /
 * afterDelete post-write). Plugin hooks never throw to callers — failures
 * are logged and the hook chain continues.
 */
export async function triggerLifecycleHook(
  dbAdapter: IDBAdapter,
  hookName: keyof PluginLifecycleHooks,
  collectionId: string,
  data: any,
  options: LocalApiOptions,
  schema: Schema,
): Promise<any> {
  // beforeSave runs on the critical path — bail fast when no plugin implements it
  if (!pluginRegistry.hasAnyHook(hookName)) {
    return data;
  }
  const plugins = pluginRegistry.getAll();
  if (plugins.length === 0) {
    return data;
  }

  const { tenantId, user, system } = options;
  const effectiveUser = system ? { _id: "system", role: "admin" } : user;
  const activeTenantId = (tenantId || "default") as string;

  let settings: any = {};
  const cachedSettings = _tenantSettingsCache.get(activeTenantId);
  if (cachedSettings) {
    settings = cachedSettings.settings;
  } else if (dbAdapter.system?.tenants && typeof dbAdapter.system.tenants.getById === "function") {
    const systemSettings = await dbAdapter.system.tenants.getById(activeTenantId as DatabaseId);
    settings = (systemSettings as any).success ? (systemSettings as any).data?.settings || {} : {};
    _tenantSettingsCache.set(activeTenantId, {
      settings,
    });
  }

  let finalData = data;

  for (const entry of plugins) {
    const hook = (entry.hooks as any)?.[hookName];
    if (hook) {
      if (
        !(await pluginRegistry.isEnabledForCollection(
          entry.metadata.id,
          collectionId,
          activeTenantId as string,
          schema,
        ))
      )
        continue;

      const state = await pluginRegistry.getPluginState(
        entry.metadata.id,
        activeTenantId as string,
      );
      const context: PluginContext = {
        collectionSchema: schema,
        dbAdapter,
        language: (options as any).language || "en",
        tenantId: activeTenantId as string,
        user: effectiveUser as any,
        settings,
        pluginConfig: state?.settings || {},
      };

      try {
        if (hookName === "beforeSave") {
          finalData = await (hook as any)(context, collectionId, finalData);
        } else {
          await (hook as any)(context, collectionId, finalData);
        }
      } catch (err) {
        logger.error(`[PluginSystem] Error in ${entry.metadata.id} hook ${String(hookName)}:`, err);
      }
    }
  }
  return finalData;
}

interface PendingOutboxItem {
  schema: Schema;
  tenantId: DatabaseId | null | undefined;
  action: string;
  id: string;
  data: any;
  user: any;
}

let _pendingOutboxBatch: PendingOutboxItem[] = [];
let _outboxFlushScheduled = false;

/**
 * Schedule outbox event into a coalesced batch to avoid event-loop microtask saturation.
 */
function scheduleOutboxEvent(item: PendingOutboxItem): void {
  if (process.env.DISABLE_OUTBOX === "true") return;
  _pendingOutboxBatch.push(item);
  if (!_outboxFlushScheduled) {
    _outboxFlushScheduled = true;
    queueMicrotask(async () => {
      const batch = _pendingOutboxBatch;
      _pendingOutboxBatch = [];
      _outboxFlushScheduled = false;

      if (batch.length === 0 || process.env.DISABLE_OUTBOX === "true") return;

      try {
        const { isOutboxDisabled, outboxService } = await getOutboxLazy();
        if (isOutboxDisabled()) return;

        // Bounded parallel emission in chunks of 8 to prevent event-loop / connection saturation
        const CHUNK_SIZE = 8;
        for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
          const chunk = batch.slice(i, i + CHUNK_SIZE);
          await Promise.all(
            chunk.map((entry) => {
              const eventType =
                entry.action === "create"
                  ? "entry:create"
                  : entry.action === "update"
                    ? "entry:update"
                    : entry.action === "delete"
                      ? "entry:delete"
                      : `entry:${entry.action}`;

              return outboxService
                .emit(
                  eventType,
                  "entry",
                  entry.id,
                  {
                    collection: entry.schema.name || (entry.schema._id as string),
                    collectionId: entry.schema._id,
                    id: entry.id,
                    action: entry.action,
                    data: entry.data,
                    userId: entry.user?._id,
                  },
                  String(entry.tenantId ?? "default"),
                )
                .catch(() => {});
            }),
          );
        }
      } catch {}
    });
  }
}

/**
 * Persist a mutation; schedule outbox emit off the critical path.
 * Single-statement INSERT/UPDATE/DELETE are natively atomic — no BEGIN/COMMIT wrapper.
 */
export async function persistWithOutbox(
  action: "create" | "update" | "delete",
  write: (txOpts: Record<string, unknown>) => Promise<any>,
  schema: Schema,
  tenantId: DatabaseId | null | undefined,
  user: any,
  getId: (result: any) => string,
  getData: (result: any) => any,
  options?: { skipSideEffects?: boolean },
): Promise<any> {
  const result = await write({});
  if (result?.success) {
    const id = getId(result);
    if (id && !options?.skipSideEffects && process.env.DISABLE_OUTBOX !== "true") {
      scheduleOutboxEvent({
        schema,
        tenantId,
        action,
        id,
        data: getData(result),
        user,
      });
    }
  }
  return result;
}
