/**
 * @file src/databases/core/sql-coalescer.ts
 * @description
 * Statement coalescing manager for SQL database adapters.
 * Batches concurrent single-row INSERT and UPDATE operations within a configurable tick window
 * into unified multi-row statements to reduce network and driver round trips.
 *
 * ### Features:
 * - Micro-tick INSERT coalescing per collection
 * - Micro-tick UPDATE coalescing partitioned by collection, column signature, and tenant
 * - Bounded LRU-style eviction for update coalescer instances (UPDATE_COALESCER_MAX = 512)
 * - Safe fallback to single-statement execution if multi-row writes fail or decline
 */

import type { BaseEntity, BaseQueryOptions, DatabaseId } from "../db-interface";
import { StatementCoalescer } from "./statement-coalescer";
import { convertArrayDatesToISO, convertISOToDates } from "./relational-utils";
import type { RawFindResult } from "./drizzle-sql-helpers";

/** Upper bound on Phase-2 update coalescer cache entries. */
export const UPDATE_COALESCER_MAX = 512;

/**
 * Structural contract required by the coalescing manager from the SQL adapter.
 */
export interface SqlCoalescerContext {
  readonly insertCoalesceWindowMs: number;
  readonly updateCoalesceWindowMs: number;
  readonly persistTimestampsAsDate: boolean;
  readonly convertDatesOptions: Record<string, any>;
  readonly insertReturnsRows: boolean;
  getTable(collection: string): any;
  getDrizzleInstance(options?: BaseQueryOptions): any;
  rawInsertManyReturning<T extends BaseEntity>(
    table: any,
    collection: string,
    batchValues: Record<string, any>[],
    options: BaseQueryOptions,
  ): Promise<T[] | null>;
  rawUpdateManyReturning<T extends BaseEntity>(
    table: any,
    collection: string,
    batch: Array<{ id: DatabaseId; values: Record<string, any>; options: BaseQueryOptions }>,
  ): Promise<T[] | null>;
}

export class SqlCoalescerManager {
  private _insertCoalescers?: Map<string, StatementCoalescer<any>>;
  private _updateCoalescers?: Map<string, StatementCoalescer<any>>;

  constructor(private readonly ctx: SqlCoalescerContext) {}

  public getInsertCoalescer(collection: string): StatementCoalescer<any> {
    if (!this._insertCoalescers) this._insertCoalescers = new Map();
    let coalescer = this._insertCoalescers.get(collection);
    if (!coalescer) {
      coalescer = new StatementCoalescer<any>(
        async (values) => {
          const table = this.ctx.getTable(collection);
          if (!table) return null;
          const rawBatch = await this.ctx.rawInsertManyReturning(table, collection, values, {});
          if (rawBatch !== null) return rawBatch;

          // Multi-row Drizzle fallback if raw path declines
          try {
            const drizzleBatch = this.ctx.persistTimestampsAsDate
              ? values
              : values.map((row) =>
                  convertISOToDates(
                    { ...row },
                    {
                      ...this.ctx.convertDatesOptions,
                      table: collection,
                    },
                  ),
                );
            const query = this.ctx.getDrizzleInstance({}).insert(table).values(drizzleBatch);
            if (this.ctx.insertReturnsRows) {
              const results = await (query as any).returning();
              return convertArrayDatesToISO(results as any, {
                ...this.ctx.convertDatesOptions,
                table: collection,
              });
            } else {
              await (query as any);
              return convertArrayDatesToISO(values, {
                ...this.ctx.convertDatesOptions,
                table: collection,
              });
            }
          } catch {
            return null;
          }
        },
        undefined,
        this.ctx.insertCoalesceWindowMs,
      );
      this._insertCoalescers.set(collection, coalescer);
    }
    return coalescer;
  }

  public submitCoalescedInsert<T extends BaseEntity>(
    collection: string,
    values: Record<string, any>,
    runSingle: () => Promise<T>,
  ): Promise<T> {
    return this.getInsertCoalescer(collection).submit(values, runSingle);
  }

  public getUpdateCoalescer(key: string, collection: string): StatementCoalescer<any> {
    if (!this._updateCoalescers) this._updateCoalescers = new Map();
    let coalescer = this._updateCoalescers.get(key);
    if (!coalescer) {
      if (this._updateCoalescers.size >= UPDATE_COALESCER_MAX) {
        const oldest = this._updateCoalescers.keys().next().value;
        if (oldest !== undefined) this._updateCoalescers.delete(oldest);
      }
      coalescer = new StatementCoalescer<any>(
        async (entries) => {
          const table = this.ctx.getTable(collection);
          if (!table) return null;
          const batch = entries as Array<{
            id: DatabaseId;
            values: Record<string, any>;
            options: BaseQueryOptions;
          }>;
          return this.ctx.rawUpdateManyReturning(table, collection, batch);
        },
        undefined,
        this.ctx.updateCoalesceWindowMs,
      );
      this._updateCoalescers.set(key, coalescer);
    }
    return coalescer;
  }

  public submitCoalescedUpdate<T extends BaseEntity>(
    collection: string,
    key: string,
    id: DatabaseId,
    values: Record<string, any>,
    options: BaseQueryOptions,
    runSingle: () => Promise<RawFindResult<T>>,
  ): Promise<RawFindResult<T>> {
    return this.getUpdateCoalescer(key, collection).submit({ id, values, options }, runSingle);
  }

  public clear(): void {
    if (this._insertCoalescers) this._insertCoalescers.clear();
    if (this._updateCoalescers) this._updateCoalescers.clear();
  }
}
