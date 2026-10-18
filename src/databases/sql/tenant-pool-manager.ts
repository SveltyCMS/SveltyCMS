/**
 * @file src/databases/sql/tenant-pool-manager.ts
 * @description
 * Shared bookkeeping for per-tenant dedicated connection pools. PostgreSQL and
 * MariaDB each keep an identical tenant-pool map plus (on PostgreSQL) in-flight
 * counters, LRU timestamps, and the dedicated-DSN set that lets an isolated
 * tenant skip cross-tenant GUC work. This module owns that state and the LRU
 * eviction policy; each adapter still owns pool creation because the driver
 * options are dialect-specific.
 *
 * ### Features:
 * - tenant → pool map with last-use timestamps
 * - in-flight query counters so a busy pool is never evicted
 * - dedicated-DSN tracking for isolated tenant databases
 * - LRU eviction of idle pools at the configured cap
 * - close-one / close-all with the adapters' historical logging
 */

import { logger } from "@src/utils/logger";

/** Diagnostic label used in eviction logs, e.g. `PostgreSQLAdapter`. */
export interface TenantPoolManagerOptions<TPool> {
  /** Adapter name shown in LRU eviction log lines. */
  label: string;
  /** Close one driver pool. May reject; callers decide how to log that. */
  closePool: (pool: TPool, tenantId: string) => Promise<unknown>;
  /** Message logged after `closeAll()` tears every pool down. */
  closedAllMessage?: string;
}

/**
 * Owns the per-tenant pool maps. Adapters create pools and hand them here; all
 * routing, LRU and in-flight state lives in this class so PostgreSQL and
 * MariaDB cannot drift apart.
 */
export class TenantPoolManager<TPool> {
  private readonly _pools = new Map<string, TPool>();
  private readonly _inflight = new Map<string, number>();
  private readonly _lastUsed = new Map<string, number>();
  private readonly _dedicatedDsn = new Set<string>();
  private _currentTenantId: string | null = null;

  private readonly label: string;
  private readonly closePool: (pool: TPool, tenantId: string) => Promise<unknown>;
  private readonly closedAllMessage: string;

  constructor(options: TenantPoolManagerOptions<TPool>) {
    this.label = options.label;
    this.closePool = options.closePool;
    this.closedAllMessage = options.closedAllMessage ?? "Closed all per-tenant connection pools";
  }

  /** Active tenant for pool routing / txn GUC (null = unset). */
  public get currentTenantId(): string | null {
    return this._currentTenantId;
  }

  public set currentTenantId(tenantId: string | null) {
    this._currentTenantId = tenantId;
  }

  /** Number of pools currently held. */
  public get size(): number {
    return this._pools.size;
  }

  public has(tenantId: string): boolean {
    return this._pools.has(tenantId);
  }

  /** Look up a pool without touching its LRU timestamp. */
  public get(tenantId: string): TPool | undefined {
    return this._pools.get(tenantId);
  }

  /** Look up a pool and mark it as used now (PostgreSQL routing path). */
  public acquire(tenantId: string): TPool | undefined {
    const pool = this._pools.get(tenantId);
    if (pool) this._lastUsed.set(tenantId, Date.now());
    return pool;
  }

  public isDedicatedDsn(tenantId: string): boolean {
    return this._dedicatedDsn.has(tenantId);
  }

  public set(tenantId: string, pool: TPool): void {
    this._pools.set(tenantId, pool);
    this._lastUsed.set(tenantId, Date.now());
  }

  public markDedicated(tenantId: string): void {
    this._dedicatedDsn.add(tenantId);
  }

  /**
   * Drops every map entry for a tenant and returns the pool, leaving the
   * caller to close it. Returns `undefined` when nothing was registered.
   */
  public delete(tenantId: string): TPool | undefined {
    const pool = this._pools.get(tenantId);
    if (!pool) return undefined;
    this._pools.delete(tenantId);
    this._inflight.delete(tenantId);
    this._lastUsed.delete(tenantId);
    this._dedicatedDsn.delete(tenantId);
    return pool;
  }

  /**
   * Closes and forgets an existing pool before a replacement is created.
   * Fire-and-forget by design: `setTenantPool` is synchronous, matching the
   * adapters' pre-extraction behavior.
   */
  public releaseExisting(tenantId: string): void {
    const pool = this.delete(tenantId);
    if (!pool) return;
    void this.closePool(pool, tenantId).catch(() => {
      logger.debug(`Failed to close existing pool for tenant "${tenantId}"`);
    });
  }

  /** Tracks query start on a dedicated tenant pool for eviction safety. */
  public trackQueryStart(tenantId: string): void {
    this._inflight.set(tenantId, (this._inflight.get(tenantId) ?? 0) + 1);
  }

  /** Tracks query completion on a dedicated tenant pool. */
  public trackQueryEnd(tenantId: string): void {
    const cur = this._inflight.get(tenantId) ?? 1;
    if (cur <= 1) {
      this._inflight.delete(tenantId);
    } else {
      this._inflight.set(tenantId, cur - 1);
    }
  }

  /**
   * Evicts the least-recently-used idle dedicated pool when the cap is reached.
   * Never evicts a pool that currently has in-flight queries.
   */
  public evictOldestIdle(maxPools: number): void {
    if (this._pools.size < maxPools) return;

    let candidateKey: string | null = null;
    let candidateLastUsed = Number.POSITIVE_INFINITY;
    for (const key of this._pools.keys()) {
      const inFlight = this._inflight.get(key) ?? 0;
      if (inFlight > 0) continue;
      const lastUsed = this._lastUsed.get(key) ?? 0;
      if (lastUsed < candidateLastUsed) {
        candidateLastUsed = lastUsed;
        candidateKey = key;
      }
    }

    if (!candidateKey) {
      logger.warn(
        `[${this.label}] All ${this._pools.size} dedicated pools have active queries. Skipping LRU eviction.`,
      );
      return;
    }

    const evicted = this.delete(candidateKey);
    if (evicted) {
      void this.closePool(evicted, candidateKey).catch((err: unknown) => {
        logger.debug(
          `[${this.label}] Failed to close evicted pool for tenant "${candidateKey}":`,
          err,
        );
      });
    }
    logger.info(
      `[${this.label}] LRU evicted idle dedicated pool for tenant "${candidateKey}" (cap: ${maxPools})`,
    );
  }

  /** Closes and removes the dedicated pool for one tenant, if any. */
  public async close(tenantId: string): Promise<boolean> {
    const pool = this._pools.get(tenantId);
    if (!pool) return false;
    await this.closePool(pool, tenantId);
    this._pools.delete(tenantId);
    this._inflight.delete(tenantId);
    this._lastUsed.delete(tenantId);
    this._dedicatedDsn.delete(tenantId);
    return true;
  }

  /** Closes and removes every dedicated pool, then clears the tenant context. */
  public async closeAll(): Promise<void> {
    if (this._pools.size === 0) return;
    const entries = Array.from(this._pools.entries());
    this._pools.clear();
    this._inflight.clear();
    this._dedicatedDsn.clear();
    this._currentTenantId = null;

    await Promise.all(
      entries.map(([tenantId, pool]) =>
        this.closePool(pool, tenantId).catch((err: unknown) =>
          logger.warn(`Failed to close pool for tenant "${tenantId}":`, err),
        ),
      ),
    );
    logger.info(this.closedAllMessage);
  }
}
