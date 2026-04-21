/**
 * @file src/databases/mariadb/modules/content/content-module.ts
 * @description Content management module for MariaDB.
 */

import type {
  DatabaseId,
  DatabaseResult,
  ContentDraft,
  ContentRevision,
  ContentNode,
  PaginationOptions,
  PaginatedResult,
  EntityCreate,
} from "../../../db-interface";
import type { MariaDBAdapter } from "../../adapter";

export class ContentModule {
  private readonly adapter: MariaDBAdapter;

  constructor(adapter: MariaDBAdapter) {
    this.adapter = adapter;
  }

  public readonly drafts = {
    create: (draft: EntityCreate<ContentDraft>): Promise<DatabaseResult<ContentDraft>> =>
      this.adapter.crud.insert("content_drafts", draft as any),

    createMany: (drafts: EntityCreate<ContentDraft>[]): Promise<DatabaseResult<ContentDraft[]>> =>
      this.adapter.crud.insertMany("content_drafts", drafts as any[]),

    update: (draftId: DatabaseId, data: unknown): Promise<DatabaseResult<ContentDraft>> =>
      this.adapter.crud.update("content_drafts", draftId, data as any),

    publish: (draftId: DatabaseId): Promise<DatabaseResult<void>> =>
      this.adapter.wrap(async () => {
        // Simplified: in a real implementation this would merge draft into main content
        await this.adapter.crud.update("content_drafts", draftId, {
          status: "archived",
        } as any);
      }, "PUBLISH_DRAFT_FAILED"),

    publishMany: (draftIds: DatabaseId[]): Promise<DatabaseResult<{ publishedCount: number }>> =>
      this.adapter.wrap(async () => {
        for (const id of draftIds) {
          await this.drafts.publish(id);
        }
        return { publishedCount: draftIds.length };
      }, "PUBLISH_MANY_DRAFTS_FAILED"),

    getForContent: (
      contentId: DatabaseId,
      options?: PaginationOptions,
    ): Promise<DatabaseResult<PaginatedResult<ContentDraft>>> =>
      this.adapter.wrap(async () => {
        const res = await this.adapter.crud.findMany<ContentDraft>(
          "content_drafts",
          { contentId } as any,
          options as any,
        );
        return this.adapter.utils.createPagination(
          res.success ? res.data || [] : [],
          options || {},
        );
      }, "GET_DRAFTS_FAILED"),

    restore: async (draftId: DatabaseId): Promise<DatabaseResult<void>> =>
      this.adapter.crud.restore("content_drafts", draftId),

    delete: (draftId: DatabaseId): Promise<DatabaseResult<void>> =>
      this.adapter.crud.delete("content_drafts", draftId),

    deleteMany: (draftIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> =>
      this.adapter.crud.deleteMany("content_drafts", {
        _id: { $in: draftIds },
      } as any),
  };

  public readonly nodes = {
    getStructure: (
      _mode: "flat" | "nested",
      options?: {
        filter?: Partial<ContentNode>;
        tenantId?: string | null;
        bypassCache?: boolean;
        bypassTenantCheck?: boolean;
      },
    ): Promise<DatabaseResult<ContentNode[]>> =>
      this.adapter.crud.findMany("system_content_structure", (options?.filter || {}) as any, {
        tenantId: (options?.tenantId || undefined) as DatabaseId | undefined,
      }),

    upsertContentStructureNode: (
      node: EntityCreate<ContentNode>,
    ): Promise<DatabaseResult<ContentNode>> =>
      this.adapter.crud.upsert("system_content_structure", { path: node.path } as any, node as any),

    create: (node: EntityCreate<ContentNode>): Promise<DatabaseResult<ContentNode>> =>
      this.adapter.crud.insert("system_content_structure", node as any),

    createMany: (nodes: EntityCreate<ContentNode>[]): Promise<DatabaseResult<ContentNode[]>> =>
      this.adapter.crud.insertMany("system_content_structure", nodes as any[]),

    update: (path: string, changes: Partial<ContentNode>): Promise<DatabaseResult<ContentNode>> =>
      this.adapter.wrap(async () => {
        // Find node with a single retry for resiliency during concurrent reconciliation
        // Use slash-agnostic lookup: match both "/path" and "path"
        const altPath = path.startsWith("/") ? path.slice(1) : path;
        const sanitizedPath = path.startsWith("/") ? path : `/${path}`;

        let nodeRes = await this.adapter.crud.findOne<ContentNode>(
          "system_content_structure",
          {
            path: { $in: [sanitizedPath, altPath] },
          } as any,
          { bypassTenantCheck: true },
        );

        if (!nodeRes.success || !nodeRes.data) {
          // Wait 50ms and retry twice - helps with transient consistency in Bun/MariaDB during stress tests
          await new Promise((resolve) => setTimeout(resolve, 50));
          nodeRes = await this.adapter.crud.findOne<ContentNode>(
            "system_content_structure",
            {
              path: { $in: [sanitizedPath, altPath] },
            } as any,
            { bypassTenantCheck: true },
          );
        }

        if (!nodeRes.success || !nodeRes.data) {
          // DIAGNOSTIC LOGGING
          const allNodes = await this.adapter.crud.findMany<ContentNode>(
            "system_content_structure",
            {},
            { limit: 10, bypassTenantCheck: true },
          );
          const paths = (allNodes.success ? allNodes.data : [])
            .map((n: ContentNode) => `[${n.tenantId}] ${n.path}`)
            .join(", ");
          throw new Error(`Node not found: ${path}. Available paths: ${paths}`);
        }
        const id = nodeRes.data._id;

        const res = await this.adapter.crud.update("system_content_structure", id, changes as any, {
          bypassTenantCheck: true,
        });
        if (!res.success) throw new Error("Update failed");

        let updated = await this.adapter.crud.findOne<ContentNode>(
          "system_content_structure",
          { _id: id } as any,
          { bypassTenantCheck: true },
        );

        if (!updated.success || !updated.data) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          updated = await this.adapter.crud.findOne<ContentNode>(
            "system_content_structure",
            { _id: id } as any,
            { bypassTenantCheck: true },
          );
        }

        if (!updated.success || !updated.data)
          throw new Error("Updated node not found after retry");
        return updated.data;
      }, "UPDATE_NODE_FAILED"),

    bulkUpdate: (
      updates: { path: string; id?: string; changes: Partial<ContentNode> }[],
      _options?: {
        tenantId?: string | null;
        bypassTenantCheck?: boolean;
        bypassCache?: boolean;
      },
    ): Promise<DatabaseResult<ContentNode[]>> =>
      this.adapter.wrap(async () => {
        const results: ContentNode[] = [];
        for (const update of updates) {
          const res = await this.nodes.update(update.path, update.changes);
          if (res.success && res.data) results.push(res.data);
        }
        return results;
      }, "BULK_UPDATE_NODES_FAILED"),

    delete: (path: string): Promise<DatabaseResult<void>> =>
      this.adapter.wrap(async () => {
        await this.adapter.crud.deleteMany("system_content_structure", {
          path,
        } as any);
      }, "DELETE_NODE_FAILED"),

    deleteMany: (
      paths: string[],
      options?: { tenantId?: string | null },
    ): Promise<DatabaseResult<{ deletedCount: number }>> =>
      this.adapter.crud.deleteMany("system_content_structure", { path: { $in: paths } } as any, {
        tenantId: options?.tenantId as DatabaseId | undefined,
      }),

    reorder: (
      nodeUpdates: Array<{ path: string; newOrder: number }>,
    ): Promise<DatabaseResult<ContentNode[]>> =>
      this.adapter.wrap(async () => {
        for (const update of nodeUpdates) {
          await this.nodes.update(update.path, { order: update.newOrder });
        }
        return [];
      }, "REORDER_NODES_FAILED"),

    reorderStructure: (
      items: Array<{
        id: string;
        parentId: string | null;
        order: number;
        path: string;
      }>,
    ): Promise<DatabaseResult<void>> =>
      this.adapter.wrap(async () => {
        for (const item of items) {
          await this.adapter.crud.update(
            "system_content_structure",
            item.id as DatabaseId,
            {
              parentId: item.parentId as DatabaseId | null,
              order: item.order,
              path: item.path,
            } as any,
          );
        }
      }, "REORDER_STRUCTURE_FAILED"),
  };

  public readonly revisions = {
    create: (revision: EntityCreate<ContentRevision>): Promise<DatabaseResult<ContentRevision>> =>
      this.adapter.crud.insert("content_revisions", revision as any),

    getHistory: (
      contentId: DatabaseId,
      options?: PaginationOptions,
    ): Promise<DatabaseResult<PaginatedResult<ContentRevision>>> =>
      this.adapter.wrap(async () => {
        const res = await this.adapter.crud.findMany<ContentRevision>(
          "content_revisions",
          { contentId } as any,
          options as any,
        );
        return this.adapter.utils.createPagination(
          res.success ? res.data || [] : [],
          options || {},
        );
      }, "GET_REVISIONS_FAILED"),

    restore: async (revisionId: DatabaseId): Promise<DatabaseResult<void>> =>
      this.adapter.crud.restore("content_revisions", revisionId),

    delete: (revisionId: DatabaseId): Promise<DatabaseResult<void>> =>
      this.adapter.crud.delete("content_revisions", revisionId),

    deleteMany: (revisionIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> =>
      this.adapter.crud.deleteMany("content_revisions", {
        _id: { $in: revisionIds },
      } as any),

    cleanup: (
      contentId: DatabaseId,
      keepLatest: number,
    ): Promise<DatabaseResult<{ deletedCount: number }>> =>
      this.adapter.wrap(async () => {
        const history = await this.revisions.getHistory(contentId, {
          pageSize: 1000,
          sortField: "version",
          sortDirection: "desc",
        });
        if (!history.success || (history.data?.items.length || 0) <= keepLatest)
          return { deletedCount: 0 };
        const toDelete = history.data!.items.slice(keepLatest).map((i: any) => i._id);
        const deleteRes = await this.revisions.deleteMany(toDelete);
        if (!deleteRes.success) throw deleteRes.error;
        return deleteRes.data;
      }, "CLEANUP_REVISIONS_FAILED"),
  };
}
