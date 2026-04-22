/**
 * @file src/databases/mongodb/modules/crud-module.ts
 * @description CRUD operations module for MongoDB.
 */

import { DatabaseModule } from "../../base-adapter";
import type {
  ICrudAdapter,
  DatabaseResult,
  QueryFilter,
  BaseQueryOptions,
  FindOptions,
  EntityCreate,
  EntityUpdate,
  BaseEntity,
  DatabaseId,
} from "../../db-interface";
import type { MongoAdapterCore } from "../adapter/adapter-core";
import { MongoCrudMethods } from "../methods/crud-methods";
import { normalizeCollectionName } from "../methods/mongodb-utils";

export class MongoCrudModule extends DatabaseModule<MongoAdapterCore> implements ICrudAdapter {
  private _repos: Map<string, MongoCrudMethods<any>> = new Map();

  private _getRepo(coll: string): MongoCrudMethods<any> {
    const normalizedColl = normalizeCollectionName(coll);
    if (this._repos.has(normalizedColl)) {
      return this._repos.get(normalizedColl)!;
    }

    const model = (this.adapter as any)._getOrCreateModel(normalizedColl);
    const repo = new MongoCrudMethods(model);
    this._repos.set(normalizedColl, repo);
    return repo;
  }

  async aggregate<R>(
    collection: string,
    pipeline: unknown[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<R[]>> {
    return this._getRepo(collection).aggregate(pipeline as any[], options);
  }

  async count<T extends BaseEntity>(
    collection: string,
    query?: QueryFilter<T>,
    options?: BaseQueryOptions & { includeDeleted?: boolean },
  ): Promise<DatabaseResult<number>> {
    return this._getRepo(collection).count(query || {}, options);
  }

  async delete(
    collection: string,
    id: DatabaseId,
    options?: BaseQueryOptions & { permanent?: boolean; userId?: DatabaseId },
  ): Promise<DatabaseResult<void>> {
    const res = await this._getRepo(collection).delete(id, options);
    if (res.success) await this.adapter.invalidateQueryCache(collection, options?.tenantId);
    return res;
  }

  async deleteMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options?: BaseQueryOptions & { permanent?: boolean; userId?: DatabaseId },
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    const res = await this._getRepo(collection).deleteMany(query, options);
    if (res.success) {
      await this.adapter.invalidateQueryCache(collection, options?.tenantId);
      return { success: true as const, data: { deletedCount: res.data.deletedCount } };
    }
    return res as any;
  }

  async restore(
    collection: string,
    id: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    const res = await this._getRepo(collection).restore(id, options);
    if (res.success) await this.adapter.invalidateQueryCache(collection, options?.tenantId);
    return { success: res.success, data: undefined } as any;
  }

  async exists<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options?: BaseQueryOptions & { includeDeleted?: boolean },
  ): Promise<DatabaseResult<boolean>> {
    return this._getRepo(collection).exists(query, options);
  }

  async findByIds<T extends BaseEntity>(
    collection: string,
    ids: DatabaseId[],
    options?: FindOptions<T>,
  ): Promise<DatabaseResult<T[]>> {
    return this._getRepo(collection).findByIds(ids, options);
  }

  async findMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options?: FindOptions<T>,
  ): Promise<DatabaseResult<T[]>> {
    return this._getRepo(collection).findMany(query, options);
  }

  async findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options?: FindOptions<T>,
  ): Promise<DatabaseResult<T | null>> {
    return this._getRepo(collection).findOne(query, options);
  }

  async insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const res = await this._getRepo(collection).insert(data, options);
    if (res.success) await this.adapter.invalidateQueryCache(collection, options?.tenantId);
    return res;
  }

  async insertMany<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T[]>> {
    const res = await this._getRepo(collection).insertMany(data, options);
    if (res.success) await this.adapter.invalidateQueryCache(collection, options?.tenantId);
    return res;
  }

  async update<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const res = await this._getRepo(collection).update(id, data, options);
    if (res.success) await this.adapter.invalidateQueryCache(collection, options?.tenantId);
    return res;
  }

  async updateMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityUpdate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    const res = await this._getRepo(collection).updateMany(query, data, options);
    if (res.success) await this.adapter.invalidateQueryCache(collection, options?.tenantId);
    return res;
  }

  async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const res = await this._getRepo(collection).upsert(query, data, options);
    if (res.success) await this.adapter.invalidateQueryCache(collection, options?.tenantId);
    return res;
  }

  async upsertMany<T extends BaseEntity>(
    collection: string,
    items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T[] | { upsertedCount: number; modifiedCount: number }>> {
    const res = await this._getRepo(collection).upsertMany(items, options);
    if (res.success) await this.adapter.invalidateQueryCache(collection, options?.tenantId);
    return res as any;
  }
}
