/**
 * @file src/databases/mongodb/modules/content-module.ts
 * @description Content management module for MongoDB.
 */

import { DatabaseModule } from "../../base-adapter";
import type {
  IContentAdapter,
  DatabaseId,
  EntityCreate,
  ContentNode,
  ContentDraft,
  PaginationOptions,
} from "../../db-interface";
import type { MongoAdapterCore } from "../adapter/adapter-core";
import { MongoContentMethods } from "../methods/content-methods";
import { MongoCrudMethods } from "../methods/crud-methods";

export class MongoContentModule
  extends DatabaseModule<MongoAdapterCore>
  implements IContentAdapter
{
  private _content: MongoContentMethods | null = null;

  private async _getContent() {
    if (this._content) return this._content;

    const { contentStructureSchema } = await import("../models/content-structure");
    const { draftSchema } = await import("../models/draft");
    const { revisionSchema } = await import("../models/revision");

    const nodeModel = (this.adapter as any)._getOrCreateModel(
      "system_content_structure",
      contentStructureSchema,
    );
    const draftModel = (this.adapter as any)._getOrCreateModel("content_drafts", draftSchema);
    const revisionModel = (this.adapter as any)._getOrCreateModel(
      "content_revisions",
      revisionSchema,
    );

    this._content = new MongoContentMethods(
      new MongoCrudMethods(nodeModel, this.adapter),
      new MongoCrudMethods(draftModel, this.adapter),
      new MongoCrudMethods(revisionModel, this.adapter),
    );
    return this._content;
  }

  drafts = {
    create: async (draft: EntityCreate<ContentDraft>) =>
      (await this._getContent()).createDraft(draft as any),
    createMany: async (drafts: EntityCreate<ContentDraft>[]) => {
      const content = await this._getContent();
      return (content as any).draftsRepo.insertMany(drafts);
    },
    update: async (draftId: DatabaseId, data: unknown) => {
      const content = await this._getContent();
      return (content as any).draftsRepo.update(draftId, { data } as any);
    },
    publish: async (draftId: DatabaseId) =>
      (await this._getContent())
        .publishManyDrafts([draftId])
        .then((res) => ({ ...res, data: undefined })),
    publishMany: async (draftIds: DatabaseId[]) => {
      const res = await (await this._getContent()).publishManyDrafts(draftIds);
      if (res.success) {
        return { success: true as const, data: { publishedCount: res.data?.modifiedCount || 0 } };
      }
      return { success: false as const, message: res.message, error: res.error };
    },
    getForContent: async (contentId: DatabaseId, options?: PaginationOptions) =>
      (await this._getContent()).getDraftsForContent(contentId, options),
    restore: async (draftId: DatabaseId) => {
      const content = await this._getContent();
      return (content as any).draftsRepo.restore(draftId);
    },
    delete: async (draftId: DatabaseId) => {
      const content = await this._getContent();
      return (content as any).draftsRepo.delete(draftId);
    },
    deleteMany: async (draftIds: DatabaseId[]) => {
      const content = await this._getContent();
      const res = await (content as any).draftsRepo.deleteMany({ _id: { $in: draftIds } } as any, {
        permanent: true,
      });
      if (res.success) {
        return { success: true as const, data: { deletedCount: res.data?.deletedCount || 0 } };
      }
      return { success: false as const, message: res.message, error: res.error };
    },
  };

  nodes = {
    getStructure: async (mode: "flat" | "nested", options?: any) =>
      (await this._getContent()).getStructure(mode, options),
    upsertContentStructureNode: async (node: EntityCreate<ContentNode>) =>
      (await this._getContent()).upsertContentStructureNode(node as any),
    create: async (node: EntityCreate<ContentNode>) =>
      (await this._getContent()).upsertNodeByPath(node as any),
    createMany: async (nodes: EntityCreate<ContentNode>[]) => {
      const validNodes = nodes
        .filter((n) => n.path)
        .map((n) => ({ path: n.path as string, changes: n as any }));
      return (await this._getContent()).bulkUpdateNodes(validNodes);
    },
    update: async (path: string, changes: Partial<ContentNode>) => {
      const res = await (
        await this._getContent()
      ).bulkUpdateNodes([{ path, changes: changes as any }]);
      if (res.success) {
        return { success: true as const, data: res.data[0] };
      }
      return { success: false as const, message: res.message, error: res.error };
    },
    bulkUpdate: async (updates: any[], options?: any) => {
      const validUpdates = updates
        .filter((u) => u.path)
        .map((u) => ({ path: u.path as string, changes: u.changes }));
      return (await this._getContent()).bulkUpdateNodes(validUpdates, options);
    },
    reorder: async (updates: Array<{ path: string; newOrder: number }>) => {
      // reorderNodes doesn't exist, use bulkUpdateNodes to update the 'order' field
      const bulkUpdates = updates.map((u) => ({
        path: u.path,
        changes: { order: u.newOrder } as any,
      }));
      return (await this._getContent()).bulkUpdateNodes(bulkUpdates);
    },
    reorderStructure: async (items: any[]) => (await this._getContent()).reorderStructure(items),
    delete: async (path: string) => (await this._getContent()).deleteNodeByPath(path),
    deleteMany: async (paths: string[], options?: any) => {
      const res = await (await this._getContent()).deleteNodesByPaths(paths, options);
      if (res.success) {
        return { success: true as const, data: { deletedCount: res.data?.deletedCount || 0 } };
      }
      return { success: false as const, message: res.message, error: res.error };
    },
  };

  revisions = {
    create: async (revision: any) => (await this._getContent()).createRevision(revision),
    getHistory: async (contentId: DatabaseId, options?: PaginationOptions) =>
      (await this._getContent()).getRevisionHistory(contentId, options),
    restore: async (revisionId: DatabaseId) => {
      const content = await this._getContent();
      return (content as any).revisionsRepo.restore(revisionId);
    },
    delete: async (revisionId: DatabaseId) => {
      const content = await this._getContent();
      return (content as any).revisionsRepo.delete(revisionId);
    },
    deleteMany: async (revisionIds: DatabaseId[]) => {
      const content = await this._getContent();
      const res = await (content as any).revisionsRepo.deleteMany(
        { _id: { $in: revisionIds } } as any,
        { permanent: true },
      );
      if (res.success) {
        return { success: true as const, data: { deletedCount: res.data?.deletedCount || 0 } };
      }
      return { success: false as const, message: res.message, error: res.error };
    },
    cleanup: async (contentId: DatabaseId, keepLatest: number) =>
      (await this._getContent()).cleanupRevisions(contentId, keepLatest),
  };
}
