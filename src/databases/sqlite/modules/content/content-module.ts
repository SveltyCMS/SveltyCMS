/**
 * @file src/databases/sqlite/modules/content/content-module.ts
 * @description Content management module for SQLite
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
} from "../../../db-interface";
import type { AdapterCore } from "../../adapter/adapter-core";
import { schema } from "../../schema";
import * as utils from "../../utils";

import { DatabaseModule } from "../../../base-adapter";

export class ContentModule extends DatabaseModule<AdapterCore> {
  constructor(core: AdapterCore) {
    super(core);
  }

  protected get core() {
    return this.adapter;
  }

  private get crud() {
    return this.core.crud;
  }

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

    publish: async (draftId: DatabaseId): Promise<DatabaseResult<void>> => {
      return this.core.wrap(async () => {
        await this.db
          .update(schema.contentDrafts)
          .set({ status: "archived" })
          .where(eq(schema.contentDrafts._id, draftId as string));
      }, "PUBLISH_DRAFT_FAILED");
    },

    publishMany: async (
      draftIds: DatabaseId[],
    ): Promise<DatabaseResult<{ publishedCount: number }>> => {
      return this.core.wrap(async () => {
        const result = await this.db
          .update(schema.contentDrafts)
          .set({ status: "archived" })
          .where(inArray(schema.contentDrafts._id, draftIds as string[]))
          .returning();
        return { publishedCount: result.length };
      }, "PUBLISH_MANY_DRAFTS_FAILED");
    },

    getForContent: async (
      contentId: DatabaseId,
      options?: PaginationOptions,
    ): Promise<DatabaseResult<PaginatedResult<ContentDraft>>> => {
      return this.core.wrap(async () => {
        const limit = options?.pageSize || 20;
        const offset = ((options?.page || 1) - 1) * limit;

        const results = await this.db
          .select()
          .from(schema.contentDrafts)
          .where(eq(schema.contentDrafts.contentId, contentId as string))
          .limit(limit)
          .offset(offset)
          .orderBy(desc(schema.contentDrafts.version));

        return {
          items: utils.convertArrayDatesToISO(results) as unknown as ContentDraft[],
          total: results.length,
          page: options?.page || 1,
          pageSize: limit,
          hasNextPage: false,
          hasPreviousPage: false,
        };
      }, "GET_DRAFTS_FAILED");
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

  public readonly nodes = {
    getStructure: async (
      _mode: "flat" | "nested",
      options?: {
        filter?: Partial<ContentNode>;
        tenantId?: string | null;
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
      return this.crud.upsert<ContentNode>("content_nodes", { path: node.path } as any, node);
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
    ): Promise<DatabaseResult<ContentNode>> => {
      return this.core.wrap(async () => {
        const [updated] = await this.db
          .update(schema.contentNodes)
          .set(
            utils.convertISOToDates({
              ...changes,
              updatedAt: isoDateStringToDate(nowISODateString()),
            }) as any,
          )
          .where(eq(schema.contentNodes.path, path))
          .returning();
        return utils.convertDatesToISO(updated) as unknown as ContentNode;
      }, "UPDATE_NODE_FAILED");
    },

    bulkUpdate: async (
      updates: { path: string; id?: string; changes: Partial<ContentNode> }[],
      _options?: {
        tenantId?: string | null;
        bypassTenantCheck?: boolean;
        bypassCache?: boolean;
      },
    ): Promise<DatabaseResult<ContentNode[]>> => {
      const startTime = performance.now();
      return this.core.transaction(async (tx: any) => {
        const results: ContentNode[] = [];
        const now = isoDateStringToDate(nowISODateString());

        // 🚀 BATCH OPTIMIZATION: We process in smaller chunks to avoid SQLite statement limits
        // but within the SAME transaction for maximum performance.
        for (const update of updates) {
          const id = update.id || (update.changes as any)._id || utils.generateId();
          const values = utils.convertISOToDates({
            ...update.changes,
            _id: id,
            path: update.path,
            tenantId: _options?.tenantId || (update.changes as any).tenantId,
            updatedAt: now,
          }) as any;

          // We use the internal DB handle from the transaction to bypass the wrap overhead per-item
          const table = schema.contentNodes;

          await tx.db.insert(table).values(values).onConflictDoUpdate({
            target: table.path,
            set: values,
          });

          // We don't select back every item to save time during bulk operations
          results.push({ ...update.changes, path: update.path, _id: id } as ContentNode);
        }

        return {
          success: true,
          data: results,
          meta: { executionTime: performance.now() - startTime },
        };
      });
    },

    delete: async (path: string): Promise<DatabaseResult<void>> => {
      return this.core.wrap(async () => {
        await this.db.delete(schema.contentNodes).where(eq(schema.contentNodes.path, path));
      }, "DELETE_NODE_FAILED");
    },

    deleteMany: async (
      paths: string[],
      options?: { tenantId?: string | null },
    ): Promise<DatabaseResult<{ deletedCount: number }>> => {
      return this.core.wrap(async () => {
        const conditions = [inArray(schema.contentNodes.path, paths)];
        if (options?.tenantId) conditions.push(eq(schema.contentNodes.tenantId, options.tenantId));
        const result = await this.db
          .delete(schema.contentNodes)
          .where(and(...conditions))
          .returning();
        return { deletedCount: result.length };
      }, "DELETE_MANY_NODES_FAILED");
    },

    reorder: async (
      nodeUpdates: Array<{ path: string; newOrder: number }>,
    ): Promise<DatabaseResult<ContentNode[]>> => {
      return this.core.wrap(async () => {
        for (const update of nodeUpdates) {
          await this.nodes.update(update.path, { order: update.newOrder });
        }
        return [];
      }, "REORDER_NODES_FAILED");
    },

    reorderStructure: async (
      items: Array<{
        id: string;
        parentId: string | null;
        order: number;
        path: string;
      }>,
    ): Promise<DatabaseResult<void>> => {
      return this.core.transaction(async (tx: any) => {
        const db = tx.db as any;
        for (const item of items) {
          await db
            .update(schema.contentNodes)
            .set({
              parentId: item.parentId,
              order: item.order,
              path: item.path,
            })
            .where(eq(schema.contentNodes._id, item.id));
        }
        return { success: true, data: undefined };
      });
    },
  };

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
      return this.core.wrap(async () => {
        const limit = options?.pageSize || 20;
        const offset = ((options?.page || 1) - 1) * limit;

        const results = await this.db
          .select()
          .from(schema.contentRevisions)
          .where(eq(schema.contentRevisions.contentId, contentId as string))
          .limit(limit)
          .offset(offset)
          .orderBy(desc(schema.contentRevisions.version));

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
      return this.core.wrap(async () => {
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
