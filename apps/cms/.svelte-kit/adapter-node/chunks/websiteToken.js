import { S as StatusTypes } from './definitions.js';
import { g as generateId } from './mongoDBUtils.js';
import { logger } from './logger.js';
import mongoose, { Schema } from 'mongoose';
import { n as nowISODateString, t as toISOString } from './dateUtils.js';
const translationSchema = new Schema(
	{
		languageTag: { type: String, required: true },
		translationName: { type: String, required: true },
		isDefault: { type: Boolean, default: false }
	},
	{ _id: false }
);
const contentStructureSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() },
		name: { type: String, required: true },
		path: { type: String, index: true },
		// Add path field for URL routing
		icon: { type: String, default: 'bi:folder' },
		order: { type: Number, default: 999 },
		nodeType: { type: String, required: true, enum: ['category', 'collection'] },
		translations: [translationSchema],
		parentId: { type: String, default: null, index: true },
		// Properties from ContentNode that are not in the base Mongoose Document
		// label removed if not in ContentNode
		permissions: Schema.Types.Mixed,
		livePreview: { type: Boolean },
		strict: { type: Boolean },
		revision: { type: Boolean },
		description: { type: String },
		slug: { type: String },
		status: {
			type: String,
			enum: Object.values(StatusTypes)
		},
		links: [{ type: String }],
		collectionDef: { type: Schema.Types.Mixed },
		// Use 'collectionDef' instead of 'collection' to avoid Mongoose reserved key warning
		tenantId: { type: String, index: true }
		// Add tenantId for multi-tenancy support
	},
	{
		timestamps: true,
		collection: 'system_content_structure',
		discriminatorKey: 'nodeType',
		// Use nodeType to differentiate between category and collection
		_id: false
		// Disable Mongoose auto-ObjectId generation since we use UUID strings
	}
);
contentStructureSchema.index({ updatedAt: -1 });
contentStructureSchema.index({ 'translations.languageTag': 1 });
contentStructureSchema.index({ tenantId: 1, parentId: 1, order: 1 });
contentStructureSchema.index({ tenantId: 1, nodeType: 1, status: 1 });
contentStructureSchema.index({ tenantId: 1, path: 1 }, { unique: true, sparse: true });
contentStructureSchema.index({ tenantId: 1, slug: 1 }, { sparse: true });
contentStructureSchema.index({ tenantId: 1, 'translations.languageTag': 1, nodeType: 1 });
contentStructureSchema.index({ parentId: 1, order: 1, nodeType: 1 });
contentStructureSchema.index({ nodeType: 1, updatedAt: -1 });
const createDatabaseError = (error, code, message) => {
	const err = error instanceof Error ? error : new Error(String(error));
	logger.error(`${code}: ${message}`, err);
	return {
		code,
		message,
		details: err.message,
		stack: err.stack
	};
};
contentStructureSchema.statics = {
	async getContentStructure() {
		try {
			const contentStructure = await this.find({}).lean();
			return { success: true, data: contentStructure };
		} catch (error) {
			const message = 'Error fetching content structure';
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_GET_CONTENT_STRUCTURE_ERROR', message)
			};
		}
	},
	async upsertCategory(category) {
		try {
			const result = await this.findOneAndUpdate(
				{ _id: category._id },
				{ $set: { ...category, nodeType: 'category' } },
				{ upsert: true, new: true }
			).lean();
			if (!result) {
				const message = `Failed to upsert category: ${category.path}`;
				return {
					success: false,
					message,
					error: createDatabaseError(new Error(message), 'CONTENT_UPSERT_CATEGORY_ERROR', message)
				};
			}
			return { success: true, data: result };
		} catch (error) {
			const message = `Error upserting category: ${category.path}`;
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_UPSERT_CATEGORY_ERROR', message)
			};
		}
	},
	async upsertCollection(collection) {
		try {
			const result = await this.findOneAndUpdate(
				{ _id: collection._id },
				{ $set: { ...collection, nodeType: 'collection' } },
				{ upsert: true, new: true }
			).lean();
			if (!result) {
				const message = `Failed to upsert collection: ${collection.path || collection._id}`;
				return {
					success: false,
					message,
					error: createDatabaseError(new Error(message), 'CONTENT_UPSERT_COLLECTION_ERROR', message)
				};
			}
			return { success: true, data: result };
		} catch (error) {
			const message = `Error upserting collection: ${collection.path || collection._id}`;
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_UPSERT_COLLECTION_ERROR', message)
			};
		}
	},
	async getNodeById(id) {
		try {
			const node = await this.findOne({ _id: id }).lean();
			return { success: true, data: node };
		} catch (error) {
			const message = `Error fetching node by id: ${id}`;
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_GET_NODE_BY_ID_ERROR', message)
			};
		}
	},
	async getChildren(parentId) {
		try {
			const children = await this.find({ parentId }).sort({ order: 1 }).lean();
			return { success: true, data: children };
		} catch (error) {
			const message = `Error fetching children for parent id: ${parentId}`;
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_GET_CHILDREN_ERROR', message)
			};
		}
	},
	/**
	 * Validates a parent-child relationship before persisting changes.
	 */
	async validateMove(nodeId, newParentId) {
		try {
			const node = await this.findOne({ _id: nodeId }).lean();
			const parent = newParentId ? await this.findOne({ _id: newParentId }).lean() : null;
			if (!node) {
				return {
					success: false,
					message: 'Node not found',
					error: createDatabaseError(new Error('Node not found'), 'CONTENT_NODE_NOT_FOUND', 'Node not found')
				};
			}
			if (parent && parent.nodeType === 'collection' && node.nodeType === 'category') {
				return {
					success: false,
					message: 'Categories cannot be nested under collections',
					error: createDatabaseError(new Error('Invalid nesting'), 'CONTENT_INVALID_NESTING', 'Categories cannot be nested under collections')
				};
			}
			return { success: true, data: void 0 };
		} catch (error) {
			const message = `Error validating move for node ${nodeId}`;
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_VALIDATE_MOVE_ERROR', message)
			};
		}
	},
	/**
	 * Persists a full or partial content structure reorder.
	 * This method updates parentId, order, and path atomically.
	 */
	async reorderStructure(items, tenantId) {
		const session = await mongoose.startSession();
		session.startTransaction();
		try {
			const bulkOps = items.map((item) => ({
				updateOne: {
					filter: {
						_id: item.id,
						...(tenantId ? { tenantId } : {})
					},
					update: {
						$set: {
							parentId: item.parentId,
							order: item.order,
							path: item.path
						}
					}
				}
			}));
			if (bulkOps.length > 0) {
				await this.bulkWrite(bulkOps, { session });
			}
			await session.commitTransaction();
			return { success: true, data: void 0 };
		} catch (error) {
			await session.abortTransaction();
			const message = 'Error reordering content structure';
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_REORDER_ERROR', message)
			};
		} finally {
			session.endSession();
		}
	}
};
if (mongoose.models.system_content_structure) {
	delete mongoose.models.system_content_structure;
}
const ContentStructureModel = mongoose.model('system_content_structure', contentStructureSchema);
const SystemSettingSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() },
		// UUID primary key
		key: { type: String, required: true, index: true, unique: true },
		value: { type: Schema.Types.Mixed, required: true },
		scope: { type: String, default: 'system', index: true },
		category: { type: String, enum: ['public', 'private'], default: 'public', index: true },
		isGlobal: { type: Boolean, default: true },
		updatedAt: { type: String, default: () => nowISODateString() }
	},
	{
		timestamps: true,
		collection: 'system_settings',
		strict: true,
		_id: false
		// Disable Mongoose auto-ObjectId generation
	}
);
if (mongoose.models.system_settings) {
	delete mongoose.models.system_settings;
}
if (mongoose.models.SystemSetting) {
	delete mongoose.models.SystemSetting;
}
const SystemSettingModel = mongoose.models?.SystemSetting || mongoose.model('SystemSetting', SystemSettingSchema);
const themeSchema = new Schema(
	{
		_id: { type: String, required: true },
		// UUID
		name: { type: String, required: true },
		path: { type: String, required: true },
		isActive: { type: Boolean, default: false },
		isDefault: { type: Boolean, default: false },
		config: {
			tailwindConfigPath: String,
			assetsPath: String,
			properties: {
				type: Map,
				of: String,
				default: {}
			}
		},
		previewImage: String,
		createdAt: { type: String, default: () => nowISODateString() },
		updatedAt: { type: String, default: () => nowISODateString() }
	},
	{
		timestamps: true,
		collection: 'system_theme',
		strict: true,
		_id: false
		// Disable Mongoose auto-ObjectId generation
	}
);
themeSchema.index({ isActive: 1 });
themeSchema.index({ name: 1 }, { unique: true });
themeSchema.statics = {
	// Get active theme
	async getActiveTheme() {
		try {
			const theme = await this.findOne({ isActive: true }).lean().exec();
			if (theme) {
				theme.createdAt = toISOString(theme.createdAt);
				theme.updatedAt = toISOString(theme.updatedAt);
			}
			return theme;
		} catch (error) {
			logger.error(`Error retrieving active theme: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	},
	// Get theme by name
	async getThemeByName(name) {
		try {
			const theme = await this.findOne({ name }).lean().exec();
			if (theme) {
				theme.createdAt = toISOString(theme.createdAt);
				theme.updatedAt = toISOString(theme.updatedAt);
			}
			return theme;
		} catch (error) {
			logger.error(`Error retrieving theme by name: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	},
	// Store themes (bulk upsert) - Optimized with bulkWrite for atomic operation
	async storeThemes(themes, generateId2) {
		if (themes.length === 0) return;
		try {
			const operations = themes.map((themeData) => ({
				updateOne: {
					filter: { name: themeData.name },
					update: {
						$set: themeData,
						$setOnInsert: { _id: generateId2() }
					},
					upsert: true
				}
			}));
			const result = await this.bulkWrite(operations, { ordered: false });
			logger.info(`Stored ${themes.length} themes via bulk operation (${result.upsertedCount} inserted, ${result.modifiedCount} updated)`);
		} catch (error) {
			logger.error(`Error storing themes: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	},
	// Get all themes
	async getAllThemes() {
		try {
			const themes = await this.find().lean().exec();
			return themes.map((theme) => {
				theme.createdAt = toISOString(theme.createdAt);
				theme.updatedAt = toISOString(theme.updatedAt);
				return theme;
			});
		} catch (error) {
			logger.error(`Error retrieving all themes: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}
};
const ThemeModel = mongoose.models?.Theme || mongoose.model('Theme', themeSchema);
const websiteTokenSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() },
		name: { type: String, required: true },
		token: { type: String, required: true, unique: true },
		createdAt: { type: String, default: () => nowISODateString() },
		updatedAt: { type: String, default: () => nowISODateString() },
		createdBy: { type: String, required: true }
	},
	{
		timestamps: true,
		collection: 'system_website_tokens',
		strict: true,
		_id: false
	}
);
websiteTokenSchema.index({ createdBy: 1 });
const WebsiteTokenModel = mongoose.models?.WebsiteToken || mongoose.model('WebsiteToken', websiteTokenSchema);
export { ContentStructureModel as C, SystemSettingModel as S, ThemeModel as T, WebsiteTokenModel as W };
//# sourceMappingURL=websiteToken.js.map
