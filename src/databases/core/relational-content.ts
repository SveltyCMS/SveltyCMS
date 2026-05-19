/**
 * @file src/databases/core/relational-content.ts
 * @description Consolidated Content module for all SQL-based database adapters.
 * Merges nodes, drafts, and revisions into a single domain module.
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date";
import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  ContentDraft,
  ContentNode,
  ContentRevision,
  DatabaseId,
  DatabaseResult,
  PaginatedResult,
  PaginationOptions,
  EntityCreate,
  IContentAdapter,
  BaseQueryOptions,
} from "../db-interface";
import type { BaseSqlAdapter } from "./base-sql-adapter";
import * as utils from "./relational-utils";

export class RelationalContentModule implements IContentAdapter {
  protected readonly adapter: BaseSqlAdapter;
  protected readonly schema: any;

  constructor(adapter: BaseSqlAdapter, schema: any) {
    this.adapter = adapter;
    this.schema = schema;
  }

  protected get db() {
    return (this.adapter as any).db;
  }

  protected get crud() {
    return this.adapter.crud;
  }

  protected getDb(options?: BaseQueryOptions) {
    const tx = options?.transaction;
    if (tx) {
      return tx.db || tx;
    }
    return this.db;
  }

  // ============================================================
  // DRAFTS
  // ============================================================
  public readonly drafts = {
    create: async (draft: EntityCreate<ContentDraft>): Promise<DatabaseResult<ContentDraft>> => {
      return this.crud.insert<ContentDraft>("content_drafts", draft);
    },

    createMany: async (
      drafts: EntityCreate<ContentDraft>[],
    ): Promise<DatabaseResult<ContentDraft[]>> => {
      return this.crud.insertMany<ContentDraft>("content_drafts", drafts);
    },

    update: async (draftId: DatabaseId, data: any): Promise<DatabaseResult<ContentDraft>> => {
      return this.crud.update<ContentDraft>("content_drafts", draftId, data);
    },

    publish: async (
      draftId: DatabaseId,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<void>> => {
      return this.adapter.wrap(
        async () => {
          await this.getDb(options)
            .update(this.schema.contentDrafts)
            .set({ status: "archived" })
            .where(eq(this.schema.contentDrafts._id, draftId as string));
        },
        "PUBLISH_DRAFT_FAILED",
        undefined,
        { transaction: options?.transaction, isWrite: true },
      );
    },

    publishMany: async (
      draftIds: DatabaseId[],
    ): Promise<DatabaseResult<{ publishedCount: number }>> => {
      return this.adapter.wrap(
        async () => {
          const result = await this.db
            .update(this.schema.contentDrafts)
            .set({ status: "archived" })
            .where(inArray(this.schema.contentDrafts._id, draftIds as string[]))
            .returning();
          return { publishedCount: result.length };
        },
        "PUBLISH_MANY_DRAFTS_FAILED",
        undefined,
        { isWrite: true },
      );
    },

    getForContent: async (
      contentId: DatabaseId,
      options?: PaginationOptions,
      dbOptions?: BaseQueryOptions,
    ): Promise<DatabaseResult<PaginatedResult<ContentDraft>>> => {
      return this.adapter.wrap(
        async () => {
          const limit = options?.pageSize || 20;
          const offset = ((options?.page || 1) - 1) * limit;

          const results = await this.getDb(dbOptions)
            .select(this.adapter.getPhysicalSelection(this.schema.contentDrafts))
            .from(this.schema.contentDrafts)
            .where(eq(this.schema.contentDrafts.contentId, contentId as string))
            .limit(limit)
            .offset(offset)
            .orderBy(desc(this.schema.contentDrafts.version));

          return {
            items: utils.convertArrayDatesToISO(results) as unknown as ContentDraft[],
            total: results.length,
            page: options?.page || 1,
            pageSize: limit,
            hasNextPage: false,
            hasPreviousPage: false,
          };
        },
        "GET_DRAFTS_FAILED",
        undefined,
        { transaction: dbOptions?.transaction },
      );
    },

    restore: async (draftId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.crud.restore("content_drafts", draftId);
    },

    delete: async (draftId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.crud.delete("content_drafts", draftId);
    },

    deleteMany: async (
      draftIds: DatabaseId[],
    ): Promise<DatabaseResult<{ deletedCount: number }>> => {
      return this.crud.deleteMany("content_drafts", {
        _id: { $in: draftIds },
      } as any);
    },
  };

  // ============================================================
  // NODES
  // ============================================================
  public readonly nodes = {
    getStructure: async (
      _mode: "flat" | "nested",
      options?: {
        filter?: Partial<ContentNode>;
        tenantId?: DatabaseId | null;
        bypassCache?: boolean;
        bypassTenantCheck?: boolean;
      },
    ): Promise<DatabaseResult<ContentNode[]>> => {
      return this.crud.findMany<ContentNode>("content_nodes", (options?.filter || {}) as any, {
        tenantId: options?.tenantId as any,
        bypassTenantCheck: options?.bypassTenantCheck,
      });
    },

    upsertContentStructureNode: async (
      node: EntityCreate<ContentNode>,
    ): Promise<DatabaseResult<ContentNode>> => {
      const tenantId = (node as any).tenantId;

      // 🚀 NATIVE PERFORMANCE: Use engine-specific upsert if available (SQLite, Postgres, MariaDB)
      if (this.adapter.type !== "mongodb" && (this.adapter as any).upsertNative) {
        return this.adapter.wrap(
          async () => {
            const now = new Date();
            const table = this.schema.contentNodes;

            // 🚀 Ensure data is correctly mapped to columns vs JSON data field
            const preparedValues = (this.adapter as any).prepareValues(
              table,
              node,
              (node as any)._id,
              now,
              { tenantId },
            );

            // Conflict columns for content_nodes is the primary key _id
            const conflictCols = [table._id];

            if (process.env.BENCHMARK_DEBUG === "true") {
              console.log(
                `[RelationalContent] Upserting structure node: ${(node as any)._id}, type: ${node.nodeType}, tenant: ${node.tenantId}`,
              );
            }
            await (this.adapter as any).upsertNative(table, preparedValues, conflictCols);

            return utils.convertDatesToISO(preparedValues) as unknown as ContentNode;
          },
          "UPSERT_STRUCTURE_NODE_FAILED",
          undefined,
          { isWrite: true },
        );
      }

      // Fallback to standard CRUD for MongoDB or non-relational adapters
      return this.crud.upsert<ContentNode>(
        "content_nodes",
        { path: node.path, tenantId } as any,
        node,
        { tenantId },
      );
    },

    create: async (node: EntityCreate<ContentNode>): Promise<DatabaseResult<ContentNode>> => {
      return this.crud.insert<ContentNode>("content_nodes", node);
    },

    createMany: async (
      nodes: EntityCreate<ContentNode>[],
    ): Promise<DatabaseResult<ContentNode[]>> => {
      return this.crud.insertMany<ContentNode>("content_nodes", nodes);
    },

    update: async (
      path: string,
      changes: Partial<ContentNode>,
      options: { tx?: any } = {},
    ): Promise<DatabaseResult<ContentNode>> => {
      // 🛡️ HARDENING: Prevent driver-level crashes if path is accidentally undefined/null
      if (!path) {
        return {
          success: false,
          message: "Path is required for node update",
          error: { code: "INVALID_PATH", message: "Path is undefined" },
        };
      }

      return this.adapter.wrap(
        async () => {
          const db = options.tx?.db || options.tx || this.db;
          const now = isoDateStringToDate(nowISODateString());

          // Use dialect-specific returning if supported
          const query = db
            .update(this.schema.contentNodes)
            .set(
              utils.convertISOToDates({
                ...changes,
                updatedAt: now,
              }) as any,
            )
            .where(eq(this.schema.contentNodes.path, path));

          if (this.adapter.type === "sqlite" || this.adapter.type === "postgresql") {
            const [updated] = await query.returning();
            if (updated) return utils.convertDatesToISO(updated) as unknown as ContentNode;
          }

          // Fallback for MariaDB or missing returning
          await query;
          const [updated] = await this.db
            .select(this.adapter.getPhysicalSelection(this.schema.contentNodes))
            .from(this.schema.contentNodes)
            .where(eq(this.schema.contentNodes.path, path))
            .limit(1);

          return utils.convertDatesToISO(updated) as unknown as ContentNode;
        },
        "UPDATE_NODE_FAILED",
        undefined,
        { isWrite: true },
      );
    },

    bulkUpdate: async (
      updates: { path: string; id?: string; changes: Partial<ContentNode> }[],
      _options?: {
        tenantId?: string | null;
        bypassTenantCheck?: boolean;
        bypassCache?: boolean;
      },
    ): Promise<DatabaseResult<ContentNode[]>> => {
      return this.adapter.transaction(async (tx: any) => {
        const results: ContentNode[] = [];
        for (const update of updates) {
          const res = await this.nodes.update(update.path, update.changes, {
            tx: (tx as any).db || tx,
          });
          if (res.success && res.data) results.push(res.data);
        }
        return { success: true, data: results };
      });
    },

    delete: async (path: string): Promise<DatabaseResult<void>> => {
      // 🛡️ HARDENING: Prevent driver-level crashes if path is accidentally undefined/null
      if (!path) {
        return {
          success: false,
          message: "Path is required for node delete",
          error: { code: "INVALID_PATH", message: "Path is undefined" },
        };
      }

      return this.adapter.wrap(
        async () => {
          await this.db
            .delete(this.schema.contentNodes)
            .where(eq(this.schema.contentNodes.path, path));
        },
        "DELETE_NODE_FAILED",
        undefined,
        { isWrite: true },
      );
    },

    deleteMany: async (
      paths: string[],
      options?: { tenantId?: string | null },
    ): Promise<DatabaseResult<{ deletedCount: number }>> => {
      return this.adapter.wrap(
        async () => {
          const conditions = [inArray(this.schema.contentNodes.path, paths)];
          if (options?.tenantId)
            conditions.push(eq(this.schema.contentNodes.tenantId, options.tenantId));
          const q = this.db.delete(this.schema.contentNodes).where(and(...conditions));

          let count = 0;
          if (this.adapter.type === "sqlite" || this.adapter.type === "postgresql") {
            const result = await (q as any).returning();
            count = result.length;
          } else {
            const [result] = await q;
            count = (result as any).affectedRows || 0;
          }
          return { deletedCount: count };
        },
        "DELETE_MANY_NODES_FAILED",
        undefined,
        { isWrite: true },
      );
    },

    reorder: async (
      nodeUpdates: Array<{ path: string; newOrder: number }>,
    ): Promise<DatabaseResult<ContentNode[]>> => {
      return this.adapter.wrap(
        async () => {
          for (const update of nodeUpdates) {
            await this.nodes.update(update.path, { position: update.newOrder } as any);
          }
          return [];
        },
        "REORDER_NODES_FAILED",
        undefined,
        { isWrite: true },
      );
    },

    reorderStructure: async (
      items: Array<{
        id: string;
        parentId: string | null;
        order: number;
        path: string;
      }>,
    ): Promise<DatabaseResult<void>> => {
      return this.adapter.transaction(
        async (tx: any) => {
          const db = (tx as any).db || tx;
          for (const item of items) {
            await db
              .update(this.schema.contentNodes)
              .set({
                parentId: item.parentId,
                position: item.order,
                path: item.path,
              })
              .where(eq(this.schema.contentNodes._id, item.id));
          }
          return { success: true, data: undefined };
        },
        { isWrite: true },
      );
    },
  };

  // ============================================================
  // REVISIONS
  // ============================================================
  public readonly revisions = {
    create: async (
      revision: EntityCreate<ContentRevision>,
    ): Promise<DatabaseResult<ContentRevision>> => {
      return this.crud.insert<ContentRevision>("content_revisions", revision);
    },

    getHistory: async (
      contentId: DatabaseId,
      options?: PaginationOptions,
    ): Promise<DatabaseResult<PaginatedResult<ContentRevision>>> => {
      return this.adapter.wrap(async () => {
        const limit = options?.pageSize || 20;
        const offset = ((options?.page || 1) - 1) * limit;

        const results = await this.db
          .select(this.adapter.getPhysicalSelection(this.schema.contentRevisions))
          .from(this.schema.contentRevisions)
          .where(eq(this.schema.contentRevisions.contentId, contentId as string))
          .limit(limit)
          .offset(offset)
          .orderBy(desc(this.schema.contentRevisions.version));

        return {
          items: utils.convertArrayDatesToISO(results) as unknown as ContentRevision[],
          total: results.length,
          page: options?.page || 1,
          pageSize: limit,
          hasNextPage: false,
          hasPreviousPage: false,
        };
      }, "GET_REVISIONS_FAILED");
    },

    restore: async (revisionId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.crud.restore("content_revisions", revisionId);
    },

    delete: async (revisionId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.crud.delete("content_revisions", revisionId);
    },

    deleteMany: async (
      revisionIds: DatabaseId[],
    ): Promise<DatabaseResult<{ deletedCount: number }>> => {
      return this.crud.deleteMany("content_revisions", {
        _id: { $in: revisionIds },
      } as any);
    },

    cleanup: async (
      contentId: DatabaseId,
      keepLatest: number,
    ): Promise<DatabaseResult<{ deletedCount: number }>> => {
      return this.adapter.wrap(async () => {
        const history = await this.revisions.getHistory(contentId, {
          pageSize: 1000,
        });
        if (!history.success || history.data.items.length <= keepLatest) return { deletedCount: 0 };
        const toDelete = history.data.items.slice(keepLatest).map((i) => i._id);
        const deleteRes = await this.revisions.deleteMany(toDelete);
        if (!deleteRes.success) throw deleteRes.error;
        return deleteRes.data;
      }, "CLEANUP_REVISIONS_FAILED");
    },
  };
}
