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
import { logger } from '@utils/logger';
import type { FilterQuery } from 'mongoose';
import type {
	BaseEntity,
	ContentDraft as DBContentDraft,
	ContentRevision as DBContentRevision,
	PaginatedResult,
	PaginationOptions
} from '../../dbInterface';
import { MongoCrudMethods } from './crudMethods';
import { createDatabaseError, generateId } from './mongoDBUtils';
import { withCache, CacheCategory, invalidateCategoryCache } from './mongoDBCacheUtils';
import { normalizeId } from './normalizeId';
export { normalizeId } from './normalizeId';

// Create local types that satisfy the BaseEntity constraint
type ContentDraft = DBContentDraft & BaseEntity;
type ContentRevision = DBContentRevision & BaseEntity;

/**
 * Converts a flat array of content nodes into a nested tree.
 * This is a pure utility function that can be tested and reused outside MongoDB context.
 */
export function buildTree(nodes: ContentNode[]): ContentNode[] {
	const nodeMap = new Map<string, ContentNode>();
	const roots: ContentNode[] = [];

	// First pass: Create map with all nodes
	for (const node of nodes) {
		const nodeId = typeof node._id === 'string' ? node._id : String(node._id);
		nodeMap.set(nodeId, { ...node, children: [] });
	}

	// Second pass: Build the tree by linking children to parents
	for (const node of nodeMap.values()) {
		if (node.parentId) {
			const parentId = typeof node.parentId === 'string' ? node.parentId : String(node.parentId);
			const parent = nodeMap.get(parentId);
			if (parent) {
				parent.children!.push(node);
			} else {
				// Parent not found, treat as root
				logger.warn(`[buildTree] Parent ${parentId} not found for node ${node._id}, treating as root`);
				roots.push(node);
			}
		} else {
			// No parentId, it's a root node
			roots.push(node);
		}
	}

	logger.trace(`[buildTree] Built tree with ${roots.length} root nodes from ${nodes.length} total nodes`);
	return roots;
}

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
		logger.trace('MongoContentMethods initialized with repositories.');
	}

	// ============================================================
	// Content Structure Methods
	// ============================================================

	/**
	 * Retrieves the content structure as a flat list or a hierarchical tree.
	 * Cached with 180s TTL since structure is frequently accessed for navigation/menus
	 */
	async getStructure(mode: 'flat' | 'nested' = 'flat', filter: FilterQuery<ContentNode> = {}, bypassCache = false): Promise<ContentNode[]> {
		// Create cache key based on mode and filter
		const filterKey = JSON.stringify(filter);
		const cacheKey = `content:structure:${mode}:${filterKey}`;

		const fetchData = async () => {
			const nodes = await this.nodesRepo.findMany(filter);
			if (mode === 'flat') {
				return nodes;
			}

			// Build the nested tree structure using the utility function
			return buildTree(nodes);
		};

		// Bypass cache if requested (e.g., during sync operations)
		if (bypassCache) {
			return fetchData();
		}

		return withCache(cacheKey, fetchData, { category: CacheCategory.CONTENT });
	}

	/**
	 * Atomically creates a new node or updates an existing one based on its path.
	 */
	async upsertNodeByPath(nodeData: Omit<ContentNode, '_id' | 'createdAt' | 'updatedAt'>): Promise<ContentNode> {
		try {
			const { path, parentId } = nodeData;

			// Normalize parentId using safe helper to prevent [object Object] storage issues
			const normalizedParentId = normalizeId(parentId);

			const result = await this.nodesRepo.model
				.findOneAndUpdate(
					{ path },
					{
						$set: { ...nodeData, parentId: normalizedParentId, updatedAt: new Date() },
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
	 * Uses upsert to create nodes if they don't exist.
	 */
	async bulkUpdateNodes(updates: Array<{ path: string; changes: Partial<ContentNode> }>): Promise<{ modifiedCount: number }> {
		if (updates.length === 0) return { modifiedCount: 0 };
		try {
			logger.trace(`[bulkUpdateNodes] Processing ${updates.length} updates`);
			const operations = updates.map(({ path, changes }) => {
				// Normalize parentId to string using safe helper (handles ObjectId, string, null)
				const normalizedChanges = { ...changes } as Partial<ContentNode>;
				if ('parentId' in normalizedChanges) {
					const originalParentId = normalizedChanges.parentId;
					const normalizedParentId = normalizeId(originalParentId);
					if (normalizedParentId === null) {
						if (originalParentId !== null && originalParentId !== undefined) {
							logger.warn(`[bulkUpdateNodes] Unable to safely normalize parentId for path="${path}". Falling back to null value.`, {
								parentId: originalParentId
							});
						}
						normalizedChanges.parentId = null as unknown as DatabaseId;
					} else {
						normalizedChanges.parentId = normalizedParentId as DatabaseId;
					}
				}

				return {
					updateOne: {
						filter: { path },
						update: {
							$set: { ...normalizedChanges, updatedAt: new Date() },
							$setOnInsert: { createdAt: new Date() }
						},
						upsert: true // Create the document if it doesn't exist
					}
				};
			});
			logger.trace(`[bulkUpdateNodes] Executing bulkWrite with ${operations.length} operations`);
			const result = await this.nodesRepo.model.bulkWrite(operations);
			logger.info(
				`[bulkUpdateNodes] Result: modified=${result.modifiedCount}, upserted=${result.upsertedCount}, total=${result.modifiedCount + result.upsertedCount}`
			);

			// Invalidate content structure caches
			await invalidateCategoryCache(CacheCategory.CONTENT);

			return { modifiedCount: result.modifiedCount + result.upsertedCount };
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
