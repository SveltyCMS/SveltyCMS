/**
 * @file src/databases/postgresql/modules/content/content-module.ts
 * @description Content management module for PostgreSQL
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date-utils";
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

export class ContentModule {
  private readonly core: AdapterCore;

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db!;
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
        tenantId?: DatabaseId | null;
        bypassCache?: boolean;
        bypassTenantCheck?: boolean;
      },
    ): Promise<DatabaseResult<ContentNode[]>> => {
      return this.crud.findMany<ContentNode>("content_nodes", (options?.filter || {}) as any, {
        tenantId: options?.tenantId as DatabaseId,
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
        // Explicitly map properties to avoid sending non-column props to Drizzle
        const c = changes as any;
        const updateData: any = {
          updatedAt: isoDateStringToDate(nowISODateString()),
        };
        if (c.status !== undefined) updateData.status = c.status;
        if (c.name !== undefined) updateData.name = c.name;
        if (c.slug !== undefined) updateData.slug = c.slug;
        if (c.icon !== undefined) updateData.icon = c.icon;
        if (c.description !== undefined) updateData.description = c.description;
        if (c.data !== undefined) updateData.data = c.data;
        if (c.parentId !== undefined) updateData.parentId = c.parentId;

        const [updated] = await this.db
          .update(schema.contentNodes)
          .set(updateData)
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
      return this.core.wrap(async () => {
        const results: ContentNode[] = [];
        for (const update of updates) {
          const res = await this.nodes.update(update.path, update.changes);
          if (res.success && res.data) results.push(res.data);
        }
        return results;
      }, "BULK_UPDATE_NODES_FAILED");
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
      return this.core.wrap(async () => {
        for (const item of items) {
          await this.db
            .update(schema.contentNodes)
            .set({
              parentId: item.parentId,
              order: item.order,
              path: item.path,
            })
            .where(eq(schema.contentNodes._id, item.id));
        }
      }, "REORDER_STRUCTURE_FAILED");
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
