/**
 * @file src/databases/mariadb/modules/content/content-module.ts
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

import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type {
	ContentDraft,
	ContentNode,
	ContentRevision,
	DatabaseId,
	DatabaseResult,
	PaginatedResult,
	PaginationOptions
} from '../../../db-interface';
import type { AdapterCore } from '../../adapter/adapter-core';
import * as schema from '../../schema';
import * as utils from '../../utils';

export class ContentModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	private pickValidColumns(node: Partial<ContentNode>): Partial<typeof schema.contentNodes.$inferInsert> {
		const validColumns: (keyof typeof schema.contentNodes.$inferInsert)[] = [
			'_id',
			'path',
			'parentId',
			'nodeType',
			'status',
			'name',
			'slug',
			'icon',
			'description',
			'data',
			'metadata',
			'translations',
			'order',
			'isPublished',
			'publishedAt',
			'tenantId',
			'createdAt',
			'updatedAt'
		];

		const sanitized: Partial<typeof schema.contentNodes.$inferInsert> = {};
		for (const key of validColumns) {
			const value = node[key as keyof ContentNode];
			if (value !== undefined) {
				// Use type-safe assignment for known columns
				(sanitized as Record<string, unknown>)[key] = value;
			}
		}
		return sanitized;
	}

	nodes = {
		getStructure: async (mode: 'flat' | 'nested', filter?: Partial<ContentNode>, _bypassCache?: boolean): Promise<DatabaseResult<ContentNode[]>> => {
			return this.core.wrap(async () => {
				let q = this.db.select().from(schema.contentNodes).$dynamic();

				if (filter) {
					const conditions = [];
					if (filter._id) {
						conditions.push(eq(schema.contentNodes._id, filter._id as string));
					}
					if (filter.path) {
						conditions.push(eq(schema.contentNodes.path, filter.path));
					}
					if (filter.parentId) {
						conditions.push(eq(schema.contentNodes.parentId, filter.parentId as string));
					}
					if (filter.tenantId) {
						conditions.push(eq(schema.contentNodes.tenantId, filter.tenantId));
					}
					if (conditions.length > 0) {
						q = q.where(and(...conditions));
					}
				}

				q = q.orderBy(asc(schema.contentNodes.order));

				const results = await q;
				const nodes = utils.convertArrayDatesToISO(results) as unknown as ContentNode[];

				if (mode === 'nested') {
					const idMap = new Map<string, ContentNode>();
					for (const n of nodes) {
						idMap.set(n._id as string, { ...n, children: [] });
					}
					const rootNodes: ContentNode[] = [];
					for (const n of idMap.values()) {
						if (n.parentId && idMap.has(n.parentId as string)) {
							idMap.get(n.parentId as string)?.children?.push(n);
						} else {
							rootNodes.push(n);
						}
					}
					return rootNodes;
				}

				return nodes;
			}, 'GET_CONTENT_STRUCTURE_FAILED');
		},

		upsertContentStructureNode: async (node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>> => {
			return this.core.wrap(async () => {
				const id = (node._id || utils.generateId()) as string;
				const sanitized = this.pickValidColumns(node);
				const [existing] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes._id, id)).limit(1);

				if (existing) {
					await this.db
						.update(schema.contentNodes)
						.set({ ...sanitized, updatedAt: isoDateStringToDate(nowISODateString()) })
						.where(eq(schema.contentNodes._id, id));
				} else {
					const now = isoDateStringToDate(nowISODateString());
					await this.db.insert(schema.contentNodes).values({
						...sanitized,
						_id: id,
						createdAt: now,
						updatedAt: now
					} as typeof schema.contentNodes.$inferInsert);
				}

				const [result] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes._id, id)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentNode;
			}, 'UPSERT_CONTENT_NODE_FAILED');
		},

		create: async (node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>> => {
			return this.core.wrap(async () => {
				const id = (node._id || utils.generateId()) as string;
				const now = isoDateStringToDate(nowISODateString());
				const sanitized = this.pickValidColumns(node);
				await this.db.insert(schema.contentNodes).values({
					...sanitized,
					_id: id,
					createdAt: now,
					updatedAt: now
				} as typeof schema.contentNodes.$inferInsert);
				const [result] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes._id, id)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentNode;
			}, 'CREATE_CONTENT_NODE_FAILED');
		},

		createMany: async (nodes: Omit<ContentNode, 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<ContentNode[]>> => {
			return this.core.wrap(async () => {
				const now = isoDateStringToDate(nowISODateString());
				const values = nodes.map((node) => {
					const sanitized = this.pickValidColumns(node);
					return {
						...sanitized,
						_id: (node._id || utils.generateId()) as string,
						createdAt: now,
						updatedAt: now
					};
				}) as (typeof schema.contentNodes.$inferInsert)[];
				await this.db.insert(schema.contentNodes).values(values);
				const ids = values.map((v) => v._id as string);
				const results = await this.db.select().from(schema.contentNodes).where(inArray(schema.contentNodes._id, ids));
				return utils.convertArrayDatesToISO(results) as unknown as ContentNode[];
			}, 'CREATE_MANY_CONTENT_NODES_FAILED');
		},

		update: async (path: string, changes: Partial<ContentNode>): Promise<DatabaseResult<ContentNode>> => {
			return this.core.wrap(async () => {
				const sanitized = this.pickValidColumns(changes);
				await this.db
					.update(schema.contentNodes)
					.set({ ...sanitized, updatedAt: isoDateStringToDate(nowISODateString()) })
					.where(eq(schema.contentNodes.path, path));
				const [result] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes.path, path)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentNode;
			}, 'UPDATE_CONTENT_NODE_FAILED');
		},

		bulkUpdate: async (updates: { path: string; changes: Partial<ContentNode> }[]): Promise<DatabaseResult<ContentNode[]>> => {
			return this.core.wrap(async () => {
				const results: ContentNode[] = [];
				for (const update of updates) {
					const sanitized = this.pickValidColumns(update.changes);
					const id = ((update.changes as Partial<ContentNode>)._id || utils.generateId()) as string;

					// Strip date fields from sanitized to handle them explicitly as Date objects for Drizzle
					const { createdAt: _createdAt, updatedAt: _updatedAt, publishedAt, ...sanitizedWithoutDates } = sanitized;

					// Atomic upsert using ON DUPLICATE KEY UPDATE (path has unique constraint)
					const values: typeof schema.contentNodes.$inferInsert = {
						...(sanitizedWithoutDates as Record<string, unknown>),
						_id: id,
						path: update.path,
						nodeType: (sanitizedWithoutDates.nodeType as string) || update.changes.nodeType || 'collection',
						publishedAt: (publishedAt ? new Date(publishedAt as unknown as string | number | Date) : null) as Date | null,
						createdAt: isoDateStringToDate(nowISODateString()),
						updatedAt: isoDateStringToDate(nowISODateString())
					};

					await this.db
						.insert(schema.contentNodes)
						.values(values)
						.onDuplicateKeyUpdate({
							set: {
								...(sanitizedWithoutDates as Record<string, unknown>),
								publishedAt: (publishedAt ? new Date(publishedAt as unknown as string | number | Date) : undefined) as Date | undefined,
								updatedAt: isoDateStringToDate(nowISODateString())
							}
						});

					// Return the upserted record
					const [res] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes.path, update.path)).limit(1);
					if (res) {
						results.push(utils.convertDatesToISO(res) as unknown as ContentNode);
					}
				}
				return results;
			}, 'BULK_UPDATE_CONTENT_NODES_FAILED');
		},

		delete: async (path: string): Promise<DatabaseResult<void>> => {
			return this.core.wrap(async () => {
				await this.db.delete(schema.contentNodes).where(eq(schema.contentNodes.path, path));
			}, 'DELETE_CONTENT_NODE_FAILED');
		},

		deleteMany: async (paths: string[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return this.core.wrap(async () => {
				const result = await this.db.delete(schema.contentNodes).where(inArray(schema.contentNodes.path, paths));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_CONTENT_NODES_FAILED');
		},

		reorder: async (nodeUpdates: Array<{ path: string; newOrder: number }>): Promise<DatabaseResult<ContentNode[]>> => {
			return this.core.wrap(async () => {
				const results: ContentNode[] = [];
				for (const update of nodeUpdates) {
					await this.db.update(schema.contentNodes).set({ order: update.newOrder }).where(eq(schema.contentNodes.path, update.path));
					const [res] = await this.db.select().from(schema.contentNodes).where(eq(schema.contentNodes.path, update.path)).limit(1);
					if (res) {
						results.push(utils.convertDatesToISO(res) as unknown as ContentNode);
					}
				}
				return results;
			}, 'REORDER_CONTENT_NODES_FAILED');
		},

		reorderStructure: async (
			items: Array<{
				id: string;
				parentId: string | null;
				order: number;
				path: string;
			}>
		): Promise<DatabaseResult<void>> => {
			return this.core.wrap(async () => {
				for (const item of items) {
					await this.db
						.update(schema.contentNodes)
						.set({
							parentId: item.parentId,
							order: item.order,
							path: item.path
						})
						.where(eq(schema.contentNodes._id, item.id));
				}
			}, 'REORDER_CONTENT_STRUCTURE_FAILED');
		}
	};

	drafts = {
		create: async (draft: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentDraft>> => {
			return this.core.wrap(async () => {
				const id = utils.generateId() as string;
				const now = isoDateStringToDate(nowISODateString());
				await this.db.insert(schema.contentDrafts).values({
					...(draft as unknown as typeof schema.contentDrafts.$inferInsert),
					_id: id,
					createdAt: now,
					updatedAt: now
				});
				const [result] = await this.db.select().from(schema.contentDrafts).where(eq(schema.contentDrafts._id, id)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentDraft;
			}, 'CREATE_CONTENT_DRAFT_FAILED');
		},

		createMany: async (drafts: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<ContentDraft[]>> => {
			return this.core.wrap(async () => {
				const now = isoDateStringToDate(nowISODateString());
				const values = drafts.map((draft) => ({
					...(draft as unknown as typeof schema.contentDrafts.$inferInsert),
					_id: utils.generateId() as string,
					createdAt: now,
					updatedAt: now
				})) as (typeof schema.contentDrafts.$inferInsert)[];
				await this.db.insert(schema.contentDrafts).values(values);
				const ids = values.map((v) => v._id as string);
				const results = await this.db.select().from(schema.contentDrafts).where(inArray(schema.contentDrafts._id, ids));
				return utils.convertArrayDatesToISO(results) as unknown as ContentDraft[];
			}, 'CREATE_MANY_CONTENT_DRAFTS_FAILED');
		},

		update: async (draftId: DatabaseId, data: unknown): Promise<DatabaseResult<ContentDraft>> => {
			return this.core.wrap(async () => {
				await this.db
					.update(schema.contentDrafts)
					.set({ data: data as Record<string, unknown>, updatedAt: isoDateStringToDate(nowISODateString()) })
					.where(eq(schema.contentDrafts._id, draftId as string));
				const [result] = await this.db
					.select()
					.from(schema.contentDrafts)
					.where(eq(schema.contentDrafts._id, draftId as string))
					.limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentDraft;
			}, 'UPDATE_CONTENT_DRAFT_FAILED');
		},

		publish: async (draftId: DatabaseId): Promise<DatabaseResult<void>> => {
			return this.core.wrap(async () => {
				const [draft] = await this.db
					.select()
					.from(schema.contentDrafts)
					.where(eq(schema.contentDrafts._id, draftId as string))
					.limit(1);
				if (!draft) {
					throw new Error('Draft not found');
				}

				await this.db
					.update(schema.contentNodes)
					.set({
						...(draft.data as Record<string, unknown>),
						updatedAt: isoDateStringToDate(nowISODateString()),
						isPublished: true,
						publishedAt: isoDateStringToDate(nowISODateString())
					})
					.where(eq(schema.contentNodes._id, draft.contentId as string));

				await this.db.delete(schema.contentDrafts).where(eq(schema.contentDrafts._id, draftId as string));
			}, 'PUBLISH_CONTENT_DRAFT_FAILED');
		},

		publishMany: async (draftIds: DatabaseId[]): Promise<DatabaseResult<{ publishedCount: number }>> => {
			return this.core.wrap(async () => {
				let publishedCount = 0;
				for (const draftId of draftIds) {
					const res = await this.drafts.publish(draftId);
					if (res.success) {
						publishedCount++;
					}
				}
				return { publishedCount };
			}, 'PUBLISH_MANY_CONTENT_DRAFTS_FAILED');
		},

		getForContent: async (contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentDraft>>> => {
			return this.core.wrap(async () => {
				const conditions = [eq(schema.contentDrafts.contentId, contentId)];
				let q = this.db
					.select()
					.from(schema.contentDrafts)
					.where(and(...conditions))
					.$dynamic();

				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;

				q = q.limit(limit).offset(offset).orderBy(desc(schema.contentDrafts.updatedAt));

				const results = await q;

				const [countResult] = (await this.db
					.select({ count: count() })
					.from(schema.contentDrafts)
					.where(and(...conditions))) as unknown as [{ count: number }];

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
			return this.core.wrap(async () => {
				await this.db.delete(schema.contentDrafts).where(eq(schema.contentDrafts._id, draftId));
			}, 'DELETE_CONTENT_DRAFT_FAILED');
		},

		deleteMany: async (draftIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return this.core.wrap(async () => {
				const result = await this.db.delete(schema.contentDrafts).where(inArray(schema.contentDrafts._id, draftIds));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_CONTENT_DRAFTS_FAILED');
		}
	};

	revisions = {
		create: async (revision: Omit<ContentRevision, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentRevision>> => {
			return this.core.wrap(async () => {
				const id = utils.generateId() as string;
				const now = isoDateStringToDate(nowISODateString());
				await this.db.insert(schema.contentRevisions).values({
					...(revision as unknown as typeof schema.contentRevisions.$inferInsert),
					_id: id,
					createdAt: now,
					updatedAt: now
				});
				const [result] = await this.db.select().from(schema.contentRevisions).where(eq(schema.contentRevisions._id, id)).limit(1);
				return utils.convertDatesToISO(result) as unknown as ContentRevision;
			}, 'CREATE_CONTENT_REVISION_FAILED');
		},

		getHistory: async (contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentRevision>>> => {
			return this.core.wrap(async () => {
				const conditions = [eq(schema.contentRevisions.contentId, contentId as string)];
				let q = this.db
					.select()
					.from(schema.contentRevisions)
					.where(and(...conditions))
					.$dynamic();

				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;

				q = q.limit(limit).offset(offset).orderBy(desc(schema.contentRevisions.createdAt));

				const results = await q;

				const [countResult] = await this.db
					.select({ count: count() })
					.from(schema.contentRevisions)
					.where(and(...conditions));

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
			return this.core.wrap(async () => {
				const [revision] = await this.db
					.select()
					.from(schema.contentRevisions)
					.where(eq(schema.contentRevisions._id, revisionId as string))
					.limit(1);

				if (!revision) {
					throw new Error('Revision not found');
				}

				await this.db
					.update(schema.contentNodes)
					.set({ ...(revision.data as Record<string, unknown>), updatedAt: isoDateStringToDate(nowISODateString()) })
					.where(eq(schema.contentNodes._id, revision.contentId as string));
			}, 'RESTORE_CONTENT_REVISION_FAILED');
		},

		delete: async (revisionId: DatabaseId): Promise<DatabaseResult<void>> => {
			return this.core.wrap(async () => {
				await this.db.delete(schema.contentRevisions).where(eq(schema.contentRevisions._id, revisionId));
			}, 'DELETE_CONTENT_REVISION_FAILED');
		},

		deleteMany: async (revisionIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return this.core.wrap(async () => {
				const result = await this.db.delete(schema.contentRevisions).where(inArray(schema.contentRevisions._id, revisionIds));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_CONTENT_REVISIONS_FAILED');
		},

		cleanup: async (contentId: DatabaseId, keepLatest: number): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return this.core.wrap(async () => {
				const revisions = await this.db
					.select({ _id: schema.contentRevisions._id })
					.from(schema.contentRevisions)
					.where(eq(schema.contentRevisions.contentId, contentId))
					.orderBy(desc(schema.contentRevisions.createdAt))
					.offset(keepLatest);

				if (revisions.length === 0) {
					return { deletedCount: 0 };
				}

				const idsToDelete = revisions.map((r) => r._id);
				const result = await this.db.delete(schema.contentRevisions).where(inArray(schema.contentRevisions._id, idsToDelete));
				return { deletedCount: result[0].affectedRows };
			}, 'CLEANUP_CONTENT_REVISIONS_FAILED');
		}
	};
}
