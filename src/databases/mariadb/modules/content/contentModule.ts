/**
 * @file src/databases/mariadb/modules/content/contentModule.ts
 * @description Content management module for MariaDB
 *
 * Features:
 * - Get content structure
 * - Upsert content structure node
 * - Create content node
 * - Update content node
 * - Delete content node
 * - Get content node by id
 * - Get content node by path
 * - Get content node by tenant id
 * - Get content node count
 * - Delete content nodes
 */

import { eq, and, desc, asc, count, inArray } from 'drizzle-orm';
import type {
	ContentNode,
	ContentDraft,
	ContentRevision,
	DatabaseId,
	DatabaseResult,
	PaginationOptions,
	PaginatedResult
} from '../../../dbInterface';
import { AdapterCore } from '../../adapter/adapterCore';
import * as schema from '../../schema';
import * as utils from '../../utils';

export class ContentModule {
	private core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return (this.core as any).db;
	}

	nodes = {
		getStructure: async (mode: 'flat' | 'nested', filter?: Partial<ContentNode>, _bypassCache?: boolean): Promise<DatabaseResult<ContentNode[]>> => {
			return (this.core as any).wrap(async () => {
				let q: any = this.db.select().from(schema.contentNodes);

				if (filter) {
					const conditions: any[] = [];
					if (filter._id) conditions.push(eq(schema.contentNodes._id, filter._id));
					if (filter.path) conditions.push(eq(schema.contentNodes.path, filter.path));
					if (filter.parentId) conditions.push(eq(schema.contentNodes.parentId, filter.parentId));
					if (filter.tenantId) conditions.push(eq(schema.contentNodes.tenantId, filter.tenantId));
					if (conditions.length > 0) q = q.where(and(...conditions));
				}

				q = q.orderBy(asc(schema.contentNodes.order));

				const results = await q;
				const nodes = utils.convertArrayDatesToISO(results) as unknown as ContentNode[];

				if (mode === 'nested') {
					const idMap = new Map<string, ContentNode>();
					nodes.forEach((n) => idMap.set(n._id, { ...n, children: [] }));
					const rootNodes: ContentNode[] = [];
					idMap.forEach((n) => {
						if (n.parentId && idMap.has(n.parentId)) {
							idMap.get(n.parentId)!.children!.push(n);
						} else {
							rootNodes.push(n);
						}
					});
					return rootNodes;
				}

				return nodes;
			}, 'GET_CONTENT_STRUCTURE_FAILED');
		},

		upsertContentStructureNode: async (node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>> => {
			return (this.core as any).wrap(async () => {
				const id = node._id || utils.generateId();
				const [existing] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes._id, id)).limit(1);

				if (existing) {
					await this.db
						.update(schema.contentNodes)
						.set({ ...node, updatedAt: new Date() } as any)
						.where(eq(schema.contentNodes._id, id));
				} else {
					const now = new Date();
					await this.db.insert(schema.contentNodes).values({
						...node,
						_id: id,
						createdAt: now,
						updatedAt: now
					} as any);
				}

				const [result] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes._id, id)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentNode;
			}, 'UPSERT_CONTENT_NODE_FAILED');
		},

		create: async (node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>> => {
			return (this.core as any).wrap(async () => {
				const id = node._id || utils.generateId();
				const now = new Date();
				await this.db.insert(schema.contentNodes).values({
					...node,
					_id: id,
					createdAt: now,
					updatedAt: now
				} as any);
				const [result] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes._id, id)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentNode;
			}, 'CREATE_CONTENT_NODE_FAILED');
		},

		createMany: async (nodes: Omit<ContentNode, 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<ContentNode[]>> => {
			return (this.core as any).wrap(async () => {
				const now = new Date();
				const values = nodes.map((node) => ({
					...node,
					_id: node._id || utils.generateId(),
					createdAt: now,
					updatedAt: now
				}));
				await this.db.insert(schema.contentNodes).values(values as any);
				const ids = values.map((v) => v._id);
				const results = await this.db.select().from(schema.contentNodes).where(inArray(schema.contentNodes._id, ids));
				return utils.convertArrayDatesToISO(results) as unknown as ContentNode[];
			}, 'CREATE_MANY_CONTENT_NODES_FAILED');
		},

		update: async (path: string, changes: Partial<ContentNode>): Promise<DatabaseResult<ContentNode>> => {
			return (this.core as any).wrap(async () => {
				await this.db
					.update(schema.contentNodes)
					.set({ ...changes, updatedAt: new Date() } as any)
					.where(eq(schema.contentNodes.path, path));
				const [result] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes.path, path)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentNode;
			}, 'UPDATE_CONTENT_NODE_FAILED');
		},

		bulkUpdate: async (updates: { path: string; changes: Partial<ContentNode> }[]): Promise<DatabaseResult<ContentNode[]>> => {
			return (this.core as any).wrap(async () => {
				const results: ContentNode[] = [];
				for (const update of updates) {
					await this.db
						.update(schema.contentNodes)
						.set({ ...update.changes, updatedAt: new Date() } as any)
						.where(eq(schema.contentNodes.path, update.path));
					const [res] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes.path, update.path)).limit(1);
					if (res) results.push(utils.convertDatesToISO(res) as unknown as ContentNode);
				}
				return results;
			}, 'BULK_UPDATE_CONTENT_NODES_FAILED');
		},

		delete: async (path: string): Promise<DatabaseResult<void>> => {
			return (this.core as any).wrap(async () => {
				await this.db.delete(schema.contentNodes).where(eq(schema.contentNodes.path, path));
			}, 'DELETE_CONTENT_NODE_FAILED');
		},

		deleteMany: async (paths: string[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return (this.core as any).wrap(async () => {
				const result = await this.db.delete(schema.contentNodes).where(inArray(schema.contentNodes.path, paths));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_CONTENT_NODES_FAILED');
		},

		reorder: async (nodeUpdates: Array<{ path: string; newOrder: number }>): Promise<DatabaseResult<ContentNode[]>> => {
			return (this.core as any).wrap(async () => {
				const results: ContentNode[] = [];
				for (const update of nodeUpdates) {
					await this.db.update(schema.contentNodes).set({ order: update.newOrder }).where(eq(schema.contentNodes.path, update.path));
					const [res] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes.path, update.path)).limit(1);
					if (res) results.push(utils.convertDatesToISO(res) as unknown as ContentNode);
				}
				return results;
			}, 'REORDER_CONTENT_NODES_FAILED');
		},

		reorderStructure: async (items: Array<{ id: string; parentId: string | null; order: number; path: string }>): Promise<DatabaseResult<void>> => {
			return (this.core as any).wrap(async () => {
				for (const item of items) {
					await this.db
						.update(schema.contentNodes)
						.set({ parentId: item.parentId, order: item.order, path: item.path })
						.where(eq(schema.contentNodes._id, item.id));
				}
			}, 'REORDER_CONTENT_STRUCTURE_FAILED');
		}
	};

	drafts = {
		create: async (draft: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentDraft>> => {
			return (this.core as any).wrap(async () => {
				const id = utils.generateId();
				const now = new Date();
				await this.db.insert(schema.contentDrafts).values({
					...draft,
					_id: id,
					createdAt: now,
					updatedAt: now
				} as any);
				const [result] = await this.db.select().from(schema.contentDrafts).where(eq(schema.contentDrafts._id, id)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentDraft;
			}, 'CREATE_CONTENT_DRAFT_FAILED');
		},

		createMany: async (drafts: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<ContentDraft[]>> => {
			return (this.core as any).wrap(async () => {
				const now = new Date();
				const values = drafts.map((draft) => ({
					...draft,
					_id: utils.generateId(),
					createdAt: now,
					updatedAt: now
				}));
				await this.db.insert(schema.contentDrafts).values(values as any);
				const ids = values.map((v) => v._id);
				const results = await this.db.select().from(schema.contentDrafts).where(inArray(schema.contentDrafts._id, ids));
				return utils.convertArrayDatesToISO(results) as unknown as ContentDraft[];
			}, 'CREATE_MANY_CONTENT_DRAFTS_FAILED');
		},

		update: async (draftId: DatabaseId, data: unknown): Promise<DatabaseResult<ContentDraft>> => {
			return (this.core as any).wrap(async () => {
				await this.db
					.update(schema.contentDrafts)
					.set({ data: data as any, updatedAt: new Date() })
					.where(eq(schema.contentDrafts._id, draftId));
				const [result] = await this.db.select().from(schema.contentDrafts).where(eq(schema.contentDrafts._id, draftId)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentDraft;
			}, 'UPDATE_CONTENT_DRAFT_FAILED');
		},

		publish: async (draftId: DatabaseId): Promise<DatabaseResult<void>> => {
			return (this.core as any).wrap(async () => {
				const [draft] = await this.db.select().from(schema.contentDrafts).where(eq(schema.contentDrafts._id, draftId)).limit(1);
				if (!draft) throw new Error('Draft not found');

				await this.db
					.update(schema.contentNodes)
					.set({ ...draft.data, updatedAt: new Date(), isPublished: true, publishedAt: new Date() } as any)
					.where(eq(schema.contentNodes._id, draft.contentId));

				await this.db.delete(schema.contentDrafts).where(eq(schema.contentDrafts._id, draftId));
			}, 'PUBLISH_CONTENT_DRAFT_FAILED');
		},

		publishMany: async (draftIds: DatabaseId[]): Promise<DatabaseResult<{ publishedCount: number }>> => {
			return (this.core as any).wrap(async () => {
				let publishedCount = 0;
				for (const draftId of draftIds) {
					const res = await this.drafts.publish(draftId);
					if (res.success) publishedCount++;
				}
				return { publishedCount };
			}, 'PUBLISH_MANY_CONTENT_DRAFTS_FAILED');
		},

		getForContent: async (contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentDraft>>> => {
			return (this.core as any).wrap(async () => {
				const conditions = [eq(schema.contentDrafts.contentId, contentId)];
				let q: any = this.db
					.select()
					.from(schema.contentDrafts)
					.where(and(...conditions));

				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;

				q = q.limit(limit).offset(offset).orderBy(desc(schema.contentDrafts.updatedAt));

				const results = await q;

				const [countResult] = (await this.db
					.select({ count: count() })
					.from(schema.contentDrafts)
					.where(and(...conditions))) as any;

				const total = Number(countResult?.count || 0);

				return {
					items: utils.convertArrayDatesToISO(results) as unknown as ContentDraft[],
					total,
					page: options?.page || 1,
					pageSize: limit,
					hasNextPage: offset + limit < total,
					hasPreviousPage: (options?.page || 1) > 1
				};
			}, 'GET_CONTENT_DRAFTS_FAILED');
		},

		delete: async (draftId: DatabaseId): Promise<DatabaseResult<void>> => {
			return (this.core as any).wrap(async () => {
				await this.db.delete(schema.contentDrafts).where(eq(schema.contentDrafts._id, draftId));
			}, 'DELETE_CONTENT_DRAFT_FAILED');
		},

		deleteMany: async (draftIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return (this.core as any).wrap(async () => {
				const result = await this.db.delete(schema.contentDrafts).where(inArray(schema.contentDrafts._id, draftIds));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_CONTENT_DRAFTS_FAILED');
		}
	};

	revisions = {
		create: async (revision: Omit<ContentRevision, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentRevision>> => {
			return (this.core as any).wrap(async () => {
				const id = utils.generateId();
				const now = new Date();
				await this.db.insert(schema.contentRevisions).values({
					...revision,
					_id: id,
					createdAt: now,
					updatedAt: now
				} as any);
				const [result] = await this.db.select().from(schema.contentRevisions).where(eq(schema.contentRevisions._id, id)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentRevision;
			}, 'CREATE_CONTENT_REVISION_FAILED');
		},

		getHistory: async (contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentRevision>>> => {
			return (this.core as any).wrap(async () => {
				const conditions = [eq(schema.contentRevisions.contentId, contentId)];
				let q: any = this.db
					.select()
					.from(schema.contentRevisions)
					.where(and(...conditions));

				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;

				q = q.limit(limit).offset(offset).orderBy(desc(schema.contentRevisions.createdAt));

				const results = await q;

				const [countResult] = (await this.db
					.select({ count: count() })
					.from(schema.contentRevisions)
					.where(and(...conditions))) as any;

				const total = Number(countResult?.count || 0);

				return {
					items: utils.convertArrayDatesToISO(results) as unknown as ContentRevision[],
					total,
					page: options?.page || 1,
					pageSize: limit,
					hasNextPage: offset + limit < total,
					hasPreviousPage: (options?.page || 1) > 1
				};
			}, 'GET_CONTENT_HISTORY_FAILED');
		},

		restore: async (revisionId: DatabaseId): Promise<DatabaseResult<void>> => {
			return (this.core as any).wrap(async () => {
				const [revision] = await this.db.select().from(schema.contentRevisions).where(eq(schema.contentRevisions._id, revisionId)).limit(1);

				if (!revision) throw new Error('Revision not found');

				await this.db
					.update(schema.contentNodes)
					.set({ ...revision.data, updatedAt: new Date() } as any)
					.where(eq(schema.contentNodes._id, revision.contentId));
			}, 'RESTORE_CONTENT_REVISION_FAILED');
		},

		delete: async (revisionId: DatabaseId): Promise<DatabaseResult<void>> => {
			return (this.core as any).wrap(async () => {
				await this.db.delete(schema.contentRevisions).where(eq(schema.contentRevisions._id, revisionId));
			}, 'DELETE_CONTENT_REVISION_FAILED');
		},

		deleteMany: async (revisionIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return (this.core as any).wrap(async () => {
				const result = await this.db.delete(schema.contentRevisions).where(inArray(schema.contentRevisions._id, revisionIds));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_CONTENT_REVISIONS_FAILED');
		},

		cleanup: async (contentId: DatabaseId, keepLatest: number): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return (this.core as any).wrap(async () => {
				const revisions = await this.db
					.select({ _id: schema.contentRevisions._id })
					.from(schema.contentRevisions)
					.where(eq(schema.contentRevisions.contentId, contentId))
					.orderBy(desc(schema.contentRevisions.createdAt))
					.offset(keepLatest);

				if (revisions.length === 0) return { deletedCount: 0 };

				const idsToDelete = (revisions as any[]).map((r) => r._id);
				const result = await this.db.delete(schema.contentRevisions).where(inArray(schema.contentRevisions._id, idsToDelete));
				return { deletedCount: result[0].affectedRows };
			}, 'CLEANUP_CONTENT_REVISIONS_FAILED');
		}
	};
}
