/**
 * @file src/databases/mongodb/methods/contentMethods.ts
 * @description CMS-specific content logic for structure trees, drafts, and revisions.
 *
 * Responsibility: ONLY for CMS-specific content workflows.
 *
 * This module handles:
 * - Content structure (menus, trees, hierarchies)
 * - Draft creation, management, and publishing workflows
 * - Revision history, tracking, and cleanup
 * - Content-specific batch operations
 *
 * Does NOT handle:
 * - Generic CRUD operations (use crudMethods.ts)
 * - Model/schema creation (use collectionMethods.ts)
 */

import type { ContentNode, DatabaseId } from '@src/content/types';
import { logger } from '@utils/logger.svelte';
import type { FilterQuery } from 'mongoose';
import type {
	BaseEntity,
	ContentDraft as DBContentDraft,
	ContentRevision as DBContentRevision,
	PaginatedResult,
	PaginationOptions
} from '../../dbInterface';
import { MongoCrudMethods } from './crudMethods';
import { createDatabaseError, generateId, withCache, CacheCategory, invalidateCategoryCache } from './mongoDBUtils';

// Create local types that satisfy the BaseEntity constraint
type ContentDraft = DBContentDraft & BaseEntity;
type ContentRevision = DBContentRevision & BaseEntity;

/**
 * MongoContentMethods manages CMS-specific content workflows.
 *
 * This class coordinates generic CRUD repositories to implement:
 * - Content structure management (trees, hierarchies)
 * - Draft workflows (create, publish, manage)
 * - Revision tracking (history, cleanup, restore)
 */

export class MongoContentMethods {
	// Repositories are injected for testability and code reuse
	private readonly nodesRepo: MongoCrudMethods<ContentNode>;
	private readonly draftsRepo: MongoCrudMethods<ContentDraft>;
	private readonly revisionsRepo: MongoCrudMethods<ContentRevision>;

	/**
	 * Creates an instance of MongoContentMethods.
	 * @param nodesRepo A repository for ContentNode operations.
	 * @param draftsRepo A repository for ContentDraft operations.
	 * @param revisionsRepo A repository for ContentRevision operations.
	 */
	constructor(
		nodesRepo: MongoCrudMethods<ContentNode>,
		draftsRepo: MongoCrudMethods<ContentDraft>,
		revisionsRepo: MongoCrudMethods<ContentRevision>
	) {
		this.nodesRepo = nodesRepo;
		this.draftsRepo = draftsRepo;
		this.revisionsRepo = revisionsRepo;
		logger.debug('\x1b[34mMongoContentMethods\x1b[0m initialized with repositories.');
	}

	// ============================================================
	// Content Structure Methods
	// ============================================================

	/**
	 * Retrieves the content structure as a flat list or a hierarchical tree.
	 * Cached with 180s TTL since structure is frequently accessed for navigation/menus
	 */
	async getStructure(mode: 'flat' | 'nested' = 'flat', filter: FilterQuery<ContentNode> = {}): Promise<ContentNode[]> {
		// Create cache key based on mode and filter
		const filterKey = JSON.stringify(filter);
		const cacheKey = `content:structure:${mode}:${filterKey}`;

		return withCache(
			cacheKey,
			async () => {
				const nodes = await this.nodesRepo.findMany(filter);
				if (mode === 'flat') {
					return nodes;
				}

				// Build the nested tree structure
				const nodeMap = new Map<string, ContentNode>(nodes.map((n) => [n._id.toString(), { ...n, children: [] as ContentNode[] }]));
				const tree: ContentNode[] = [];

				for (const node of nodeMap.values()) {
					if (node.parentId && nodeMap.has(node.parentId.toString())) {
						const parent = nodeMap.get(node.parentId.toString());
						parent?.children?.push(node);
					} else {
						tree.push(node);
					}
				}
				return tree;
			},
			{ category: CacheCategory.CONTENT }
		);
	}

	/**
	 * Atomically creates a new node or updates an existing one based on its path.
	 */
	async upsertNodeByPath(nodeData: Omit<ContentNode, '_id' | 'createdAt' | 'updatedAt'>): Promise<ContentNode> {
		try {
			const { path } = nodeData;
			const result = await this.nodesRepo.model
				.findOneAndUpdate(
					{ path },
					{
						$set: { ...nodeData, updatedAt: new Date() },
						$setOnInsert: { _id: generateId(), createdAt: new Date() }
					},
					{ new: true, upsert: true, runValidators: true }
				)
				.lean()
				.exec();

			// Invalidate content structure caches
			await invalidateCategoryCache(CacheCategory.CONTENT);

			return result;
		} catch (error) {
			throw createDatabaseError(error, 'NODE_UPSERT_ERROR', 'Failed to upsert content structure node.');
		}
	}

	/**
	 * Updates multiple nodes in a single, efficient bulk operation.
	 */
	async bulkUpdateNodes(updates: Array<{ path: string; changes: Partial<ContentNode> }>): Promise<{ modifiedCount: number }> {
		if (updates.length === 0) return { modifiedCount: 0 };
		try {
			const operations = updates.map(({ path, changes }) => ({
				updateOne: {
					filter: { path },
					update: { $set: { ...changes, updatedAt: new Date() } }
				}
			}));
			const result = await this.nodesRepo.model.bulkWrite(operations);

			// Invalidate content structure caches
			await invalidateCategoryCache(CacheCategory.CONTENT);

			return { modifiedCount: result.modifiedCount };
		} catch (error) {
			throw createDatabaseError(error, 'NODE_BULK_UPDATE_ERROR', 'Failed to perform bulk update on nodes.');
		}
	}

	// ============================================================
	// Draft Methods
	// ============================================================

	async createDraft(draft: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>): Promise<ContentDraft> {
		return this.draftsRepo.insert(draft);
	}

	async getDraftsForContent(contentId: DatabaseId, options?: PaginationOptions): Promise<PaginatedResult<ContentDraft>> {
		try {
			const { page = 1, pageSize = 10 } = options || {};
			const query = { contentId };

			const [items, total] = await Promise.all([
				this.draftsRepo.findMany(query, { skip: (page - 1) * pageSize, limit: pageSize }),
				this.draftsRepo.count(query)
			]);

			return {
				items,
				total,
				page,
				pageSize,
				hasNextPage: page * pageSize < total,
				hasPreviousPage: page > 1
			};
		} catch (error) {
			throw createDatabaseError(error, 'DRAFT_FETCH_ERROR', 'Failed to fetch drafts for content.');
		}
	}

	/**
	 * Publishes multiple drafts in a single batch operation.
	 */
	async publishManyDrafts(draftIds: DatabaseId[]): Promise<{ modifiedCount: number }> {
		if (draftIds.length === 0) return { modifiedCount: 0 };
		try {
			const result = await this.draftsRepo.model.updateMany({ _id: { $in: draftIds } }, { $set: { status: 'published', publishedAt: new Date() } });
			return { modifiedCount: result.modifiedCount };
		} catch (error) {
			throw createDatabaseError(error, 'DRAFT_BULK_PUBLISH_ERROR', 'Failed to publish drafts.');
		}
	}

	// ============================================================
	// Revision Methods
	// ============================================================

	async createRevision(revision: Omit<ContentRevision, '_id' | 'createdAt'>): Promise<ContentRevision> {
		return this.revisionsRepo.insert(revision);
	}

	async getRevisionHistory(contentId: DatabaseId, options?: PaginationOptions): Promise<PaginatedResult<ContentRevision>> {
		try {
			const { page = 1, pageSize = 25 } = options || {};
			const query = { contentId };

			const [items, total] = await Promise.all([
				this.revisionsRepo.model
					.find(query)
					.sort({ createdAt: -1 })
					.skip((page - 1) * pageSize)
					.limit(pageSize)
					.lean()
					.exec(),
				this.revisionsRepo.count(query)
			]);

			return {
				items,
				total,
				page,
				pageSize,
				hasNextPage: page * pageSize < total,
				hasPreviousPage: page > 1
			};
		} catch (error) {
			throw createDatabaseError(error, 'REVISION_FETCH_ERROR', 'Failed to fetch revision history.');
		}
	}

	/**
	 * Deletes old revisions for a piece of content, keeping only the specified number of recent ones.
	 */
	async cleanupRevisions(contentId: DatabaseId, keepLatest: number): Promise<{ deletedCount: number }> {
		try {
			const revisionsToKeep = await this.revisionsRepo.model
				.find({ contentId })
				.sort({ createdAt: -1 })
				.limit(keepLatest)
				.select('_id')
				.lean()
				.exec();

			const keepIds = revisionsToKeep.map((r: { _id: { toString(): string } }) => r._id.toString() as DatabaseId);

			return this.revisionsRepo.deleteMany({
				contentId,
				_id: { $nin: keepIds }
			} as FilterQuery<ContentRevision>);
		} catch (error) {
			throw createDatabaseError(error, 'REVISION_CLEANUP_ERROR', 'Failed to cleanup old revisions.');
		}
	}
}
