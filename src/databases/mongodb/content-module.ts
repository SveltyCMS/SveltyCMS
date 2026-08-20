/**
 * @file src/databases/mongodb/content-module.ts
 * @description Consolidated Content module for MongoDB.
 * Merges nodes, drafts, revisions, and structure trees into a single domain module.
 */

import { DatabaseModule } from "../core/base-adapter";
import type {
  IContentAdapter,
  DatabaseId,
  EntityCreate,
  ContentNode,
  ContentDraft,
  ContentRevision,
  PaginationOptions,
  DatabaseResult,
  PaginatedResult,
  QueryFilter,
} from "../db-interface";
import type { MongoAdapterCore } from "./adapter-core";
import { MongoCrudMethods } from "./crud-methods";
import { CacheCategory, invalidateCategoryCache, withCache } from "./mongodb-cache-utils";
import { createDatabaseError, generateId, processDates } from "./mongodb-utils";
import { normalizeId } from "./normalize-id";
import { assertTenantContext, safeQuery } from "@src/utils/security/safe-query";
import { logger } from "@utils/logger";
import type { Model, QueryFilter as MongoQueryFilter } from "mongoose";

/**
 * Converts a flat array of content nodes into a nested tree.
 */
export function buildTree(nodes: ContentNode[]): ContentNode[] {
  const nodeMap = new Map<string, ContentNode>();
  const roots: ContentNode[] = [];

  for (const node of nodes) {
    const nodeId = typeof node._id === "string" ? node._id : String(node._id);
    nodeMap.set(nodeId, { ...node, children: [] });
  }

  for (const node of nodeMap.values()) {
    if (node.parentId) {
      const parentId = typeof node.parentId === "string" ? node.parentId : String(node.parentId);
      const parent = nodeMap.get(parentId);
      if (parent) {
        parent.children?.push(node);
      } else {
        logger.warn(
          `[buildTree] Parent ${parentId} not found for node ${node._id}, treating as root`,
        );
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export class MongoContentModule
  extends DatabaseModule<MongoAdapterCore>
  implements IContentAdapter
{
  private _nodesRepo: MongoCrudMethods<ContentNode> | null = null;
  private _draftsRepo: MongoCrudMethods<ContentDraft> | null = null;
  private _revisionsRepo: MongoCrudMethods<ContentRevision> | null = null;

  private async _ensureRepos() {
    if (this._nodesRepo && this._draftsRepo && this._revisionsRepo) {
      return {
        nodesRepo: this._nodesRepo,
        draftsRepo: this._draftsRepo,
        revisionsRepo: this._revisionsRepo,
      };
    }

    const { contentStructureSchema } = await import("./content-structure");
    const { draftSchema } = await import("./draft");
    const { revisionSchema } = await import("./revision");

    const nodeModel = (this.adapter as any)._getOrCreateModel(
      "system_content_structure",
      contentStructureSchema,
    );
    const draftModel = (this.adapter as any)._getOrCreateModel("content_drafts", draftSchema);
    const revisionModel = (this.adapter as any)._getOrCreateModel(
      "content_revisions",
      revisionSchema,
    );

    this._nodesRepo = new MongoCrudMethods(nodeModel, this.adapter);
    this._draftsRepo = new MongoCrudMethods(draftModel, this.adapter);
    this._revisionsRepo = new MongoCrudMethods(revisionModel, this.adapter);

    return {
      nodesRepo: this._nodesRepo,
      draftsRepo: this._draftsRepo,
      revisionsRepo: this._revisionsRepo,
    };
  }

  // ─── Draft Operations ────────────────────────────────────────────────────────
  drafts = {
    create: async (draft: EntityCreate<ContentDraft>): Promise<DatabaseResult<ContentDraft>> => {
      const { draftsRepo } = await this._ensureRepos();
      return draftsRepo.insert(draft as any);
    },
    createMany: async (drafts: EntityCreate<ContentDraft>[]) => {
      const { draftsRepo } = await this._ensureRepos();
      return draftsRepo.insertMany(drafts);
    },
    update: async (draftId: DatabaseId, data: unknown) => {
      const { draftsRepo } = await this._ensureRepos();
      return draftsRepo.update(draftId, { data } as any);
    },
    publish: async (draftId: DatabaseId) =>
      this.drafts.publishMany([draftId]).then((res) => ({ ...res, data: undefined })),
    publishMany: async (
      draftIds: DatabaseId[],
    ): Promise<DatabaseResult<{ publishedCount: number }>> => {
      if (draftIds.length === 0) {
        return { success: true, data: { publishedCount: 0 } };
      }
      try {
        const { draftsRepo } = await this._ensureRepos();
        const result = await draftsRepo.model.updateMany({ _id: { $in: draftIds } } as any, {
          $set: {
            status: "publish",
            publishedAt: new Date().toISOString() as any,
          },
        });
        return { success: true, data: { publishedCount: result.modifiedCount } };
      } catch (error) {
        return {
          success: false,
          message: "Failed to publish drafts.",
          error: createDatabaseError(
            error,
            "DRAFT_BULK_PUBLISH_ERROR",
            "Failed to publish drafts.",
          ),
        };
      }
    },
    getForContent: async (
      contentId: DatabaseId,
      options?: PaginationOptions,
    ): Promise<DatabaseResult<PaginatedResult<ContentDraft>>> => {
      try {
        const { draftsRepo } = await this._ensureRepos();
        const { page = 1, pageSize = 10 } = options || {};
        const query = { contentId } as unknown as QueryFilter<ContentDraft>;

        const [itemsRes, totalRes] = await Promise.all([
          draftsRepo.findMany(query, {
            offset: (page - 1) * pageSize,
            limit: pageSize,
          } as any),
          draftsRepo.count(query),
        ]);

        if (!itemsRes.success) {
          return { success: false, message: itemsRes.message, error: itemsRes.error };
        }
        if (!totalRes.success) {
          return { success: false, message: totalRes.message, error: totalRes.error };
        }

        return {
          success: true,
          data: {
            items: itemsRes.data,
            total: totalRes.data,
            page,
            pageSize,
            hasNextPage: page * pageSize < totalRes.data,
            hasPreviousPage: page > 1,
          },
        };
      } catch (error) {
        return {
          success: false,
          message: "Failed to fetch drafts for content.",
          error: createDatabaseError(
            error,
            "DRAFT_FETCH_ERROR",
            "Failed to fetch drafts for content.",
          ),
        };
      }
    },
    restore: async (draftId: DatabaseId) => {
      const { draftsRepo } = await this._ensureRepos();
      const res = await draftsRepo.restore(draftId);
      return res.success ? { success: true as const, data: undefined } : res;
    },
    delete: async (draftId: DatabaseId) => {
      const { draftsRepo } = await this._ensureRepos();
      return draftsRepo.delete(draftId);
    },
    deleteMany: async (draftIds: DatabaseId[]) => {
      const { draftsRepo } = await this._ensureRepos();
      const res = await draftsRepo.deleteMany({ _id: { $in: draftIds } } as any, {
        permanent: true,
      });
      if (res.success) {
        return {
          success: true as const,
          data: { deletedCount: res.data?.deletedCount || 0 },
        };
      }
      return {
        success: false as const,
        message: res.message,
        error: res.error,
      };
    },
  };

  // ─── Node / Structure Operations ─────────────────────────────────────────────
  nodes = {
    getStructure: async (
      mode: "flat" | "nested" = "flat",
      options: {
        filter?: Partial<ContentNode>;
        tenantId?: string | null;
        bypassCache?: boolean;
        bypassTenantCheck?: boolean;
        bypassSafeQuery?: boolean;
      } = {},
    ): Promise<DatabaseResult<ContentNode[]>> => {
      const {
        filter = {},
        tenantId = null,
        bypassCache = false,
        bypassTenantCheck = false,
        bypassSafeQuery = false,
      } = options;

      assertTenantContext(
        { tenantId: tenantId ?? filter.tenantId, bypassTenantCheck, bypassSafeQuery },
        "content.nodes.getStructure",
      );

      const filterKey = JSON.stringify(filter);
      const cacheKey = `content:structure:${mode}:${tenantId}:${filterKey}`;

      const fetchData = async (): Promise<DatabaseResult<ContentNode[]>> => {
        const { nodesRepo } = await this._ensureRepos();
        const fetchOptions: {
          tenantId?: string | null;
          bypassTenantCheck?: boolean;
          bypassSafeQuery?: boolean;
        } = {
          bypassTenantCheck,
          bypassSafeQuery,
        };
        if (tenantId) {
          fetchOptions.tenantId = tenantId;
        } else if (filter.tenantId) {
          fetchOptions.tenantId = filter.tenantId;
        }
        const result = await nodesRepo.findMany(filter, fetchOptions as any);
        if (!result.success) {
          return result;
        }

        if (mode === "flat") {
          return result;
        }

        return { success: true, data: buildTree(result.data) };
      };

      if (bypassCache) {
        return fetchData();
      }

      return withCache(cacheKey, fetchData, { category: CacheCategory.CONTENT });
    },

    upsertContentStructureNode: async (
      node: EntityCreate<ContentNode>,
    ): Promise<DatabaseResult<ContentNode>> => {
      const { nodesRepo } = await this._ensureRepos();
      return nodesRepo.upsert({ path: node.path } as any, node as any);
    },

    create: async (node: EntityCreate<ContentNode>): Promise<DatabaseResult<ContentNode>> => {
      try {
        const { nodesRepo } = await this._ensureRepos();
        const { path, parentId } = node;
        const normalizedParentId = normalizeId(parentId);

        const secureFilter = safeQuery({ path } as any, node.tenantId as string, {
          includeDeleted: true,
        }) as MongoQueryFilter<ContentNode>;

        const result = await nodesRepo.model
          .findOneAndUpdate(
            secureFilter,
            {
              $set: {
                ...node,
                parentId: normalizedParentId,
                updatedAt: new Date().toISOString() as any,
              },
              $setOnInsert: {
                _id: generateId(),
                createdAt: new Date().toISOString() as any,
                ...(node.tenantId != null ? { tenantId: node.tenantId } : {}),
              },
            },
            { returnDocument: "after", upsert: true, runValidators: true },
          )
          .lean()
          .exec();

        await invalidateCategoryCache(CacheCategory.CONTENT);
        return { success: true, data: processDates(result) as ContentNode };
      } catch (error) {
        return {
          success: false,
          message: "Failed to upsert content structure node.",
          error: createDatabaseError(
            error,
            "NODE_UPSERT_ERROR",
            "Failed to upsert content structure node.",
          ),
        };
      }
    },

    createMany: async (nodes: EntityCreate<ContentNode>[]) => {
      const validNodes = nodes
        .filter((n) => n.path)
        .map((n) => ({ path: n.path as string, changes: n as any }));
      return this.nodes.bulkUpdate(validNodes);
    },

    update: async (path: string, changes: Partial<ContentNode>) => {
      const res = await this.nodes.bulkUpdate([{ path, changes: changes as any }]);
      if (res.success) {
        if (res.data && res.data[0]) {
          return { success: true as const, data: res.data[0] };
        }
        return {
          success: false as const,
          message: "Update failed",
          error: createDatabaseError(
            new Error("Update failed"),
            "NODE_UPDATE_ERROR",
            "Update failed",
          ),
        };
      }
      return {
        success: false as const,
        message: res.message || "Update failed",
        error: res.error,
      };
    },

    bulkUpdate: async (
      updates: Array<{
        path: string;
        id?: string;
        changes: Partial<ContentNode>;
      }>,
      options: {
        tenantId?: string | null;
        bypassTenantCheck?: boolean;
        bypassCache?: boolean;
      } = {},
    ): Promise<DatabaseResult<ContentNode[]>> => {
      if (updates.length === 0) {
        return { success: true, data: [] };
      }
      try {
        const { nodesRepo } = await this._ensureRepos();
        const operations = updates.map(({ path, id, changes }) => {
          const tenantId = options.tenantId ?? (changes as any).tenantId;
          const { _id, createdAt: _createdAt, ...safeChanges } = changes;
          const normalizedChanges = { ...safeChanges } as Partial<ContentNode>;

          if ("parentId" in normalizedChanges) {
            const originalParentId = normalizedChanges.parentId;
            const normalizedParentId = normalizeId(originalParentId);
            normalizedChanges.parentId = normalizedParentId as DatabaseId;
          }

          const targetId = id || _id;
          const baseFilter: Record<string, unknown> = { path };
          if (tenantId != null && tenantId !== undefined) {
            baseFilter.tenantId = tenantId;
          }

          const secureFilter = safeQuery(baseFilter as any, tenantId, {
            bypassTenantCheck: options?.bypassTenantCheck,
            includeDeleted: true,
            bypassSafeQuery: (options as any)?.bypassSafeQuery,
          }) as MongoQueryFilter<ContentNode>;

          const setOnInsert: Record<string, unknown> = {
            createdAt: new Date().toISOString() as any,
          };
          if (targetId) {
            setOnInsert._id = targetId;
          } else {
            setOnInsert._id = generateId();
          }
          if (tenantId != null && tenantId !== undefined) {
            setOnInsert.tenantId = tenantId;
          }

          delete (normalizedChanges as any).tenantId;

          return {
            updateOne: {
              filter: secureFilter,
              update: {
                $set: {
                  ...normalizedChanges,
                  updatedAt: new Date().toISOString() as any,
                },
                $setOnInsert: setOnInsert,
              },
              upsert: true,
            },
          };
        });

        await nodesRepo.model.collection.bulkWrite(operations as any);
        await invalidateCategoryCache(CacheCategory.CONTENT);

        return {
          success: true,
          data: processDates(updates.map((u) => ({ ...u.changes, path: u.path }) as ContentNode)),
        };
      } catch (error) {
        return {
          success: false,
          message: "Failed to perform bulk update on nodes.",
          error: createDatabaseError(
            error,
            "NODE_BULK_UPDATE_ERROR",
            "Failed to perform bulk update on nodes.",
          ),
        };
      }
    },

    reorder: async (updates: Array<{ path: string; newOrder: number }>) => {
      const bulkUpdates = updates.map((u) => ({
        path: u.path,
        changes: { order: u.newOrder } as any,
      }));
      return this.nodes.bulkUpdate(bulkUpdates);
    },

    reorderStructure: async (
      items: Array<{
        id: string;
        parentId: string | null;
        order: number;
        path: string;
      }>,
    ): Promise<DatabaseResult<void>> => {
      try {
        const { nodesRepo } = await this._ensureRepos();
        const modelWithReorder = nodesRepo.model as Model<ContentNode> & {
          reorderStructure(items: unknown[]): Promise<DatabaseResult<void>>;
        };

        const result = await modelWithReorder.reorderStructure(items);
        if (!result.success) {
          return {
            success: false,
            message: result.message || "Reorder failed",
            error: result.error,
          };
        }
        await invalidateCategoryCache(CacheCategory.CONTENT);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          message: "Failed to reorder content structure.",
          error: createDatabaseError(
            error,
            "NODE_REORDER_ERROR",
            "Failed to reorder content structure.",
          ),
        };
      }
    },

    delete: async (path: string): Promise<DatabaseResult<void>> => {
      try {
        const { nodesRepo } = await this._ensureRepos();
        const result = await nodesRepo.model.deleteOne({ path }).exec();
        if (result.deletedCount === 0) {
          logger.warn(`[deleteNodeByPath] Node not found for path="${path}".`);
        }
        await invalidateCategoryCache(CacheCategory.CONTENT);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          message: "Failed to delete content structure node.",
          error: createDatabaseError(
            error,
            "NODE_DELETE_ERROR",
            "Failed to delete content structure node.",
          ),
        };
      }
    },

    deleteMany: async (
      paths: string[],
      options: { tenantId?: string | null } = {},
    ): Promise<DatabaseResult<{ deletedCount: number }>> => {
      if (paths.length === 0) {
        return { success: true, data: { deletedCount: 0 } };
      }
      try {
        const { nodesRepo } = await this._ensureRepos();
        const { tenantId = null } = options;
        const baseFilter = { path: { $in: paths } };
        const secureFilter = safeQuery(baseFilter as any, tenantId, {
          bypassSafeQuery: (options as any)?.bypassSafeQuery,
        }) as MongoQueryFilter<ContentNode>;

        const result = await nodesRepo.model.deleteMany(secureFilter).exec();
        await invalidateCategoryCache(CacheCategory.CONTENT);

        return { success: true, data: { deletedCount: result.deletedCount } };
      } catch (error) {
        return {
          success: false,
          message: "Failed to delete multiple content structure nodes.",
          error: createDatabaseError(
            error,
            "NODE_DELETE_MANY_ERROR",
            "Failed to delete multiple content structure nodes.",
          ),
        };
      }
    },
  };

  // ─── Revision Operations ─────────────────────────────────────────────────────
  revisions = {
    create: async (revision: any): Promise<DatabaseResult<ContentRevision>> => {
      const { revisionsRepo } = await this._ensureRepos();
      return revisionsRepo.insert(revision);
    },
    getHistory: async (
      contentId: DatabaseId,
      options?: PaginationOptions,
    ): Promise<DatabaseResult<PaginatedResult<ContentRevision>>> => {
      try {
        const { revisionsRepo } = await this._ensureRepos();
        const { page = 1, pageSize = 25 } = options || {};
        const query = { contentId } as MongoQueryFilter<ContentRevision>;

        const totalRes = await revisionsRepo.count(
          query as unknown as QueryFilter<ContentRevision>,
        );
        if (!totalRes.success) {
          return { success: false, message: totalRes.message, error: totalRes.error };
        }

        const items = processDates(
          (await revisionsRepo.model
            .find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean()
            .exec()) as unknown[],
        ) as ContentRevision[];

        return {
          success: true,
          data: {
            items,
            total: totalRes.data,
            page,
            pageSize,
            hasNextPage: page * pageSize < totalRes.data,
            hasPreviousPage: page > 1,
          },
        };
      } catch (error) {
        return {
          success: false,
          message: "Failed to fetch revision history.",
          error: createDatabaseError(
            error,
            "REVISION_FETCH_ERROR",
            "Failed to fetch revision history.",
          ),
        };
      }
    },
    restore: async (revisionId: DatabaseId) => {
      const { revisionsRepo } = await this._ensureRepos();
      const res = await revisionsRepo.restore(revisionId);
      return res.success ? { success: true as const, data: undefined } : res;
    },
    delete: async (revisionId: DatabaseId) => {
      const { revisionsRepo } = await this._ensureRepos();
      return revisionsRepo.delete(revisionId);
    },
    deleteMany: async (revisionIds: DatabaseId[]) => {
      const { revisionsRepo } = await this._ensureRepos();
      const res = await revisionsRepo.deleteMany({ _id: { $in: revisionIds } } as any, {
        permanent: true,
      });
      if (res.success) {
        return {
          success: true as const,
          data: { deletedCount: res.data?.deletedCount || 0 },
        };
      }
      return {
        success: false as const,
        message: res.message,
        error: res.error,
      };
    },
    cleanup: async (
      contentId: DatabaseId,
      keepLatest: number,
    ): Promise<DatabaseResult<{ deletedCount: number }>> => {
      try {
        const { revisionsRepo } = await this._ensureRepos();
        const revisionsToKeep = await revisionsRepo.model
          .find({ contentId })
          .sort({ createdAt: -1 })
          .limit(keepLatest)
          .select("_id")
          .lean()
          .exec();

        const keepIds = (revisionsToKeep as unknown as { _id: { toString(): string } }[]).map(
          (r) => r._id.toString() as DatabaseId,
        );

        return await revisionsRepo.deleteMany({
          contentId,
          _id: {
            $nin: keepIds,
          } as unknown as QueryFilter<ContentRevision>["_id"],
        } as QueryFilter<ContentRevision>);
      } catch (error) {
        return {
          success: false,
          message: "Failed to cleanup old revisions.",
          error: createDatabaseError(
            error,
            "REVISION_CLEANUP_ERROR",
            "Failed to cleanup old revisions.",
          ),
        };
      }
    },
  };
}
