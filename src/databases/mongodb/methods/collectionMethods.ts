/**
 * @file src/databases/mongodb/methods/collectionMethods.ts
 * @description collectionMethods model registration for the MongoDB adapter.
 * This class is responsible for idempotently registering auth-related Mongoose models.
 */

import { logger } from '@utils/logger.svelte';
import mongoose, { Schema as MongooseSchema, type PipelineStage } from 'mongoose';
import type { CollectionModel, DatabaseAdapter } from '../../dbInterface';

export function createCollectionMethods(_adapter: DatabaseAdapter) {
	const models = new Map<string, CollectionModel>();

	return {
		models,
		getModelsMap: async (): Promise<Map<string, CollectionModel>> => {
			return models;
		},
		getModel: async (id: string): Promise<CollectionModel> => {
			const model = models.get(id);
			if (!model) {
				throw new Error(`Collection model with id ${id} not found`);
			}
			return model;
		},
		createModel: async (schema: import('@src/content/types').Schema): Promise<void> => {
			const collectionConfig = schema as unknown as { _id: string; fields?: unknown[]; [key: string]: unknown };
			await createCollectionModel(collectionConfig);
		},
		updateModel: async (schema: import('@src/content/types').Schema): Promise<void> => {
			const collectionConfig = schema as unknown as { _id: string; fields?: unknown[]; [key: string]: unknown };
			await createCollectionModel(collectionConfig);
		},
		deleteModel: async (id: string): Promise<void> => {
			models.delete(id);
			const modelName = `collection_${id}`;
			if (mongoose.models[modelName]) {
				delete mongoose.models[modelName];
			}
		},
		collectionExists: async (collectionName: string): Promise<boolean> => {
			try {
				const collections = (await mongoose.connection.db?.listCollections({ name: collectionName.toLowerCase() }).toArray()) ?? [];
				return collections.length > 0;
			} catch (error) {
				logger.error(`Error checking if collection exists: ${error}`);
				return false;
			}
		},
		createCollectionModel: async (collection: {
			_id?: string;
			fields?: unknown[];
			schema?: { strict?: boolean };
			[key: string]: unknown;
		}): Promise<CollectionModel> => {
			try {
				const collectionUuid = collection._id || new mongoose.Types.ObjectId().toHexString();
				const collectionName = `collection_${collectionUuid}`;

				if (mongoose.models[collectionName]) {
					const existingModel = mongoose.models[collectionName];
					const wrappedExistingModel: CollectionModel = {
						findOne: async (query) => (await existingModel.findOne(query).lean().exec()) as Record<string, unknown> | null,
						aggregate: async (pipeline) => existingModel.aggregate(pipeline as unknown as PipelineStage[]).exec()
					};
					models.set(collectionUuid, wrappedExistingModel);
					return wrappedExistingModel;
				}

				if (mongoose.modelNames().includes(collectionName)) {
					delete mongoose.models[collectionName];
				}

				const schemaDefinition: Record<string, unknown> = {
					_id: { type: String },
					status: { type: String, default: 'draft' },
					createdAt: { type: Date, default: Date.now },
					updatedAt: { type: Date, default: Date.now },
					createdBy: { type: MongooseSchema.Types.Mixed, ref: 'auth_users' },
					updatedBy: { type: MongooseSchema.Types.Mixed, ref: 'auth_users' }
				};

				if (collection.fields && Array.isArray(collection.fields)) {
					for (const field of collection.fields) {
						if (typeof field === 'object' && field !== null && ('db_fieldName' in field || 'label' in field || 'Name' in field)) {
							const fieldObj = field as {
								db_fieldName?: string;
								label?: string;
								Name?: string;
								required?: boolean;
								translate?: boolean;
								searchable?: boolean;
								unique?: boolean;
								type?: string;
							};
							const fieldKey =
								fieldObj.db_fieldName || (fieldObj.label ? fieldObj.label.toLowerCase().replace(/[^a-z0-9_]/g, '_') : null) || fieldObj.Name;

							if (!fieldKey) continue;

							const fieldSchema: mongoose.SchemaDefinitionProperty = {
								type: mongoose.Schema.Types.Mixed,
								required: fieldObj.required || false,
								unique: fieldObj.unique || false
							};
							schemaDefinition[fieldKey] = fieldSchema;
						}
					}
				}

				const schema = new mongoose.Schema(schemaDefinition, {
					strict: collection.schema?.strict !== false,
					timestamps: true,
					collection: collectionName.toLowerCase()
				});

				const model = mongoose.model(collectionName, schema);
				const wrappedModel: CollectionModel = {
					findOne: async (query) => (await model.findOne(query).lean().exec()) as Record<string, unknown> | null,
					aggregate: async (pipeline) => model.aggregate(pipeline as unknown as PipelineStage[]).exec()
				};
				models.set(collectionUuid, wrappedModel);
				return wrappedModel;
			} catch (error) {
				logger.error('Error creating collection model:', error instanceof Error ? error.stack : error);
				throw error;
			}
		}
	};
}
