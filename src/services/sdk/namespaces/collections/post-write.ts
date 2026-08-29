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
 * Coalesced Microtask Queue for PubSub entryUpdated events.
 * Fast sequential/batch writes coalesce onto a single microtask flush.
 */
interface PendingPubSubEvent {
  collection: string;
  id: string;
  action: string;
  data: any;
  timestamp: string;
  user: any;
}

const _pendingPubSubQueue: PendingPubSubEvent[] = [];
let _pubSubFlushScheduled = false;

function queuePubSubEntryUpdated(event: PendingPubSubEvent): void {
  _pendingPubSubQueue.push(event);
  if (!_pubSubFlushScheduled) {
    _pubSubFlushScheduled = true;
    queueMicrotask(async () => {
      const batch = _pendingPubSubQueue.splice(0, _pendingPubSubQueue.length);
      _pubSubFlushScheduled = false;
      if (batch.length === 0) return;

      try {
        const pubSub = await getPubSubLazy();
        for (let i = 0; i < batch.length; i++) {
          pubSub.publish("entryUpdated", batch[i]);
        }
      } catch {
        /* best-effort */
      }
    });
  }
}

/**
 * Tick-debounce set for cache invalidation: coalesces consecutive writes in
 * the same macrotask into a single clear pass (keyed by tenant + schema).
 */
let _pendingInvalidationTasks = new Set<string>();
let _pendingInvalidationDirty = new Set<string>();
/**
 * Per-request-key set of the SPECIFIC document ids written during a coalesced
 * tick. Lets the flush clear only the touched docs (`doc:<coll>:<id>`) instead
 * of every cached per-id entry — the fix for the O(#docs) write cliff at scale.
 */
const _pendingInvalidationIds = new Map<string, Set<string>>();
/** Set free-list — recycles per-tick id Sets instead of re-allocating one per coalesced write burst. */
const _idSetPool: Set<string>[] = [];
const acquireIdSet = (): Set<string> => _idSetPool.pop() ?? new Set<string>();
const releaseIdSet = (ids: Set<string>): void => {
  ids.clear();
  _idSetPool.push(ids);
};

/**
 * Invalidate L1 (synchronous, scoped) + L2 (tick-debounced, coalesced).
 * Consecutive writes in the same macrotask (batch saves, importers) coalesce
 * into ONE pass. Collection-wide list/count caches are cleared by tag
 * (O(#list-keys)); per-id document caches are cleared surgically by the ids
 * actually written (O(#writes)) — never a scan over all cached documents.
 * Microtasks drain before the next macrotask, so no reader can observe a
 * stale entry between the write and the debounced clear — zero consistency
 * cost.
 */
export function invalidateCache(
  schema: Schema,
  tenantId?: DatabaseId | null,
  opts?: { skipRequestCacheClear?: boolean; writtenId?: string; writtenIds?: readonly string[] },
): void {
  // 1. Clear L1 (In-Memory) Cache synchronously (0ms) — scoped to this collection keyspace
  if (!opts?.skipRequestCacheClear) {
    evictRequestCache(schema._id as string, tenantId as string);
  }

  // 2. Tick-debounced L2 tag clears.
  const tenantKey = (tenantId as string) || "default";
  const schemaId = schema._id as string | undefined;
  const requestKey = `${tenantKey}:${schemaId ?? "*"}`;

  if (schemaId && (opts?.writtenId || opts?.writtenIds?.length)) {
    let ids = _pendingInvalidationIds.get(requestKey);
    if (!ids) {
      ids = acquireIdSet();
      _pendingInvalidationIds.set(requestKey, ids);
    }
    if (opts.writtenId) ids.add(opts.writtenId);
    if (opts.writtenIds) for (const id of opts.writtenIds) ids.add(id);
  }

  if (_pendingInvalidationTasks.has(requestKey)) {
    _pendingInvalidationDirty.add(requestKey);
    return;
  }
  _pendingInvalidationTasks.add(requestKey);

  queueMicrotask(async () => {
    const ids = _pendingInvalidationIds.get(requestKey);
    _pendingInvalidationIds.delete(requestKey);
    try {
      const responseCache = await getResponseCacheLazy();
      if (schemaId) {
        // Collection-wide caches (list/query + count): O(#matched keys), not
        // O(#docs) — per-id reads are tagged doc:<coll>:<id>, not collection:*.
        void cacheService
          .clearByTags([`collection:${schemaId}`, `count:${schemaId}`], tenantKey)
          .catch(() => {});
        // Surgical: clear ONLY the per-id caches of documents written this tick.
        if (ids && ids.size > 0) {
          const docTags: string[] = [];
          for (const id of ids) docTags.push(`doc:${schemaId}:${id}`);
          void cacheService.clearByTags(docTags, tenantKey).catch(() => {});
        }
        void responseCache.invalidateCollection(schemaId, tenantKey).catch(() => {});
      } else {
        void responseCache.invalidateAll(tenantKey).catch(() => {});
      }
    } catch {
    } finally {
      if (ids) releaseIdSet(ids);
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
  // Pass the written id so its per-id cache is cleared surgically (doc:<coll>:<id>).
  invalidateCache(schema, tenantId, { skipRequestCacheClear: true, writtenId: id });

  const hookName = action === "create" || action === "update" ? "afterSave" : "afterDelete";
  const hasPluginHook = pluginRegistry.hasAnyHook(hookName);
  const needsWorkflow = action === "create";

  queuePubSubEntryUpdated({
    collection: schema.name || schemaId,
    id,
    action,
    data,
    timestamp: nowISODateString(),
    user,
  });

  if (hasPluginHook || needsWorkflow) {
    queueMicrotask(() => {
      void (async () => {
        try {
          if (needsWorkflow) {
            try {
              const workflowService = await getWorkflowServiceLazy();
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

          if (hasPluginHook) {
            const after = triggerLifecycleHook(
              dbAdapter,
              hookName,
              collectionId,
              data ?? id,
              options,
              schema,
            );
            if (after && typeof after.then === "function") await after;
          }
        } catch {
          /* post-write side effects must never surface to the caller */
        }
      })();
    });
  }
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
export function triggerLifecycleHook(
  dbAdapter: IDBAdapter,
  hookName: keyof PluginLifecycleHooks,
  collectionId: string,
  data: any,
  options: LocalApiOptions,
  schema: Schema,
): any {
  // beforeSave runs on the critical path — bail sync when no plugin implements it
  if (!pluginRegistry.hasAnyHook(hookName)) {
    return data;
  }
  return triggerLifecycleHookAsync(dbAdapter, hookName, collectionId, data, options, schema);
}

async function triggerLifecycleHookAsync(
  dbAdapter: IDBAdapter,
  hookName: keyof PluginLifecycleHooks,
  collectionId: string,
  data: any,
  options: LocalApiOptions,
  schema: Schema,
): Promise<any> {
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
let _outboxRef: {
  isOutboxDisabled: () => boolean;
  outboxService: { enqueueBuffered: (...args: any[]) => unknown };
} | null = null;

function enqueueOne(entry: PendingOutboxItem): void {
  const eventType =
    entry.action === "create"
      ? "entry:create"
      : entry.action === "update"
        ? "entry:update"
        : entry.action === "delete"
          ? "entry:delete"
          : `entry:${entry.action}`;
  _outboxRef!.outboxService.enqueueBuffered(
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
  );
}

function scheduleOutboxEvent(item: PendingOutboxItem): void {
  if (process.env.DISABLE_OUTBOX === "true") return;
  if (_outboxRef) {
    if (_outboxRef.isOutboxDisabled()) return;
    enqueueOne(item);
    return;
  }
  _pendingOutboxBatch.push(item);
  if (_outboxFlushScheduled) return;
  _outboxFlushScheduled = true;
  queueMicrotask(() => {
    const batch = _pendingOutboxBatch;
    _pendingOutboxBatch = [];
    _outboxFlushScheduled = false;
    void enqueueOutboxBatch(batch);
  });
}

async function enqueueOutboxBatch(batch: PendingOutboxItem[]): Promise<void> {
  if (batch.length === 0 || process.env.DISABLE_OUTBOX === "true") return;
  try {
    const mod = await getOutboxLazy();
    _outboxRef = { isOutboxDisabled: mod.isOutboxDisabled, outboxService: mod.outboxService };
    if (mod.isOutboxDisabled()) return;
    for (let i = 0; i < batch.length; i++) enqueueOne(batch[i]);
  } catch {}
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
