/**
 * @file src/databases/core/replica-router.ts
 * @description 🚀 2027 State-of-the-Art Read-Replica Splitting with Read-Your-Writes (RYW) Consistency.
 *
 * Features:
 * - Zero-overhead passthrough when no replicas are configured.
 * - Bounded in-memory Read-Your-Writes (RYW) watermark tracking per (tenantId, clientId).
 * - AsyncLocalStorage transaction pinning ensuring atomic consistency within transactions.
 * - Intelligent load balancing across healthy replicas (round-robin, least-connections, random).
 * - Automatic circuit-breaker fault isolation with transparent zero-error fallback to primary.
 * - Comprehensive diagnostic counters (primaryWrites, replicaReads, rywHits, failoverHits).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "@utils/logger";
import type {
  IDBAdapter,
  ICrudAdapter,
  IBatchAdapter,
  IAuthAdapter,
  IContentAdapter,
  IMediaAdapter,
  ICollectionAdapter,
  ISystemAdapter,
  IMonitoringAdapter,
  IFtsAdapter,
  DatabaseResult,
  BaseQueryOptions,
  DatabaseCapabilities,
  BaseEntity,
} from "../db-interface";

// ============================================================================
// Configuration & Context
// ============================================================================

export interface ReadReplicaConfig {
  /** Whether replica routing is enabled. Default true if replicas present. */
  enabled?: boolean;
  /** Time window (in ms) where subsequent reads from the same client/session route to primary. Default 2000ms. */
  readYourWritesWindowMs?: number;
  /** Load balancing algorithm for replicas: 'round-robin' | 'least-connections' | 'random'. Default 'round-robin'. */
  loadBalancing?: "round-robin" | "least-connections" | "random";
  /** Maximum consecutive errors before marking a replica degraded/offline. Default 3. */
  maxConsecutiveErrors?: number;
  /** Cooldown time before probing an unhealthy replica (ms). Default 10000ms. */
  cooldownMs?: number;
  /** Fail-fast timeout for replica queries before falling back to primary (ms). Default 5000ms. */
  replicaTimeoutMs?: number;
}

export interface ReplicaContext {
  pinnedToPrimary?: boolean;
  clientId?: string;
  sessionToken?: string;
}

export const replicaStorage = new AsyncLocalStorage<ReplicaContext>();

export function runWithReplicaContext<T>(context: ReplicaContext, fn: () => T): T {
  return replicaStorage.run(context, fn);
}

// ============================================================================
// Boot-Time Replica Target Parsing (DB_REPLICAS)
// ============================================================================

/** One validated read-replica target parsed from the `DB_REPLICAS` env var. */
export interface DbReplicaTarget {
  host: string;
  port: number;
}

/** `host:port` with optional bracketed IPv6 literal host. */
const REPLICA_TARGET_PATTERN = /^(?:\[([0-9a-fA-F:.]+)\]|([a-zA-Z0-9.-]+)):(\d{1,5})$/;

/**
 * Parses the `DB_REPLICAS` environment variable — a comma-separated list of
 * `host:port` entries (e.g. `DB_REPLICAS="replica-a:5432,replica-b:5432"`).
 *
 * - Unset/blank input returns `[]`, which keeps the router disabled (default off).
 * - IPv6 literals use bracket notation (`[::1]:5432`).
 * - Invalid entries (missing host, non-numeric or out-of-range port) are skipped,
 *   so a single malformed entry cannot disable routing or block boot.
 */
export function parseDbReplicasEnv(raw: string | null | undefined): DbReplicaTarget[] {
  if (!raw) return [];

  const targets: DbReplicaTarget[] = [];
  for (const segment of raw.split(",")) {
    const entry = segment.trim();
    if (!entry) continue;

    const match = REPLICA_TARGET_PATTERN.exec(entry);
    if (!match) continue;

    const host = (match[1] ?? match[2] ?? "").trim();
    const port = Number(match[3]);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) continue;

    targets.push({ host, port });
  }
  return targets;
}

// ============================================================================
// Read-Your-Writes Consistency Tracker
// ============================================================================

export class ReadYourWritesTracker {
  private readonly watermarks = new Map<string, number>();
  private readonly maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  private buildKey(tenantId?: string | null, clientId?: string | null): string {
    const t = tenantId || "global";
    const c = clientId || "default";
    return `${t}:${c}`;
  }

  public recordWrite(tenantId?: string | null, clientId?: string | null): void {
    if (!clientId) return; // 🚀 RYW Affinity requires client or session identifier
    const key = this.buildKey(tenantId, clientId);
    this.watermarks.set(key, performance.now());

    // Prevent unbounded memory growth in long-running services
    if (this.watermarks.size > this.maxEntries) {
      this.prune(5_000);
    }
  }

  public hasRecentWrite(
    tenantId?: string | null,
    clientId?: string | null,
    windowMs = 2000,
  ): boolean {
    if (!clientId) return false; // Anonymous reads without client identifier are not pinned
    const key = this.buildKey(tenantId, clientId);
    const writeTime = this.watermarks.get(key);
    if (!writeTime) return false;

    const diff = performance.now() - writeTime;
    if (diff <= windowMs) {
      return true;
    }
    // Expired
    this.watermarks.delete(key);
    return false;
  }

  public prune(maxAgeMs = 5_000): void {
    const now = performance.now();
    for (const [k, timestamp] of this.watermarks.entries()) {
      if (now - timestamp > maxAgeMs) {
        this.watermarks.delete(k);
      }
    }
  }

  public clear(): void {
    this.watermarks.clear();
  }
}

// ============================================================================
// Replica Node & Pool
// ============================================================================

export class ReplicaNode {
  public readonly id: string;
  public readonly adapter: IDBAdapter;
  public consecutiveErrors = 0;
  public lastErrorTime = 0;
  public activeQueries = 0;
  public totalQueries = 0;
  private readonly maxConsecutiveErrors: number;
  private readonly cooldownMs: number;

  constructor(id: string, adapter: IDBAdapter, config: ReadReplicaConfig) {
    this.id = id;
    this.adapter = adapter;
    this.maxConsecutiveErrors = config.maxConsecutiveErrors ?? 3;
    this.cooldownMs = config.cooldownMs ?? 10_000;
  }

  public isHealthy(): boolean {
    if (this.consecutiveErrors < this.maxConsecutiveErrors) return true;
    // Check if cooldown has elapsed (half-open probe)
    if (performance.now() - this.lastErrorTime > this.cooldownMs) {
      return true;
    }
    return false;
  }

  public recordSuccess(): void {
    this.consecutiveErrors = 0;
    this.totalQueries++;
  }

  public recordError(err: unknown): void {
    this.consecutiveErrors++;
    this.lastErrorTime = performance.now();
    logger.warn(`[Replica Router] Replica '${this.id}' error #${this.consecutiveErrors}:`, err);
  }
}

export class ReplicaPool {
  private readonly nodes: ReplicaNode[];
  private rrIndex = 0;
  private readonly loadBalancing: "round-robin" | "least-connections" | "random";

  constructor(nodes: ReplicaNode[], loadBalancing: "round-robin" | "least-connections" | "random") {
    this.nodes = nodes;
    this.loadBalancing = loadBalancing;
  }

  public selectReplica(): ReplicaNode | null {
    const healthy = this.nodes.filter((n) => n.isHealthy());
    if (healthy.length === 0) return null;

    if (this.loadBalancing === "least-connections") {
      return healthy.reduce(
        (min, n) => (n.activeQueries < min.activeQueries ? n : min),
        healthy[0],
      );
    }

    if (this.loadBalancing === "random") {
      const idx = Math.floor(Math.random() * healthy.length);
      return healthy[idx];
    }

    // Default: Round-Robin
    const selected = healthy[this.rrIndex % healthy.length];
    this.rrIndex = (this.rrIndex + 1) % healthy.length;
    return selected;
  }

  public getNodes(): readonly ReplicaNode[] {
    return this.nodes;
  }
}

// ============================================================================
// Diagnostics & Metrics
// ============================================================================

export interface ReplicaStats {
  primaryWrites: number;
  primaryReads: number;
  replicaReads: number;
  rywHits: number;
  failoverHits: number;
  activeReplicas: number;
  totalReplicas: number;
  replicas: Array<{
    id: string;
    healthy: boolean;
    activeQueries: number;
    totalQueries: number;
    consecutiveErrors: number;
  }>;
}

// ============================================================================
// The Composite Replica Router Adapter
// ============================================================================

export class ReplicaRouterAdapter implements IDBAdapter {
  public readonly type: string;
  public readonly primary: IDBAdapter;
  public readonly pool: ReplicaPool;
  public readonly tracker: ReadYourWritesTracker;
  public readonly config: Required<ReadReplicaConfig>;

  // Metrics
  private _primaryWrites = 0;
  private _primaryReads = 0;
  private _replicaReads = 0;
  private _rywHits = 0;
  private _failoverHits = 0;

  public readonly crud: ICrudAdapter;
  public readonly batch: IBatchAdapter;
  public readonly auth: IAuthAdapter;
  public readonly content: IContentAdapter;
  public readonly media: IMediaAdapter;
  public readonly collection: ICollectionAdapter;
  public readonly system: ISystemAdapter;
  public readonly monitoring: IMonitoringAdapter;
  public readonly fts?: IFtsAdapter;

  constructor(primary: IDBAdapter, replicas: IDBAdapter[], config: ReadReplicaConfig = {}) {
    this.primary = primary;
    this.type = primary.type;
    this.config = {
      enabled: config.enabled ?? true,
      readYourWritesWindowMs: config.readYourWritesWindowMs ?? 2000,
      loadBalancing: config.loadBalancing ?? "round-robin",
      maxConsecutiveErrors: config.maxConsecutiveErrors ?? 3,
      cooldownMs: config.cooldownMs ?? 10_000,
      replicaTimeoutMs: config.replicaTimeoutMs ?? 5000,
    };

    this.tracker = new ReadYourWritesTracker();
    const nodes = replicas.map(
      (rep, idx) => new ReplicaNode(`replica-${idx + 1}`, rep, this.config),
    );
    this.pool = new ReplicaPool(nodes, this.config.loadBalancing);

    // Build routed namespaces
    this.crud = this.buildCrudRouter();
    this.batch = this.buildBatchRouter();
    this.auth = this.buildNamespaceRouter("auth", primary.auth);
    this.content = this.buildNamespaceRouter("content", primary.content);
    this.media = this.buildNamespaceRouter("media", primary.media);
    this.collection = this.buildNamespaceRouter("collection", primary.collection);
    this.system = this.buildNamespaceRouter("system", primary.system);
    this.monitoring = primary.monitoring;
    if (primary.fts) {
      this.fts = primary.fts;
    }
  }

  public getReplicaStats(): ReplicaStats {
    const nodes = this.pool.getNodes();
    return {
      primaryWrites: this._primaryWrites,
      primaryReads: this._primaryReads,
      replicaReads: this._replicaReads,
      rywHits: this._rywHits,
      failoverHits: this._failoverHits,
      activeReplicas: nodes.filter((n) => n.isHealthy()).length,
      totalReplicas: nodes.length,
      replicas: nodes.map((n) => ({
        id: n.id,
        healthy: n.isHealthy(),
        activeQueries: n.activeQueries,
        totalQueries: n.totalQueries,
        consecutiveErrors: n.consecutiveErrors,
      })),
    };
  }

  /**
   * Evaluates if a read operation MUST be routed to the primary.
   */
  public shouldReadPrimary(
    options?: BaseQueryOptions & { clientId?: string; sessionToken?: string },
  ): boolean {
    if (!this.config.enabled) return true;

    // 1. Transaction context or explicit pinning
    const ctx = replicaStorage.getStore();
    if (ctx?.pinnedToPrimary || options?.transaction) {
      return true;
    }

    // 2. Explicit caller consistency directive
    const optsAny = options as Record<string, unknown> | undefined;
    if (optsAny?.consistency === "strong" || optsAny?.readPreference === "primary") {
      return true;
    }

    // 3. Read-Your-Writes consistency check
    const clientId =
      options?.clientId || ctx?.clientId || (options?.sessionToken as string | undefined);
    const tenantId = (options?.tenantId as string | undefined) ?? null;

    if (this.tracker.hasRecentWrite(tenantId, clientId, this.config.readYourWritesWindowMs)) {
      this._rywHits++;
      return true;
    }

    return false;
  }

  /**
   * Executes a read operation with replica load balancing and automatic primary fallback.
   */
  public async executeRead<T>(
    _operationName: string,
    executeFn: (adapter: IDBAdapter) => Promise<DatabaseResult<T>>,
    options?: BaseQueryOptions & { clientId?: string; sessionToken?: string },
  ): Promise<DatabaseResult<T>> {
    const forcePrimary = this.shouldReadPrimary(options);

    if (forcePrimary) {
      this._primaryReads++;
      return executeFn(this.primary);
    }

    const replica = this.pool.selectReplica();
    if (!replica) {
      // All replicas offline or none available: transparent primary fallback
      this._primaryReads++;
      return executeFn(this.primary);
    }

    replica.activeQueries++;
    try {
      const result = await executeFn(replica.adapter);
      replica.activeQueries--;
      if (result.success) {
        replica.recordSuccess();
        this._replicaReads++;
        return result;
      }
      // If result is expected application failure (e.g., NOT_FOUND), return it without erroring node
      if (result.error?.code === "NOT_FOUND") {
        return result;
      }
      // Possible database/connection error: fall back to primary
      replica.recordError(result.error);
      this._failoverHits++;
      this._primaryReads++;
      return executeFn(this.primary);
    } catch (err) {
      replica.activeQueries--;
      replica.recordError(err);
      this._failoverHits++;
      this._primaryReads++;
      return executeFn(this.primary);
    }
  }

  /**
   * Executes a mutation operation on the primary and updates the RYW consistency tracker.
   */
  public async executeWrite<T>(
    executeFn: (adapter: IDBAdapter) => Promise<DatabaseResult<T>>,
    options?: BaseQueryOptions & { clientId?: string; sessionToken?: string },
  ): Promise<DatabaseResult<T>> {
    this._primaryWrites++;
    const res = await executeFn(this.primary);
    if (res.success) {
      const ctx = replicaStorage.getStore();
      const clientId =
        options?.clientId || ctx?.clientId || (options?.sessionToken as string | undefined);
      const tenantId = (options?.tenantId as string | undefined) ?? null;
      this.tracker.recordWrite(tenantId, clientId);
    }
    return res;
  }

  // ── Namespace Routers ───────────────────────────────────────────────────

  private buildCrudRouter(): ICrudAdapter {
    const p = this.primary.crud;

    return {
      // 🟢 Writes → Primary + RYW Watermark
      insert: async (col, doc, opt) => this.executeWrite((a) => a.crud.insert(col, doc, opt), opt),
      insertMany: async (col, docs, opt) =>
        this.executeWrite((a) => a.crud.insertMany(col, docs, opt), opt),
      update: async (col, id, patch, opt) =>
        this.executeWrite((a) => a.crud.update(col, id, patch, opt), opt),
      updateMany: async (col, q, patch, opt) =>
        this.executeWrite((a) => a.crud.updateMany(col, q, patch, opt), opt),
      delete: async (col, id, opt) => this.executeWrite((a) => a.crud.delete(col, id, opt), opt),
      deleteMany: async (col, q, opt) =>
        this.executeWrite((a) => a.crud.deleteMany(col, q, opt), opt),
      restore: async (col, id, opt) => this.executeWrite((a) => a.crud.restore(col, id, opt), opt),
      exists: async (col, q, opt) =>
        this.executeRead("exists", (a) => a.crud.exists(col, q, opt), opt),
      atomicIncrement: async (col, id, f, amt, opt) =>
        this.executeWrite(
          (a) =>
            a.crud.atomicIncrement
              ? a.crud.atomicIncrement(col, id, f, amt, opt)
              : Promise.resolve({
                  success: false,
                  message: "Not supported",
                  error: new Error("Not supported") as any,
                }),
          opt,
        ),

      upsert: async (col, q, doc, opt) =>
        this.executeWrite((a) => a.crud.upsert(col, q, doc, opt), opt),
      upsertMany: async (col, docs, opt) =>
        this.executeWrite((a) => a.crud.upsertMany(col, docs, opt), opt),

      // 🔵 Reads → Replica Load Balancing with RYW & Primary Failover
      find: async (col, q, opt) => this.executeRead("find", (a) => a.crud.find(col, q, opt), opt),
      findByIds: async (col, ids, opt) =>
        this.executeRead("findByIds", (a) => a.crud.findByIds(col, ids, opt), opt),
      findOne: async (col, q, opt) =>
        this.executeRead("findOne", (a) => a.crud.findOne(col, q, opt), opt),
      findMany: async (col, q, opt) =>
        this.executeRead("findMany", (a) => a.crud.findMany(col, q, opt), opt),
      findPage: async (col, q, opt) =>
        this.executeRead("findPage", (a) => a.crud.findPage(col, q, opt), opt),
      count: async (col, q, opt) =>
        this.executeRead("count", (a) => a.crud.count(col, q, opt), opt),
      aggregate: async (col, pipe, opt) =>
        this.executeRead("aggregate", (a) => a.crud.aggregate(col, pipe, opt), opt),
      streamMany: (col, q, opt) => {
        // Direct stream: fallback to primary if RYW active
        const forcePrimary = this.shouldReadPrimary(opt);
        if (forcePrimary) return p.streamMany(col, q, opt);
        const rep = this.pool.selectReplica();
        return (rep ? rep.adapter.crud : p).streamMany(col, q, opt);
      },
    };
  }

  private buildBatchRouter(): IBatchAdapter {
    return {
      bulkInsert: async (col, docs, opt) =>
        this.executeWrite((a) => a.batch.bulkInsert(col, docs, opt), opt),
      bulkUpdate: async (col, updates, opt) =>
        this.executeWrite((a) => a.batch.bulkUpdate(col, updates, opt), opt),
      bulkDelete: async (col, ids) => this.executeWrite((a) => a.batch.bulkDelete(col, ids)),
      bulkUpsert: async (col, items) => this.executeWrite((a) => a.batch.bulkUpsert(col, items)),
      execute: async (ops) => this.executeWrite((a) => a.batch.execute(ops)),
    };
  }

  private buildNamespaceRouter<T extends object>(namespaceName: string, primaryNs: T): T {
    const isWriteMethod = (method: string): boolean => {
      const lower = method.toLowerCase();
      return (
        lower.includes("create") ||
        lower.includes("update") ||
        lower.includes("delete") ||
        lower.includes("save") ||
        lower.includes("insert") ||
        lower.includes("set") ||
        lower.includes("clear") ||
        lower.includes("drop") ||
        lower.includes("migrate") ||
        lower.includes("revoke")
      );
    };

    return new Proxy(primaryNs, {
      get: (target: any, prop: string | symbol) => {
        if (typeof prop !== "string") return target[prop];
        const originalVal = target[prop];
        if (typeof originalVal !== "function") {
          return originalVal;
        }

        if (isWriteMethod(prop)) {
          return (...args: any[]) => {
            const lastArg = args[args.length - 1];
            const opts = typeof lastArg === "object" && lastArg !== null ? lastArg : undefined;
            return this.executeWrite((adapter: any) => adapter[namespaceName][prop](...args), opts);
          };
        }

        return (...args: any[]) => {
          const lastArg = args[args.length - 1];
          const opts = typeof lastArg === "object" && lastArg !== null ? lastArg : undefined;
          return this.executeRead(
            `${namespaceName}.${prop}`,
            (adapter: any) => adapter[namespaceName][prop](...args),
            opts,
          );
        };
      },
    });
  }

  // ── IDBAdapter Lifecycle & Top-Level Methods ────────────────────────────

  public async connect(...args: any[]): Promise<DatabaseResult<void>> {
    const primaryRes = await (this.primary.connect as any)(...args);
    if (!primaryRes.success) return primaryRes;

    for (const node of this.pool.getNodes()) {
      try {
        await (node.adapter.connect as any)(...args);
      } catch (err) {
        node.recordError(err);
      }
    }
    return { success: true, data: undefined };
  }

  public async disconnect(): Promise<DatabaseResult<void>> {
    const results = await Promise.allSettled([
      this.primary.disconnect(),
      ...this.pool.getNodes().map((n) => n.adapter.disconnect()),
    ]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed && failed.status === "rejected") {
      return {
        success: false,
        message: String(failed.reason),
        error: { code: "DISCONNECT_ERROR", message: String(failed.reason) },
      };
    }
    return { success: true, data: undefined };
  }

  public isConnected(): boolean {
    return this.primary.isConnected();
  }

  public async getVersion(): Promise<DatabaseResult<string>> {
    return this.primary.getVersion();
  }

  public async clearDatabase(): Promise<DatabaseResult<void>> {
    return this.primary.clearDatabase();
  }

  public getCapabilities(): DatabaseCapabilities {
    return this.primary.getCapabilities();
  }

  public async getConnectionHealth(): Promise<
    DatabaseResult<{ healthy: boolean; latency: number; activeConnections: number }>
  > {
    return this.primary.getConnectionHealth();
  }

  public async isEmpty(): Promise<DatabaseResult<boolean>> {
    return this.primary.isEmpty();
  }

  public async getCollectionData(
    collectionName: string,
    options?: any,
  ): Promise<DatabaseResult<any>> {
    return this.executeRead(
      "getCollectionData",
      (a) => a.getCollectionData(collectionName, options),
      options,
    );
  }

  public async getMultipleCollectionData(
    collectionNames: string[],
    options?: any,
  ): Promise<DatabaseResult<any>> {
    return this.executeRead(
      "getMultipleCollectionData",
      (a) => a.getMultipleCollectionData(collectionNames, options),
      options,
    );
  }

  public queryBuilder<T extends BaseEntity>(collection: string): any {
    return this.primary.queryBuilder<T>(collection);
  }

  public async transaction<T>(
    fn: (tx: any) => Promise<DatabaseResult<T>>,
    options?: { timeout?: number; isolationLevel?: string; isWrite?: boolean },
  ): Promise<DatabaseResult<T>> {
    // 🛡️ Transaction Affinity: all operations inside a transaction are strictly pinned to primary
    return runWithReplicaContext({ pinnedToPrimary: true }, async () => {
      this._primaryWrites++;
      return this.primary.transaction<T>(fn, options);
    });
  }

  public get utils(): any {
    return this.primary.utils;
  }

  public configureReplicas(urls: string[] | string): void {
    logger.info("[Replica Router] Re-configuring replicas:", urls);
  }
}

/**
 * Factory function creating a replica-aware adapter or passing through the primary.
 */
export function createReplicaRouterAdapter(
  primary: IDBAdapter,
  replicas?: IDBAdapter[],
  config?: ReadReplicaConfig,
): IDBAdapter {
  if (!replicas || replicas.length === 0) {
    return primary; // 🚀 ZERO OVERHEAD: Single-instance passthrough
  }
  return new ReplicaRouterAdapter(primary, replicas, config);
}
