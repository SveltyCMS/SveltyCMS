/**
 * @file src/databases/mongodb/methods/collectionMethods.ts
 * @description Dynamic model/schema registration and management for MongoDB collections.
 *
 * Responsibility: ONLY for dynamic model/schema creation, registration, and management.
 *
 * This module handles:
 * - Dynamic creation of Mongoose models from collection schemas
 * - Model registry/map for tracking registered models
 * - Model existence checks and retrieval
 * - Schema validation and field mapping
 *
 * Does NOT handle:
 * - CRUD operations (use crudMethods.ts)
 * - Content structure/drafts/revisions (use contentMethods.ts)
 */

import { logger } from '@utils/logger';
import mongoose, { Schema as MongooseSchema, type Model } from 'mongoose';
import type { CollectionModel } from '../../dbInterface';
import type { Schema } from '@src/content/types';
import { withCache, CacheCategory, invalidateCollectionCache } from './mongoDBCacheUtils';
import { nowISODateString } from '@utils/dateUtils';

/**
 * MongoCollectionMethods manages dynamic model creation and registration.
 *
 * This class is responsible for creating, registering, and managing
 * dynamic Mongoose models based on user-defined collection schemas.
 */
export class MongoCollectionMethods {
	// Internal registry of all dynamically created models
	private models = new Map<string, { model: Model<unknown>; wrapped: CollectionModel }>();

	/**
	 * Gets a registered collection model by ID
	 * Cached with 600s TTL since schemas rarely change
	 */
	async getModel(id: string): Promise<CollectionModel> {
		return withCache(
			`schema:collection:${id}`,
			async () => {
				const entry = this.models.get(id);
				if (!entry) {
					throw new Error(`Collection model with id ${id} not found. Available: ${Array.from(this.models.keys()).join(', ')}`);
				}
				return entry.wrapped;
			},
			{ category: CacheCategory.SCHEMA }
		);
	}

	/**
	 * Creates or updates a dynamic collection model from a schema
	 */
	async createModel(schema: Schema): Promise<void> {
		const collectionId = schema._id;
		if (!collectionId) {
			throw new Error('Schema must have an _id field');
		}

		logger.debug(`Creating/updating collection model for: ${collectionId}`);

		// Invalidate cache for this collection
		await invalidateCollectionCache(`schema:collection:${collectionId}`);

		const modelName = `collection_${collectionId}`;

		// Force delete existing model and registry entry to ensure clean slate
		// This is crucial for schema updates (e.g., ObjectId → String migration)
		if (this.models.has(collectionId)) {
			logger.debug(`Removing existing model ${collectionId} for refresh...`);
			this.models.delete(collectionId);
		}

		// Remove existing Mongoose model if present (for hot reload)
		if (mongoose.models[modelName]) {
			logger.debug(`Deleting Mongoose model ${modelName} for refresh...`);
			delete mongoose.models[modelName];
		}

		// Build schema definition from collection fields
		// Note: Using String type for _id to support UUID-based IDs instead of MongoDB ObjectIds
		const schemaDefinition: Record<string, mongoose.SchemaDefinitionProperty> = {
			_id: { type: String, required: true },
			status: { type: String, default: 'draft' },
			createdAt: { type: String, default: () => nowISODateString() },
			updatedAt: { type: String, default: () => nowISODateString() },
			createdBy: { type: MongooseSchema.Types.Mixed, ref: 'auth_users' },
			updatedBy: { type: MongooseSchema.Types.Mixed, ref: 'auth_users' }
		};

		// Map collection fields to Mongoose schema
		if (schema.fields && Array.isArray(schema.fields)) {
			for (const field of schema.fields) {
				if (typeof field === 'object' && field !== null) {
					const fieldObj = field as Record<string, unknown>;
					const fieldKey =
						(fieldObj.db_fieldName as string) ||
						(fieldObj.label
							? String(fieldObj.label)
									.toLowerCase()
									.replace(/[^a-z0-9_]/g, '_')
							: null) ||
						(fieldObj.Name as string);

					if (!fieldKey) continue;

					schemaDefinition[fieldKey] = {
						type: mongoose.Schema.Types.Mixed,
						required: (fieldObj.required as boolean) || false,
						unique: (fieldObj.unique as boolean) || false
					};
				}
			}
		}

		// Create Mongoose schema
		// Use _id: false to prevent auto-generation of ObjectId, then explicitly define _id as String
		const mongooseSchema = new mongoose.Schema(schemaDefinition, {
			_id: false, // Disable auto ObjectId generation
			strict: schema.strict !== false,
			timestamps: false, // We handle timestamps explicitly with ISODateString
			collection: modelName.toLowerCase()
		});

		// Create and register the model
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const model = mongoose.model(modelName, mongooseSchema) as any;

		// Wrap the model for the interface
		const wrappedModel: CollectionModel = {
			findOne: async (query) => {
				const result = await model.findOne(query).lean().exec();
				return result as Record<string, unknown> | null;
			},
			aggregate: async (pipeline) => {
				return await model.aggregate(pipeline as unknown as mongoose.PipelineStage[]).exec();
			}
		};

		this.models.set(collectionId, { model, wrapped: wrappedModel });
		logger.info(`Collection model created: ${collectionId} (${modelName})`);

		// Create database indexes for optimal query performance
		await this.createIndexes(model, schema);

		// NOTE: Physical collection creation disabled
		// Using generic system_content_structure table for all collections instead of per-collection tables
		// This is more efficient and reduces database clutter
		// MongoDB will create collections lazily on first insert if needed

		// Create the physical collection in MongoDB if it doesn't exist
		// MongoDB creates collections lazily on first insert, but we want them to exist immediately
		/* DISABLED - Using system_content_structure instead
		try {
			const collectionExists = await this.collectionExists(modelName.toLowerCase());
			if (!collectionExists) {
				logger.debug(`Creating physical collection: ${modelName} in database`);
				await mongoose.connection.db?.createCollection(modelName.toLowerCase());
				logger.info(`✅ Physical collection created: ${modelName}`);
			} else {
				logger.debug(`Physical collection already exists: ${modelName}`);
			}
		} catch (error) {
			// Collection might already exist or database might not support it
			// This is not critical - MongoDB will create it on first insert
			logger.warn(`Could not create physical collection ${modelName}: ${error instanceof Error ? error.message : String(error)}`);
		}
		*/
	}

	/**
	 * Updates an existing collection model
	 */
	async updateModel(schema: Schema): Promise<void> {
		// Invalidate cache before updating
		if (schema._id) {
			await invalidateCollectionCache(`schema:collection:${schema._id}`);
		}
		// For now, just recreate the model
		await this.createModel(schema);
	}

	/**
	 * Deletes a collection model
	 */
	async deleteModel(id: string): Promise<void> {
		// Invalidate cache before deleting
		await invalidateCollectionCache(`schema:collection:${id}`);

		this.models.delete(id);
		const modelName = `collection_${id}`;
		if (mongoose.models[modelName]) {
			delete mongoose.models[modelName];
		}
		logger.info(`Collection model deleted: ${id}`);
	}

	/**
	 * Checks if a collection exists in the database
	 */
	async collectionExists(collectionName: string): Promise<boolean> {
		try {
			const collections =
				(await mongoose.connection.db
					?.listCollections({
						name: collectionName.toLowerCase()
					})
					.toArray()) ?? [];
			return collections.length > 0;
		} catch (error) {
			logger.error(`Error checking collection existence: ${error}`);
			return false;
		}
	}

	/**
	 * Gets the internal Mongoose model (for CRUD operations)
	 */
	getMongooseModel(id: string): Model<unknown> | null {
		const entry = this.models.get(id);
		return entry ? entry.model : null;
	}

	/**
	 * Gets all registered model IDs
	 */
	getRegisteredModelIds(): string[] {
		return Array.from(this.models.keys());
	}

	/**
	 * Creates database indexes for optimal query performance
	 *
	 * This method creates indexes on:
	 * - Common query fields (status, createdAt, updatedAt)
	 * - Fields marked as unique or indexed in the schema
	 * - Multi-tenant fields (tenantId)
	 * - Sortable and filterable fields
	 */
	private async createIndexes(model: Model<unknown>, schema: Schema): Promise<void> {
		try {
			const collectionId = schema._id;
			logger.debug(`Creating indexes for collection: ${collectionId}`);

			// Essential indexes for all collections
			const indexes: Array<{ fields: Record<string, 1 | -1>; options?: Record<string, unknown> }> = [
				// Primary sort/filter indexes
				{ fields: { status: 1 } },
				{ fields: { createdAt: -1 } },
				{ fields: { updatedAt: -1 } },
				{ fields: { createdBy: 1 } },

				// Compound indexes for common query patterns
				{ fields: { status: 1, createdAt: -1 } },
				{ fields: { status: 1, updatedAt: -1 } },

				// Multi-tenant support
				{ fields: { tenantId: 1 } },
				{ fields: { tenantId: 1, status: 1 } },
				{ fields: { tenantId: 1, createdAt: -1 } }
			];

			// Add indexes for fields marked as indexed or unique
			if (schema.fields && Array.isArray(schema.fields)) {
				for (const field of schema.fields) {
					if (typeof field === 'object' && field !== null) {
						const fieldObj = field as Record<string, unknown>;
						const fieldKey =
							(fieldObj.db_fieldName as string) ||
							(fieldObj.label
								? String(fieldObj.label)
										.toLowerCase()
										.replace(/[^a-z0-9_]/g, '_')
								: null) ||
							(fieldObj.Name as string);

						if (!fieldKey) continue;

						// Unique index
						if (fieldObj.unique) {
							indexes.push({
								fields: { [fieldKey]: 1 },
								options: { unique: true, sparse: true }
							});
						}

						// Regular index for searchable/filterable fields
						if (fieldObj.indexed || fieldObj.searchable || fieldObj.sortable) {
							indexes.push({ fields: { [fieldKey]: 1 } });
						}

						// Text index for searchable text fields
						if (fieldObj.searchable && (fieldObj.type === 'text' || fieldObj.type === 'textarea')) {
							indexes.push({
								fields: { [fieldKey]: 'text' as unknown as 1 },
								options: { default_language: 'english' }
							});
						}
					}
				}
			}

			// Create all indexes
			const collection = model.collection;
			for (const index of indexes) {
				try {
					await collection.createIndex(index.fields, index.options || {});
					logger.debug(`Created index on ${Object.keys(index.fields).join(', ')} for ${collectionId}`);
				} catch (error) {
					// Ignore duplicate index errors
					if ((error as Error).message.includes('already exists')) {
						continue;
					}
					logger.warn(`Failed to create index for ${collectionId}: ${error}`);
				}
			}

			logger.info(`Indexes created for collection: ${collectionId}`);
		} catch (error) {
			logger.error(`Error creating indexes: ${error}`);
			// Don't throw - index creation failures shouldn't prevent model creation
		}
	}
}
