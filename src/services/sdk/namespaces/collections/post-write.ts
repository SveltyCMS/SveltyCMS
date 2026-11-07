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
 * - workflow init only on create after a lookup has cached a definition
 * - outbox batch queue with chunked (8) bounded parallel emission
 * - plugin afterSave/afterDelete + beforeSave hooks with tenant settings cache
 */

import { FastLRU } from "@utils/native-utils";
import { logger } from "@utils/logger";
import { isAppError, raise } from "@utils/error-handling";
import { PROFILE_WRITE_ENABLED, profileMark } from "@utils/write-profiler";
import { nowISODateString } from "@src/utils/date";
import { cacheService } from "@src/databases/cache/cache-service";
import { collectionTableName } from "@src/databases/core/collection-name";
import { pluginRegistry } from "@src/plugins/registry";
import { wasmPluginRunner } from "@src/plugins/wasm/wasm-plugin-runner";
import type { WasmHookFailurePolicy, WasmHostContext } from "@src/plugins/wasm/types";
import type { PluginContext, PluginLifecycleHooks } from "@src/plugins/types";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";
import type { LocalApiOptions } from "../types";
import { evictRequestCache } from "./request-cache";
import {
  getResponseCacheLazy,
  getOutboxLazy,
  getPubSubLazy,
  getWorkflowServiceLazy,
} from "./lazy-services";
import { recordWriteAccess } from "@src/services/intelligence/behavioral-learner";
import { workflowApplies } from "@src/services/background/workflow-presence";

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
  tenantId?: string | null;
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
let _pendingStructuralInvalidations = new Set<string>();
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
  opts?: {
    skipRequestCacheClear?: boolean;
    writtenId?: string;
    writtenIds?: readonly string[];
    isPointWrite?: boolean;
  },
): void {
  const isPoint =
    opts?.isPointWrite !== undefined
      ? opts.isPointWrite
      : Boolean(opts?.writtenId && (!opts.writtenIds || opts.writtenIds.length <= 1));
  queueInvalidation(
    schema,
    tenantId,
    opts?.skipRequestCacheClear === true,
    opts?.writtenId,
    opts?.writtenIds,
    isPoint,
  );
}

/**
 * Positional-arg core of invalidateCache so the per-write caller
 * (schedulePostWrite) skips the options-object allocation; all invalidation
 * semantics live here.
 */
function queueInvalidation(
  schema: Schema,
  tenantId: DatabaseId | null | undefined,
  skipRequestCacheClear: boolean,
  writtenId: string | undefined,
  writtenIds: readonly string[] | undefined,
  isPointWrite?: boolean,
): void {
  if (!skipRequestCacheClear) {
    evictRequestCache(schema._id as string, tenantId as string);
  }
  const isPoint = isPointWrite ?? Boolean(writtenId && (!writtenIds || writtenIds.length <= 1));
  if (schema._id && !isPoint) {
    cacheService.bumpCollectionEpoch(schema._id as string, tenantId as string | null | undefined);
  }

  const tenantKey = (tenantId as string) || "default";
  const schemaId = schema._id as string | undefined;
  const requestKey = `${tenantKey}:${schemaId ?? "*"}`;

  if (!isPoint) {
    _pendingStructuralInvalidations.add(requestKey);
  }

  if (schemaId && (writtenId || writtenIds?.length)) {
    let ids = _pendingInvalidationIds.get(requestKey);
    if (!ids) {
      ids = acquireIdSet();
      _pendingInvalidationIds.set(requestKey, ids);
    }
    if (writtenId) ids.add(writtenId);
    if (writtenIds) for (const id of writtenIds) ids.add(id);
  }

  if (_pendingInvalidationTasks.has(requestKey)) {
    _pendingInvalidationDirty.add(requestKey);
    return;
  }
  _pendingInvalidationTasks.add(requestKey);

  queueMicrotask(async () => {
    const isStructural = _pendingStructuralInvalidations.has(requestKey);
    _pendingStructuralInvalidations.delete(requestKey);
    const ids = _pendingInvalidationIds.get(requestKey);
    _pendingInvalidationIds.delete(requestKey);
    try {
      const rc = await getResponseCacheLazy();
      if (schemaId) {
        const isPoint = !isStructural && ids !== undefined && ids.size > 0;
        const tagsToClear: string[] = [];
        if (isPoint && ids) {
          for (const id of ids) tagsToClear.push(`doc:${schemaId}:${id}`);
          tagsToClear.push(`count:${schemaId}`);
          const physicalSchemaId = collectionTableName(schemaId);
          if (physicalSchemaId !== schemaId) {
            tagsToClear.push(`count:${physicalSchemaId}`);
          }
        } else {
          tagsToClear.push(
            `collection:${schemaId}`,
            `count:${schemaId}`,
            "res:graphql",
            `res:${schemaId}`,
          );
          const physicalSchemaId = collectionTableName(schemaId);
          if (physicalSchemaId !== schemaId) {
            tagsToClear.push(`collection:${physicalSchemaId}`, `count:${physicalSchemaId}`);
          }
          if (ids) {
            for (const id of ids) tagsToClear.push(`doc:${schemaId}:${id}`);
          }
        }
        void cacheService.clearByTags(tagsToClear, tenantKey).catch(() => {});
        rc.invalidateLocal(
          schemaId,
          tenantKey,
          isPoint && ids ? { entryIds: Array.from(ids) } : undefined,
        );
      } else {
        void rc.invalidateAll(tenantKey).catch(() => {});
      }
    } catch (error) {
      logger.debug("[post-write] suppressed error", error);
    } finally {
      if (ids) releaseIdSet(ids);
      _pendingInvalidationTasks.delete(requestKey);
      if (_pendingInvalidationDirty.has(requestKey)) {
        _pendingInvalidationDirty.delete(requestKey);
        queueInvalidation(schema, tenantId, true, undefined, undefined, false);
      }
    }
  });
}

/**
 * Detach post-write work from the HTTP/SDK response path.
 * Always clears L1 request cache synchronously; turbo L1 + L2 are microtasked
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
  queueInvalidation(schema, tenantId, true, id, undefined, false);

  if ((action === "create" || action === "update") && !options.skipReturning) {
    recordWriteAccess(tid || "global", schemaId, id);
  }

  const hookName = action === "create" || action === "update" ? "afterSave" : "afterDelete";
  const hasPluginHook = pluginRegistry.hasAnyHook(hookName);
  // Import the workflow service only after a lookup cached a definition.
  // A cold peek cannot enroll the entry, so the import would be wasted work
  // on every full-document create.
  const needsWorkflow =
    action === "create" && !options.skipReturning && workflowApplies(schemaId, tid);

  if (!options.skipReturning) {
    queuePubSubEntryUpdated({
      collection: schema.name || schemaId,
      id,
      action,
      data,
      timestamp: nowISODateString(),
      tenantId,
      user,
    });
  }

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
              if (peeked) {
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
const _tenantSettingsCache = new FastLRU<string, { settings: any }>({
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
    const isWasm = wasmPluginRunner.isWasmPlugin(entry.metadata.id);
    const hook = (entry.hooks as any)?.[hookName];
    if (hook || isWasm) {
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

      try {
        if (isWasm) {
          const wasmHostContext: WasmHostContext = {
            pluginId: entry.metadata.id,
            tenantId: activeTenantId as string,
            user: effectiveUser as any,
            dbAdapter,
            collectionSchema: schema,
            pluginConfig: state?.settings || {},
            capabilities: new Set(
              (entry.metadata as any).capabilities || ["db:read", "db:write:own"],
            ),
            stats: {
              queryCount: 0,
              bytesWritten: 0,
              startTimeMs: performance.now(),
            },
          };

          const wasmResult = await wasmPluginRunner.executeHook(
            entry.metadata.id,
            hookName,
            { collectionId, data: finalData },
            wasmHostContext,
          );

          if (!wasmResult.success) {
            const effectivePolicy: WasmHookFailurePolicy =
              (entry.metadata as any).hookFailurePolicies?.[hookName] ??
              (entry.metadata as any).defaultFailurePolicy ??
              (hookName === "beforeSave" ? "fail-closed" : "fail-open");

            if (effectivePolicy === "fail-closed") {
              raise(
                500,
                `WASM plugin "${entry.metadata.id}" failed in hook "${hookName}": ${wasmResult.error || "Execution failed"}`,
                "PLUGIN_HOOK_FAILED",
              );
            } else {
              logger.warn(
                `[LifecycleHook] WASM plugin "${entry.metadata.id}" hook "${hookName}" soft-failed (fail-open): ${wasmResult.error}`,
              );
            }
          } else if (hookName === "beforeSave" && wasmResult.data !== undefined) {
            const returned = (wasmResult.data as any)?.data ?? wasmResult.data;
            if (returned && typeof returned === "object") {
              finalData = returned;
            }
          }
        } else if (hook) {
          const context: PluginContext = {
            collectionSchema: schema,
            dbAdapter,
            language: (options as any).language || "en",
            tenantId: activeTenantId as string,
            user: effectiveUser as any,
            settings,
            pluginConfig: state?.settings || {},
          };

          if (hookName === "beforeSave") {
            finalData = await (hook as any)(context, collectionId, finalData);
          } else {
            await (hook as any)(context, collectionId, finalData);
          }
        }
      } catch (err) {
        if (isAppError(err) || (err as any)?.code === "PLUGIN_HOOK_FAILED") {
          throw err;
        }
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
  // A missing tenant scope (undefined / "") is a fire-and-forget side effect on
  // an already-committed write — skip the outbox event rather than throw (which
  // would crash persistWithOutbox). null (explicit global) and real strings pass
  // through unchanged; never synthesize a tenant id.
  if (entry.tenantId === undefined || entry.tenantId === "") return;

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
    entry.tenantId,
  );
}

function isOutboxDisabledEnv(): boolean {
  return process.env.DISABLE_OUTBOX === "true" || process.env.DISABLE_OUTBOX === "1";
}

function scheduleOutboxEvent(item: PendingOutboxItem): void {
  if (isOutboxDisabledEnv()) return;
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
  if (batch.length === 0 || isOutboxDisabledEnv()) return;
  try {
    const mod = await getOutboxLazy();
    _outboxRef = { isOutboxDisabled: mod.isOutboxDisabled, outboxService: mod.outboxService };
    if (mod.isOutboxDisabled()) return;
    for (let i = 0; i < batch.length; i++) enqueueOne(batch[i]);
  } catch (error) {
    logger.debug("[post-write] suppressed error", error);
  }
}

/** Shared frozen empty tx-options — every caller only spreads it, never mutates. */
const EMPTY_TX_OPTS: Record<string, unknown> = Object.freeze({});

/**
 * Persist a mutation; schedule outbox emit off the critical path.
 *
 * A standalone write is one INSERT/UPDATE/DELETE and is natively atomic. A
 * transactional caller (draft promotion) supplies the adapter handle so the
 * statement joins its transaction, and an `afterCommit` queue so the outbox
 * event is emitted only once that transaction lands.
 */
export async function persistWithOutbox(
  action: "create" | "update" | "delete",
  write: (txOpts: Record<string, unknown>) => Promise<any>,
  schema: Schema,
  tenantId: DatabaseId | null | undefined,
  user: any,
  getId: (result: any) => string,
  getData: (result: any) => any,
  options?: {
    skipSideEffects?: boolean;
    skipReturning?: boolean;
    transaction?: unknown;
    afterCommit?: Array<() => void>;
  },
): Promise<any> {
  const writeMark = PROFILE_WRITE_ENABLED ? profileMark("ns:persist:adapter-write") : null;
  const result = await write(
    options?.transaction ? { transaction: options.transaction } : EMPTY_TX_OPTS,
  );
  writeMark?.();
  if (result?.success) {
    const id = getId(result);
    if (id && !options?.skipSideEffects && !options?.skipReturning && !isOutboxDisabledEnv()) {
      const outboxMark = PROFILE_WRITE_ENABLED ? profileMark("ns:persist:outbox") : null;
      const emit = () =>
        scheduleOutboxEvent({
          schema,
          tenantId,
          action,
          id,
          data: getData(result),
          user,
        });
      // Inside a transaction the event must wait for COMMIT; a handle without a
      // queue cannot be deferred, so the event is dropped rather than emitted
      // for a write that may still roll back.
      if (options?.transaction) options.afterCommit?.push(emit);
      else emit();
      outboxMark?.();
    }
  }
  return result;
}
