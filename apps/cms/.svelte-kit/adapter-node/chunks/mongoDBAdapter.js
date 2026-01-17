import mongoose, { Schema, mongo } from 'mongoose';
import { T as ThemeModel, W as WebsiteTokenModel, S as SystemSettingModel, C as ContentStructureModel } from './websiteToken.js';
import { g as generateId, c as createDatabaseError, p as processDates, m as mongoDBUtils } from './mongoDBUtils.js';
import { logger } from './logger.js';
import { t as toISOString, n as nowISODateString } from './dateUtils.js';
import { g as getErrorMessage } from './errorHandling.js';
import { l as logger$1 } from './logger.server.js';
import { getPrivateSettingSync } from './settingsService.js';
import { g as getAllPermissions } from './permissions.js';
import { TokenSchema, TokenAdapter } from './authToken.js';
import { error } from '@sveltejs/kit';
import { w as withCache, i as invalidateCollectionCache, a as invalidateCategoryCache, m as mongoDBCacheUtils } from './mongoDBCacheUtils.js';
import { C as CacheCategory } from './CacheCategory.js';
import { cacheService } from './CacheService.js';
import { h as hashPassword } from './crypto.js';
import { c as cacheMetrics } from './CacheMetrics.js';
const draftSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() },
		// Auto-generate UUID for new drafts
		contentId: { type: String, required: true },
		//ContentId of the draft
		data: { type: Schema.Types.Mixed, required: true },
		// Content of the draft
		version: { type: Number, default: 1 },
		// Version number for drafts, starting at 1
		status: { type: String, enum: ['draft', 'review', 'archived'], default: 'draft' },
		// Status options from ContentDraft
		authorId: { type: String, required: true }
		// Changed to String type in schema
		// Note: createdAt and updatedAt are handled by timestamps: true
	},
	{
		timestamps: true,
		// Enable timestamps for createdAt and updatedAt
		collection: 'content_drafts',
		strict: true,
		// Enforce strict schema validation
		_id: false
		// Disable Mongoose auto-ObjectId generation
	}
);
draftSchema.index({ contentId: 1, version: -1 });
draftSchema.index({ authorId: 1, status: 1, updatedAt: -1 });
draftSchema.index({ status: 1, updatedAt: -1 });
draftSchema.index({ contentId: 1, status: 1, updatedAt: -1 });
draftSchema.index({ authorId: 1, createdAt: -1 });
draftSchema.statics = {
	//Get drafts for a specific content ID
	async getDraftsForContent(contentId) {
		try {
			const drafts = await this.find({ contentId }).lean().exec();
			return { success: true, data: drafts };
		} catch (error2) {
			const message = `Failed to retrieve drafts for content ID: ${contentId}`;
			logger.error(`Error retrieving drafts for content ID: ${contentId}: ${error2 instanceof Error ? error2.message : String(error2)}`);
			return {
				success: false,
				message,
				error: {
					code: 'DRAFT_FETCH_ERROR',
					message
				}
			};
		}
	},
	//Bulk delete drafts for a list of content IDs
	async bulkDeleteDraftsForContent(contentIds) {
		try {
			const result = await this.deleteMany({ contentId: { $in: contentIds } }).exec();
			logger.info(`Bulk deleted ${result.deletedCount} drafts for content IDs: ${contentIds.join(', ')}`);
			return { success: true, data: result.deletedCount };
		} catch (error2) {
			const message = 'Failed to bulk delete drafts';
			logger.error(`Error bulk deleting drafts for content IDs: ${error2 instanceof Error ? error2.message : String(error2)}`);
			return {
				success: false,
				message,
				error: {
					code: 'DRAFT_BULK_DELETE_ERROR',
					message,
					details: error2
				}
			};
		}
	},
	// Create a new draft
	async createDraft(draftData) {
		try {
			const newDraft = await this.create(draftData);
			return { success: true, data: newDraft.toObject() };
		} catch (error2) {
			const message = 'Failed to create draft';
			logger.error(`Error creating draft: ${error2 instanceof Error ? error2.message : String(error2)}`);
			return {
				success: false,
				message,
				error: { code: 'DRAFT_CREATE_ERROR', message, details: error2 }
			};
		}
	},
	// Update a draft by its ID
	async updateDraft(draftId, updateData) {
		try {
			const result = await this.updateOne({ _id: draftId }, { $set: updateData }).exec();
			if (result.modifiedCount === 0) {
				const message = `Draft with ID "${draftId}" not found or no changes applied.`;
				return {
					success: false,
					message,
					error: {
						code: 'DRAFT_UPDATE_NOT_FOUND',
						message
					}
				};
			}
			logger.info(`Draft "${draftId}" updated successfully.`);
			return { success: true, data: void 0 };
		} catch (error2) {
			const message = `Failed to update draft "${draftId}"`;
			logger.error(`Error updating draft "${draftId}": ${error2 instanceof Error ? error2.message : String(error2)}`);
			return {
				success: false,
				message,
				error: {
					code: 'DRAFT_UPDATE_ERROR',
					message,
					details: error2
				}
			};
		}
	},
	// Delete a draft by its ID
	async deleteDraft(draftId) {
		try {
			const result = await this.deleteOne({ _id: draftId }).exec();
			if (result.deletedCount === 0) {
				const message = `Draft with ID "${draftId}" not found.`;
				return {
					success: false,
					message,
					error: {
						code: 'DRAFT_DELETE_NOT_FOUND',
						message
					}
				};
			}
			logger.info(`Draft "${draftId}" deleted successfully.`);
			return { success: true, data: void 0 };
		} catch (error2) {
			const message = `Failed to delete draft "${draftId}"`;
			logger.error(`Error deleting draft "${draftId}": ${error2 instanceof Error ? error2.message : String(error2)}`);
			return {
				success: false,
				message,
				error: {
					code: 'DRAFT_DELETE_ERROR',
					message,
					details: error2
				}
			};
		}
	}
};
const DraftModel = mongoose.models?.Draft || mongoose.model('Draft', draftSchema);
const revisionSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() },
		// Auto-generate UUID for new revisions
		contentId: { type: String, required: true },
		// Renamed to contentId, DatabaseId of content
		data: { type: Schema.Types.Mixed, required: true },
		// Content of the revision
		version: { type: Number, required: true },
		// Version number of the revision
		commitMessage: String,
		// Optional commit message for the revision
		authorId: { type: String, required: true }
		// DatabaseId of author
		// Note: createdAt and updatedAt are handled by timestamps: true
	},
	{
		timestamps: true,
		// Enable timestamps for createdAt and updatedAt
		collection: 'content_revisions',
		strict: true,
		// Enforce strict schema validation
		_id: false
		// Disable Mongoose auto-ObjectId generation
	}
);
revisionSchema.index({ contentId: 1, version: -1, createdAt: -1 });
revisionSchema.index({ authorId: 1, createdAt: -1 });
revisionSchema.index({ contentId: 1, authorId: 1, createdAt: -1 });
revisionSchema.index({ createdAt: -1 });
revisionSchema.statics = {
	// Get revision history for a content ID
	async getRevisionHistory(contentId) {
		try {
			const revisions = await this.find({ contentId }).sort({ version: -1, createdAt: -1 }).lean().exec();
			return { success: true, data: revisions };
		} catch (error2) {
			const message = `Failed to retrieve revision history for content ID: ${contentId}`;
			const err = error2;
			logger.error(`Error retrieving revision history for content ID: ${contentId}: ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'REVISION_HISTORY_ERROR',
					message
				}
			};
		}
	},
	// Bulk delete revisions for a list of content IDs
	async bulkDeleteRevisionsForContent(contentIds) {
		try {
			const result = await this.deleteMany({ contentId: { $in: contentIds } }).exec();
			logger.info(`Bulk deleted ${result.deletedCount} revisions for content IDs: ${contentIds.join(', ')}`);
			return { success: true, data: result.deletedCount };
		} catch (error2) {
			const message = 'Failed to bulk delete revisions';
			logger.error(`Error bulk deleting revisions for content IDs: ${error2 instanceof Error ? error2.message : String(error2)}`);
			return {
				success: false,
				message,
				error: {
					code: 'REVISION_BULK_DELETE_ERROR',
					message,
					details: error2
				}
			};
		}
	},
	// Create a new revision
	async createRevision(revisionData) {
		try {
			const newRevision = await this.create(revisionData);
			const revisionObj = newRevision.toObject();
			const revisionWithISODates = {
				_id: revisionObj._id,
				contentId: revisionObj.contentId,
				data: revisionObj.data,
				version: revisionObj.version,
				commitMessage: revisionObj.commitMessage,
				authorId: revisionObj.authorId,
				createdAt: toISOString(revisionObj.createdAt),
				updatedAt: toISOString(revisionObj.updatedAt)
			};
			return { success: true, data: revisionWithISODates };
		} catch (error2) {
			const message = 'Failed to create revision';
			const err = error2;
			logger.error(`Error creating revision: ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'REVISION_CREATE_ERROR', message, details: error2 }
			};
		}
	},
	// Update a revision by its ID
	async updateRevision(revisionId, updateData) {
		try {
			const result = await this.updateOne({ _id: revisionId }, { $set: updateData }).exec();
			if (result.modifiedCount === 0) {
				const message = `Revision with ID "${revisionId}" not found or no changes applied.`;
				return {
					success: false,
					message,
					error: {
						code: 'REVISION_UPDATE_NOT_FOUND',
						message
					}
				};
			}
			logger.info(`Revision "${revisionId}" updated successfully.`);
			return { success: true, data: void 0 };
		} catch (error2) {
			const message = `Failed to update revision "${revisionId}"`;
			const err = error2;
			logger.error(`Error updating revision "${revisionId}": ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'REVISION_UPDATE_ERROR',
					message,
					details: error2
				}
			};
		}
	},
	// Delete a revision by its ID
	async deleteRevision(revisionId) {
		try {
			const result = await this.deleteOne({ _id: revisionId }).exec();
			if (result.deletedCount === 0) {
				const message = `Revision with ID "${revisionId}" not found.`;
				return {
					success: false,
					message,
					error: {
						code: 'REVISION_DELETE_NOT_FOUND',
						message
					}
				};
			}
			logger.info(`Revision "${revisionId}" deleted successfully.`);
			return { success: true, data: void 0 };
		} catch (error2) {
			const message = `Failed to delete revision "${revisionId}"`;
			const err = error2;
			logger.error(`Error deleting revision "${revisionId}": ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'REVISION_DELETE_ERROR',
					message,
					details: error2
				}
			};
		}
	}
};
const RevisionModel = mongoose.models?.Revision || mongoose.model('Revision', revisionSchema);
const mediaSchema = new Schema(
	{
		_id: {
			type: String,
			required: true,
			default: () => generateId()
			// Use UUID instead of ObjectId
		},
		// UUID as per dbInterface.ts
		hash: { type: String, required: true },
		// Hash for media
		filename: { type: String, required: true },
		// Filename for media
		originalFilename: String,
		// Original filename for media
		path: { type: String, required: true },
		// Path to the media file
		size: { type: Number, required: true },
		// Size of the media file
		mimeType: { type: String, required: true },
		// Mime type of the media file
		folderId: { type: String, default: null },
		// Folder paths/ids as strings
		thumbnails: { type: Schema.Types.Mixed, default: {} },
		// Thumbnails for images
		metadata: {
			width: Number,
			height: Number,
			duration: Number,
			// Duration for videos/audio
			codec: String,
			// Codec used for media file
			format: String,
			// Format of the media file
			type: mongoose.Schema.Types.Mixed
			// Allow additional metadata fields via [key: string]: unknown
		},
		createdBy: { type: String, required: true },
		// Created by user ID
		updatedBy: { type: String, required: true },
		// Updated by user ID
		createdAt: { type: String, default: () => nowISODateString() },
		// CreatedAt ISODate type
		updatedAt: { type: String, default: () => nowISODateString() }
		// UpdatedAt ISODate type
	},
	{
		timestamps: true,
		collection: 'system_media',
		strict: true,
		// Enforce strict schema validation
		_id: false
		// Disable Mongoose auto-ObjectId generation
	}
);
mediaSchema.index({ filename: 1 });
mediaSchema.index({ hash: 1 }, { unique: true });
mediaSchema.index({ folderId: 1, createdAt: -1 });
mediaSchema.index({ createdBy: 1, createdAt: -1 });
mediaSchema.index({ mimeType: 1, createdAt: -1 });
mediaSchema.index({ updatedAt: -1 });
mediaSchema.index({ folderId: 1, mimeType: 1 });
mediaSchema.index({ filename: 'text', originalFilename: 'text' });
mediaSchema.statics = {
	// Get media by filename
	async getMediaByFilename(filename) {
		try {
			const mediaItem = await this.findOne({ filename }).lean().exec();
			return { success: true, data: mediaItem };
		} catch (error2) {
			const message = `Failed to retrieve media item by filename: ${filename}`;
			const err = error2;
			logger.error(`Error retrieving media item by filename: ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'MEDIA_GET_BY_FILENAME_ERROR',
					message: `Failed to retrieve media item by filename: ${filename}`
				}
			};
		}
	},
	// Get media items by folder ID
	async getMediaByFolderId(folderId) {
		try {
			const query = folderId ? { folderId } : {};
			const mediaItems = await this.find(query).lean().exec();
			return { success: true, data: mediaItems };
		} catch (error2) {
			const message = `Failed to retrieve media items for folder ID: ${folderId || 'root'}`;
			const err = error2;
			logger.error(`Error retrieving media items by folder ID: ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'MEDIA_GET_BY_FOLDER_ERROR',
					message: `Failed to retrieve media items for folder ID: ${folderId || 'root'}`
				}
			};
		}
	},
	// Bulk delete media items by folder ID
	async bulkDeleteMediaByFolderId(folderIds) {
		try {
			const result = await this.deleteMany({ folderId: { $in: folderIds } }).exec();
			logger.info(`Bulk deleted ${result.deletedCount} media items for folder IDs: ${folderIds.join(', ')}`);
			return { success: true, data: result.deletedCount };
		} catch (error2) {
			const message = 'Failed to bulk delete media items';
			const err = error2;
			logger.error(`Error bulk deleting media items by folder IDs: ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'MEDIA_BULK_DELETE_ERROR',
					message: 'Failed to bulk delete media items',
					details: error2
				}
			};
		}
	},
	// Upload a new media file
	async uploadMedia(mediaData) {
		try {
			const newMedia = await this.create({ ...mediaData, _id: generateId() });
			const mediaObj = newMedia.toObject();
			const mediaWithISODates = {
				_id: mediaObj._id,
				filename: mediaObj.filename,
				originalFilename: mediaObj.originalFilename,
				hash: mediaObj.hash,
				path: mediaObj.path,
				size: mediaObj.size,
				mimeType: mediaObj.mimeType,
				folderId: mediaObj.folderId,
				thumbnails: mediaObj.thumbnails,
				metadata: mediaObj.metadata,
				createdBy: mediaObj.createdBy,
				updatedBy: mediaObj.updatedBy,
				createdAt: toISOString(mediaObj.createdAt),
				updatedAt: toISOString(mediaObj.updatedAt)
			};
			return { success: true, data: mediaWithISODates };
		} catch (error2) {
			const message = 'Failed to upload media';
			const err = error2;
			logger.error(`Error uploading media: ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'MEDIA_UPLOAD_ERROR', message, details: error2 }
			};
		}
	},
	// Delete a media item by its ID
	async deleteMedia(mediaId) {
		try {
			const result = await this.deleteOne({ _id: mediaId }).exec();
			if (result.deletedCount === 0) {
				const message = `Media item with ID "${mediaId}" not found.`;
				return {
					success: false,
					message,
					error: {
						code: 'MEDIA_DELETE_NOT_FOUND',
						message: `Media item with ID "${mediaId}" not found.`
					}
				};
			}
			logger.info(`Media item "${mediaId}" deleted successfully.`);
			return { success: true, data: void 0 };
		} catch (error2) {
			const message = `Failed to delete media item "${mediaId}"`;
			const err = error2;
			logger.error(`Error deleting media item "${mediaId}": ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'MEDIA_DELETE_ERROR',
					message: `Failed to delete media item "${mediaId}"`,
					details: error2
				}
			};
		}
	}
};
const MediaModel = mongoose.models?.MediaItem || mongoose.model('MediaItem', mediaSchema);
const WidgetSchema = new Schema(
	{
		id: { type: String, required: true, unique: true },
		component: { type: String, required: true },
		label: { type: String, required: true },
		icon: { type: String, required: true },
		size: {
			w: { type: Number, required: true },
			h: { type: Number, required: true }
		},
		settings: { type: Schema.Types.Mixed, default: {} },
		gridPosition: { type: Number, required: false },
		// Optional to match TypeScript types
		order: { type: Number, required: false }
		// Optional order field used by dashboard
	},
	{ _id: false }
);
const LayoutSchema = new Schema({
	id: { type: String, required: true },
	name: { type: String, required: true },
	preferences: { type: [WidgetSchema], default: [] }
});
const SystemPreferencesSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() },
		// UUID as per dbInterface.ts
		userId: { type: String, ref: 'auth_users', required: false },
		// Optional userId for user-scoped preferences
		layoutId: { type: String, required: false },
		// Optional layout identifier
		layout: { type: LayoutSchema, required: false },
		// Optional structured layout data
		preferences: { type: Schema.Types.Mixed, default: {} },
		// Generic key-value preferences
		scope: { type: String, enum: ['user', 'system', 'widget'], default: 'user' },
		// Scope of the preference
		createdAt: { type: String, default: () => nowISODateString() },
		updatedAt: { type: String, default: () => nowISODateString() }
	},
	{
		timestamps: true,
		collection: 'system_preferences',
		strict: true,
		// Enforce strict schema validation
		_id: false
		// Disable Mongoose auto-ObjectId generation
	}
);
SystemPreferencesSchema.index({ userId: 1, layoutId: 1, scope: 1 }, { unique: true });
SystemPreferencesSchema.index({ scope: 1, userId: 1 });
SystemPreferencesSchema.index({ scope: 1 });
SystemPreferencesSchema.statics = {
	// Get preference by layoutId and userId
	async getPreferenceByLayout(userId, layoutId) {
		try {
			const query = { userId, layoutId, scope: 'user' };
			const doc = await this.findOne(query).lean().exec();
			if (!doc) {
				logger.debug(`No preference found for userId: ${userId}, layoutId: ${layoutId}`);
				return { success: true, data: null };
			}
			logger.debug(`Retrieved system preference for userId: ${userId}, layoutId: ${layoutId}`);
			return { success: true, data: doc.layout };
		} catch (error2) {
			const message = `Failed to retrieve preference for userId: ${userId}, layoutId: ${layoutId}`;
			logger.error(`Error retrieving system preference for userId: ${userId}, layoutId: ${layoutId}`, error2);
			return {
				success: false,
				message,
				error: {
					code: 'PREFERENCE_GET_ERROR',
					message
				}
			};
		}
	},
	// Set preference for a specific layout with optional widget validation
	async setPreference(userId, layoutId, layout, options) {
		try {
			let finalLayout = layout;
			const warnings = [];
			if (options?.validateWidgets && options?.getActiveWidgets) {
				const activeWidgets = await options.getActiveWidgets();
				const validatedResult = this.validateLayoutWidgets(layout, activeWidgets);
				finalLayout = validatedResult.layout;
				warnings.push(...validatedResult.warnings);
			}
			const query = { userId, layoutId, scope: 'user' };
			const documentId = `${userId}_${layoutId}`;
			await this.updateOne(query, { $set: { layout: finalLayout, _id: documentId } }, { upsert: true }).exec();
			logger.debug(`Set system preference for userId: ${userId}, layoutId: ${layoutId}`);
			return {
				success: true,
				data: { layout: finalLayout, warnings: warnings.length > 0 ? warnings : void 0 }
			};
		} catch (error2) {
			const message = `Failed to set preference for userId: ${userId}, layoutId: ${layoutId}`;
			logger.error(`Error setting system preference for userId: ${userId}, layoutId: ${layoutId}`, error2);
			return {
				success: false,
				message,
				error: {
					code: 'PREFERENCE_SET_ERROR',
					message
				}
			};
		}
	},
	// Validate widgets in a layout
	validateLayoutWidgets(layout, activeWidgets) {
		const warnings = [];
		const validatedPreferences = [];
		for (const widget of layout.preferences) {
			if (!activeWidgets.includes(widget.component)) {
				warnings.push(`Widget '${widget.component}' is not active, removing from layout`);
				continue;
			}
			validatedPreferences.push(widget);
		}
		return {
			layout: {
				...layout,
				preferences: validatedPreferences
			},
			warnings
		};
	},
	// Delete preferences for a user
	async deletePreferencesByUser(userId) {
		try {
			const result = await this.deleteMany({ userId, scope: 'user' }).exec();
			logger.info(`Deleted ${result.deletedCount} system preferences for userId: ${userId}`);
			return { success: true, data: result.deletedCount };
		} catch (error2) {
			const message = `Failed to delete preferences for userId: ${userId}`;
			logger.error(`Error deleting system preferences for userId: ${userId}`, error2);
			return {
				success: false,
				message,
				error: {
					code: 'PREFERENCE_DELETE_ERROR',
					message
				}
			};
		}
	}
};
const SystemPreferencesModel = mongoose.models?.SystemPreferences || mongoose.model('SystemPreferences', SystemPreferencesSchema);
const widgetSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() },
		// UUID primary key
		name: { type: String, required: true, unique: true },
		// Unique name for the widget
		isActive: { type: Boolean, default: false },
		// Whether the widget is globally active
		instances: {
			type: Schema.Types.Mixed,
			// Structured configurations (supports atomic updates via dot notation)
			default: {}
		},
		dependencies: [String],
		// Widget identifiers of dependencies
		createdAt: { type: String, default: () => nowISODateString() },
		updatedAt: { type: String, default: () => nowISODateString() }
	},
	{
		timestamps: true,
		collection: 'system_widgets',
		strict: true,
		// Enforce strict schema validation
		_id: false
		// Disable Mongoose auto-ObjectId generation
	}
);
widgetSchema.index({ isActive: 1, name: 1 });
widgetSchema.index({ isActive: 1, updatedAt: -1 });
widgetSchema.statics = {
	// Get all widgets.
	async getAllWidgets() {
		try {
			const widgets = await this.find().lean().exec();
			return { success: true, data: widgets };
		} catch (error2) {
			const err = error2;
			const message = 'Failed to fetch widgets';
			logger.error(`Error fetching all widgets: ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'WIDGET_FETCH_ERROR', message }
			};
		}
	},
	// Get active widgets.
	async getActiveWidgets() {
		try {
			const widgets = await this.find({ isActive: true }, 'name').lean().exec();
			const activeWidgetNames = widgets.map((widget) => widget.name);
			return { success: true, data: activeWidgetNames };
		} catch (error2) {
			const err = error2;
			const message = 'Failed to fetch active widgets';
			logger.error(`Error fetching active widgets: ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'ACTIVE_WIDGETS_FETCH_ERROR', message }
			};
		}
	},
	// Activate a widget by its name
	async activateWidget(widgetName) {
		try {
			const widget = await this.findOne({ name: widgetName }).exec();
			if (!widget) {
				const message = `Widget "${widgetName}" not found in database.`;
				return {
					success: false,
					message,
					error: { code: 'WIDGET_NOT_FOUND', message }
				};
			}
			if (widget.isActive) {
				logger.info(`Widget "${widgetName}" is already active.`);
				return { success: true, data: void 0 };
			}
			await this.updateOne({ name: widgetName }, { $set: { isActive: true, updatedAt: nowISODateString() } }).exec();
			logger.info(`Widget "${widgetName}" activated successfully.`);
			return { success: true, data: void 0 };
		} catch (error2) {
			const err = error2;
			const message = `Failed to activate widget "${widgetName}"`;
			logger.error(`Error activating widget "${widgetName}": ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'WIDGET_ACTIVATION_ERROR', message }
			};
		}
	},
	// Deactivate a widget by its name
	async deactivateWidget(widgetName) {
		try {
			const widget = await this.findOne({ name: widgetName }).exec();
			if (!widget) {
				const message = `Widget "${widgetName}" not found in database.`;
				return {
					success: false,
					message,
					error: { code: 'WIDGET_NOT_FOUND', message }
				};
			}
			if (!widget.isActive) {
				logger.info(`Widget "${widgetName}" is already inactive.`);
				return { success: true, data: void 0 };
			}
			await this.updateOne({ name: widgetName }, { $set: { isActive: false, updatedAt: nowISODateString() } }).exec();
			logger.info(`Widget "${widgetName}" deactivated successfully.`);
			return { success: true, data: void 0 };
		} catch (error2) {
			const err = error2;
			const message = `Failed to deactivate widget "${widgetName}"`;
			logger.error(`Error deactivating widget "${widgetName}": ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'WIDGET_DEACTIVATION_ERROR', message }
			};
		}
	},
	// Update a widget's configuration
	async updateWidget(widgetName, updateData) {
		try {
			const result = await this.updateOne({ name: widgetName }, { $set: { ...updateData, updatedAt: nowISODateString() } }).exec();
			if (result.modifiedCount === 0) {
				const message = `Widget "${widgetName}" not found or no changes applied.`;
				return {
					success: false,
					message,
					error: { code: 'WIDGET_NOT_FOUND', message }
				};
			}
			logger.info(`Widget "${widgetName}" updated successfully.`);
			return { success: true, data: void 0 };
		} catch (error2) {
			const err = error2;
			const message = `Failed to update widget "${widgetName}"`;
			logger.error(`Error updating widget "${widgetName}": ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'WIDGET_UPDATE_ERROR', message }
			};
		}
	},
	// Atomically update a specific widget instance configuration
	// Example: updateWidgetInstance('myWidget', 'dashboard-header', { color: 'blue', size: 'large' })
	async updateWidgetInstance(widgetName, instanceId, instanceConfig) {
		try {
			const result = await this.updateOne(
				{ name: widgetName },
				{
					$set: {
						[`instances.${instanceId}`]: instanceConfig,
						updatedAt: nowISODateString()
					}
				}
			).exec();
			if (result.matchedCount === 0) {
				const message = `Widget "${widgetName}" not found.`;
				return {
					success: false,
					message,
					error: { code: 'WIDGET_NOT_FOUND', message }
				};
			}
			logger.info(`Widget "${widgetName}" instance "${instanceId}" updated successfully.`);
			return { success: true, data: void 0 };
		} catch (error2) {
			const err = error2;
			const message = `Failed to update widget instance "${instanceId}" for widget "${widgetName}"`;
			logger.error(`Error updating widget instance: ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'WIDGET_INSTANCE_UPDATE_ERROR', message }
			};
		}
	}
};
const WidgetModel = mongoose.models?.Widget || mongoose.model('Widget', widgetSchema);
const systemVirtualFolderSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() },
		// UUID primary key
		name: { type: String, required: true },
		path: { type: String, required: true, unique: true },
		parentId: { type: String, ref: 'SystemVirtualFolder' },
		// Reference to parent folder
		icon: { type: String, default: 'bi:folder' },
		order: { type: Number, default: 0 },
		type: { type: String, enum: ['folder', 'collection'], required: true },
		metadata: Schema.Types.Mixed,
		createdAt: { type: String, default: () => nowISODateString() },
		updatedAt: { type: String, default: () => nowISODateString() }
	},
	{
		timestamps: true,
		collection: 'system_virtual_folders',
		strict: true,
		// Enforce strict schema validation
		_id: false,
		// Disable Mongoose auto-ObjectId generation
		statics: {
			async createVirtualFolder(folder) {
				try {
					const existingFolder = await this.findOne({ path: folder.path ?? `/${folder.name}` });
					if (existingFolder) {
						const message = 'Folder with this path already exists';
						return {
							success: false,
							message,
							error: {
								code: 'VIRTUAL_FOLDER_DUPLICATE',
								message,
								details: { path: folder.path ?? `/${folder.name}` }
							}
						};
					}
					const newFolder = new this({
						...folder,
						_id: folder._id,
						// Ensure _id is set after spread to avoid duplication warning
						path: folder.path ?? `/${folder.name}`,
						type: 'folder'
					});
					await newFolder.save();
					return { success: true, data: newFolder };
				} catch (error2) {
					if (typeof error2 === 'object' && error2 !== null && 'code' in error2 && error2.code === 11e3) {
						const message2 = 'Folder with this path already exists';
						return {
							success: false,
							message: message2,
							error: {
								code: 'VIRTUAL_FOLDER_DUPLICATE',
								message: message2,
								details: { path: folder.path ?? `/${folder.name}` }
							}
						};
					}
					const message = 'Failed to create virtual folder';
					logger$1.error(`Error creating virtual folder: ${getErrorMessage(error2)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_CREATE_ERROR',
							message,
							details: error2
						}
					};
				}
			},
			async getAllVirtualFolders() {
				try {
					const folders = await this.find({}).lean().exec();
					return { success: true, data: folders };
				} catch (error2) {
					const message = 'Failed to retrieve virtual folders';
					logger$1.error(`Error retrieving virtual folders: ${getErrorMessage(error2)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_GET_ERROR',
							message,
							details: error2
						}
					};
				}
			},
			// Get virtual folder by path
			async getVirtualFolderByPath(path) {
				try {
					const folder = await this.findOne({ path }).lean().exec();
					if (!folder) {
						return { success: true, data: null };
					}
					logger$1.debug(`Retrieved virtual folder by path: ${path}`);
					return { success: true, data: folder };
				} catch (error2) {
					const message = `Failed to retrieve virtual folder for path: ${path}`;
					logger$1.error(`Error retrieving virtual folder by path: ${getErrorMessage(error2)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_GET_ERROR',
							message
						}
					};
				}
			},
			// Get children of a virtual folder
			async getVirtualFolderChildren(parentPath) {
				try {
					const folders = await this.find({ path: { $regex: `^${parentPath}/[^/]+$` } })
						.sort({ order: 1 })
						.lean()
						.exec();
					logger$1.debug(`Retrieved children for virtual folder path: ${parentPath}`);
					return { success: true, data: folders };
				} catch (error2) {
					const message = `Failed to retrieve children for path: ${parentPath}`;
					logger$1.error(`Error retrieving virtual folder children: ${getErrorMessage(error2)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_CHILDREN_ERROR',
							message
						}
					};
				}
			},
			// Bulk update folder order
			async bulkUpdateFolderOrder(parentId, orderUpdates) {
				try {
					const bulkOps = orderUpdates.map((update) => ({
						updateOne: {
							filter: { path: update.path, parentId },
							update: { $set: { order: update.order } }
						}
					}));
					const result = await this.bulkWrite(bulkOps);
					logger$1.info(`Updated order for ${result.modifiedCount} virtual folders under parent: ${parentId}`);
					return { success: true, data: result.modifiedCount };
				} catch (error2) {
					const message = 'Failed to bulk update folder order';
					logger$1.error(`Error bulk updating virtual folder order: ${getErrorMessage(error2)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_ORDER_UPDATE_ERROR',
							message,
							details: error2
						}
					};
				}
			},
			// Check if folder with given path exists
			async exists(path) {
				try {
					const count = await this.countDocuments({ path });
					return { success: true, data: count > 0 };
				} catch (error2) {
					const message = 'Failed to check folder existence';
					logger$1.error(`Error checking folder existence: ${getErrorMessage(error2)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_CHECK_ERROR',
							message,
							details: error2
						}
					};
				}
			},
			// Update a virtual folder
			async updateVirtualFolder(folderId, updateData) {
				try {
					const folder = await this.findByIdAndUpdate(folderId, { $set: updateData }, { new: true }).lean().exec();
					if (!folder) {
						const message = 'Folder not found';
						return {
							success: false,
							message,
							error: {
								code: 'VIRTUAL_FOLDER_NOT_FOUND',
								message
							}
						};
					}
					return { success: true, data: folder };
				} catch (error2) {
					const message = 'Failed to update virtual folder';
					logger$1.error(`Error updating virtual folder: ${getErrorMessage(error2)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_UPDATE_ERROR',
							message,
							details: error2
						}
					};
				}
			},
			// Delete a virtual folder and its children recursively
			async deleteVirtualFolder(folderId) {
				try {
					const folder = await this.findById(folderId).lean().exec();
					if (!folder) {
						return { success: true, data: void 0 };
					}
					const children = await this.find({ path: { $regex: `^${folder.path}/` } })
						.lean()
						.exec();
					const folderIdsToDelete = [folder._id, ...children.map((c) => c._id)];
					await this.deleteMany({ _id: { $in: folderIdsToDelete } });
					return { success: true, data: void 0 };
				} catch (error2) {
					const message = 'Failed to delete virtual folder';
					logger$1.error(`Error deleting virtual folder: ${getErrorMessage(error2)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_DELETE_ERROR',
							message,
							details: error2
						}
					};
				}
			}
		}
	}
);
systemVirtualFolderSchema.index({ parentId: 1 });
systemVirtualFolderSchema.index({ type: 1 });
systemVirtualFolderSchema.index({ order: 1 });
const SystemVirtualFolderModel = mongoose.models?.SystemVirtualFolder || mongoose.model('SystemVirtualFolder', systemVirtualFolderSchema);
const UserSchema = new Schema(
	{
		_id: { type: String, required: true },
		// UUID as primary key
		email: { type: String, required: true, unique: true },
		// User's email, required field
		tenantId: { type: String, index: true },
		// Tenant identifier for multi-tenancy, indexed for performance
		password: { type: String },
		// User's password, optional field
		role: { type: String, required: true },
		// User's role, required field
		permissions: [{ type: String }],
		// User-specific permissions as names, optional field
		username: String,
		// User's username, optional field
		firstName: String,
		// First name of the user
		lastName: String,
		// Last name of the user
		locale: String,
		// Locale of the user
		avatar: String,
		// URL of the user's avatar, optional field
		lastAuthMethod: String,
		// Last authentication method used by the user, optional field
		lastActiveAt: { type: Date, default: Date.now },
		// Last time the user was active as ISO string, optional field
		expiresAt: { type: Date },
		// Expiration timestamp as ISO string, optional field
		isRegistered: Boolean,
		// Registration status of the user, optional field
		failedAttempts: { type: Number, default: 0 },
		// Number of failed login attempts, optional field
		blocked: Boolean,
		// Whether the user is blocked, optional field
		resetRequestedAt: { type: Date },
		// Timestamp for when the user requested a password reset, optional field
		resetToken: String,
		// Token for resetting the user's password, optional field
		lockoutUntil: { type: Date },
		// Timestamp for when the user is locked out, optional field
		is2FAEnabled: Boolean,
		// Whether the user has 2FA enabled, optional field
		totpSecret: String,
		// TOTP secret for 2FA (base32 encoded), optional field
		backupCodes: [String],
		// Array of hashed backup codes for 2FA recovery, optional field
		last2FAVerification: { type: Date }
		// Timestamp of last successful 2FA verification, optional field
	},
	{
		timestamps: true,
		// Automatically adds `createdAt` and `updatedAt` fields
		collection: 'auth_users',
		// Explicitly set the collection name to match model registration
		_id: false
		// Disable auto ObjectId generation - we provide our own UUID
	}
);
UserSchema.index({ tenantId: 1, email: 1 });
UserSchema.index({ tenantId: 1, role: 1, blocked: 1 });
UserSchema.index({ tenantId: 1, username: 1 }, { sparse: true });
UserSchema.index({ tenantId: 1, lastActiveAt: -1 });
UserSchema.index({ resetToken: 1 }, { sparse: true, expireAfterSeconds: 3600 });
UserSchema.index({ expiresAt: 1 }, { sparse: true, expireAfterSeconds: 0 });
UserSchema.index({ lockoutUntil: 1 }, { sparse: true });
UserSchema.index({ role: 1, blocked: 1, isRegistered: 1 });
UserSchema.index({ email: 1, lastAuthMethod: 1 });
class UserAdapter {
	UserModel;
	constructor() {
		if (mongoose.models?.auth_users) {
			delete mongoose.models.auth_users;
		}
		this.UserModel = mongoose.model('auth_users', UserSchema);
	}
	// Create a new user
	async createUser(userData) {
		try {
			const normalizedUserData = {
				...userData,
				email: userData.email?.toLowerCase()
			};
			logger.debug('UserAdapter.createUser received data:', {
				...normalizedUserData,
				email: '[REDACTED]',
				password: '[REDACTED]',
				avatar: `Avatar value: "${normalizedUserData.avatar}" (type: ${typeof normalizedUserData.avatar}, length: ${normalizedUserData.avatar?.length || 0})`
			});
			const userId = generateId();
			const user = new this.UserModel({ ...normalizedUserData, _id: userId });
			logger.debug('UserModel before save:', {
				email: '[REDACTED]',
				avatar: `Model avatar: "${user.avatar}" (type: ${typeof user.avatar})`,
				hasAvatar: !!user.avatar
			});
			await user.save();
			logger.debug('User created and saved:', {
				_id: user._id,
				email: '[REDACTED]',
				avatar: `Saved avatar: "${user.avatar}" (type: ${typeof user.avatar})`,
				allFields: Object.keys(user.toObject())
			});
			const savedUser = user.toObject();
			savedUser._id = savedUser._id.toString();
			return {
				success: true,
				data: savedUser
			};
		} catch (err) {
			const message = `Error in UserAdapter.createUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				email: '[REDACTED]',
				error: err,
				userData: Object.keys(userData)
			});
			return {
				success: false,
				message,
				error: {
					code: 'CREATE_USER_ERROR',
					message
				}
			};
		}
	}
	// Edit a user
	async updateUserAttributes(user_id, userData, tenantId) {
		try {
			const filter = { _id: user_id };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const user = await this.UserModel.findOneAndUpdate(filter, userData, { new: true }).lean();
			if (!user) {
				return {
					success: false,
					message: `User not found for ID: ${user_id} ${tenantId ? `in tenant: ${tenantId}` : ''}`,
					error: {
						code: 'USER_NOT_FOUND',
						message: `User not found for ID: ${user_id} ${tenantId ? `in tenant: ${tenantId}` : ''}`
					}
				};
			}
			user._id = user._id.toString();
			if (user.permissions && Array.isArray(user.permissions)) {
				user.permissions = user.permissions.map((p) => String(p));
			}
			logger.debug(`User attributes updated: ${user_id}`, { tenantId });
			return {
				success: true,
				data: user
			};
		} catch (err) {
			const message = `Error in UserAdapter.updateUserAttributes: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, tenantId });
			return {
				success: false,
				message,
				error: {
					code: 'UPDATE_USER_ERROR',
					message
				}
			};
		}
	}
	// Get all users with optional filtering, sorting, and pagination
	async getAllUsers(options) {
		try {
			let query = this.UserModel.find(options?.filter || {}).lean();
			if (options?.sort) {
				const sortOptions = {};
				if (Array.isArray(options.sort)) {
					options.sort.forEach(([field, direction]) => {
						sortOptions[field] = direction === 'asc' ? 1 : -1;
					});
				} else {
					Object.entries(options.sort).forEach(([field, direction]) => {
						sortOptions[field] = direction === 'asc' ? 1 : -1;
					});
				}
				query = query.sort(sortOptions);
			}
			if (typeof options?.offset === 'number') {
				query = query.skip(options.offset);
			}
			if (typeof options?.limit === 'number') {
				query = query.limit(options.limit);
			}
			const users = await query.exec();
			const mappedUsers = users.map((user) => {
				user._id = user._id.toString();
				if (user.permissions && Array.isArray(user.permissions)) {
					user.permissions = user.permissions.map((p) => String(p));
				}
				return user;
			});
			return {
				success: true,
				data: mappedUsers
			};
		} catch (err) {
			const message = `Error in UserAdapter.getAllUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { options });
			return {
				success: false,
				message,
				error: {
					code: 'GET_ALL_USERS_ERROR',
					message
				}
			};
		}
	}
	// Get the count of users
	async getUserCount(filter) {
		try {
			const count = await this.UserModel.countDocuments(filter || {});
			logger.debug(`User count retrieved: ${count}`);
			return {
				success: true,
				data: count
			};
		} catch (err) {
			const message = `Error in UserAdapter.getUserCount: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { filter });
			return {
				success: false,
				message,
				error: {
					code: 'GET_USER_COUNT_ERROR',
					message
				}
			};
		}
	}
	// Get users with a permission
	async getUsersWithPermission(permissionName) {
		try {
			const users = await this.UserModel.find({ permissions: permissionName }).lean();
			logger.debug(`Users with permission ${permissionName} retrieved`);
			const mappedUsers = users.map((user) => {
				user._id = user._id.toString();
				if (user.permissions && Array.isArray(user.permissions)) {
					user.permissions = user.permissions.map((p) => String(p));
				}
				return user;
			});
			return {
				success: true,
				data: mappedUsers
			};
		} catch (err) {
			const message = `Error in UserAdapter.getUsersWithPermission: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { permissionName });
			return {
				success: false,
				message,
				error: {
					code: 'GET_USERS_WITH_PERMISSION_ERROR',
					message
				}
			};
		}
	}
	// Assign a permission to a user
	async assignPermissionToUser(user_id, permissionName) {
		const allPermissions = await getAllPermissions();
		const permission = allPermissions.find((p) => p._id === permissionName);
		if (!permission) {
			logger.warn(`Permission not found: ${permissionName}`);
			return {
				success: false,
				message: `Permission not found: ${permissionName}`,
				error: {
					code: 'PERMISSION_NOT_FOUND',
					message: `Permission not found: ${permissionName}`
				}
			};
		}
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $addToSet: { permissions: permissionName } });
			logger.info(`Permission ${permissionName} assigned to user${user_id}`);
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in UserAdapter.assignPermissionToUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, permissionName });
			return {
				success: false,
				message,
				error: {
					code: 'ASSIGN_PERMISSION_ERROR',
					message
				}
			};
		}
	}
	// Remove a permission from a user
	async deletePermissionFromUser(user_id, permissionName) {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $pull: { permissions: permissionName } });
			logger.info(`Permission ${permissionName} removed from user ${user_id}`);
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in UserAdapter.deletePermissionFromUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, permissionName });
			return {
				success: false,
				message,
				error: {
					code: 'DELETE_PERMISSION_ERROR',
					message
				}
			};
		}
	}
	// Get permissions for a user
	async getPermissionsForUser(user_id) {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user) {
				logger.warn(`User not found: ${user_id}`);
				return {
					success: true,
					data: []
				};
			}
			user._id = user._id.toString();
			const directPermissions = new Set(user.permissions || []);
			const allPermissions = await getAllPermissions();
			const userPermissions = allPermissions.filter((perm) => directPermissions.has(perm._id));
			const uniquePermissions = Array.from(new Set(userPermissions.map((p) => p._id))).map((id) => userPermissions.find((p) => p._id === id));
			logger.debug(`Permissions retrieved for user: ${user_id}`);
			return {
				success: true,
				data: uniquePermissions
			};
		} catch (err) {
			const message = `Error in UserAdapter.getPermissionsForUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'GET_PERMISSIONS_ERROR',
					message
				}
			};
		}
	}
	// Check if a user has a specific permission
	async hasPermissionByAction(user_id, permissionName) {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user) {
				logger.warn(`User not found: ${user_id}`);
				return {
					success: true,
					data: false
				};
			}
			user._id = user._id.toString();
			const directPermissions = new Set(user.permissions || []);
			const hasDirectPermission = directPermissions.has(permissionName);
			if (hasDirectPermission) {
				return {
					success: true,
					data: true
				};
			}
			logger.debug(`User ${user_id} does not have permission: ${permissionName}`);
			return {
				success: true,
				data: false
			};
		} catch (err) {
			const message = `Error in UserAdapter.hasPermissionByAction: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, permissionName });
			return {
				success: false,
				message,
				error: {
					code: 'HAS_PERMISSION_ERROR',
					message
				}
			};
		}
	}
	// Change user password
	async changePassword(user_id, newPassword) {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { password: newPassword });
			logger.info(`Password changed for user: ${user_id}`);
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in UserAdapter.changePassword: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'CHANGE_PASSWORD_ERROR',
					message
				}
			};
		}
	}
	// Block a user
	async blockUser(user_id) {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				blocked: true,
				lockoutUntil: /* @__PURE__ */ new Date()
				// Set lockoutUntil to current time
			});
			logger.info(`User blocked: ${user_id}`);
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in UserAdapter.blockUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'BLOCK_USER_ERROR',
					message
				}
			};
		}
	}
	// Unblock a user
	async unblockUser(user_id) {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				blocked: false,
				lockoutUntil: null
				// Clear lockoutUntil
			});
			logger.info(`User unblocked: ${user_id}`);
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in UserAdapter.unblockUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'UNBLOCK_USER_ERROR',
					message
				}
			};
		}
	}
	// Block multiple users
	async blockUsers(userIds, tenantId) {
		try {
			const filter = { _id: { $in: userIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const result = await this.UserModel.updateMany(filter, {
				blocked: true,
				lockoutUntil: /* @__PURE__ */ new Date()
				// Set lockoutUntil to current time
			});
			logger.info(`Users blocked: ${userIds.join(', ')}`, { tenantId });
			return {
				success: true,
				data: { modifiedCount: result.modifiedCount }
			};
		} catch (err) {
			const message = `Error in UserAdapter.blockUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { userIds, tenantId });
			return {
				success: false,
				message,
				error: {
					code: 'BLOCK_USERS_ERROR',
					message
				}
			};
		}
	}
	// Unblock multiple users
	async unblockUsers(userIds, tenantId) {
		try {
			const filter = { _id: { $in: userIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const result = await this.UserModel.updateMany(filter, {
				blocked: false,
				lockoutUntil: null
				// Clear lockoutUntil
			});
			logger.info(`Users unblocked: ${userIds.join(', ')}`, { tenantId });
			return {
				success: true,
				data: { modifiedCount: result.modifiedCount }
			};
		} catch (err) {
			const message = `Error in UserAdapter.unblockUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { userIds, tenantId });
			return {
				success: false,
				message,
				error: {
					code: 'UNBLOCK_USERS_ERROR',
					message
				}
			};
		}
	}
	// Delete a user
	async deleteUser(user_id, tenantId) {
		try {
			const filter = { _id: user_id };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			await this.UserModel.findOneAndDelete(filter);
			logger.info(`User deleted: ${user_id}`, { tenantId });
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in UserAdapter.deleteUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, tenantId });
			return {
				success: false,
				message,
				error: {
					code: 'DELETE_USER_ERROR',
					message
				}
			};
		}
	}
	// Delete multiple users
	async deleteUsers(userIds, tenantId) {
		try {
			const filter = { _id: { $in: userIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const result = await this.UserModel.deleteMany(filter);
			logger.info(`Users deleted: ${userIds.join(', ')}`, { tenantId });
			return {
				success: true,
				data: { deletedCount: result.deletedCount }
			};
		} catch (err) {
			const message = `Error in UserAdapter.deleteUsers: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { userIds, tenantId });
			return {
				success: false,
				message,
				error: {
					code: 'DELETE_USERS_ERROR',
					message
				}
			};
		}
	}
	// Get a user by ID
	async getUserById(user_id, tenantId) {
		try {
			const filter = { _id: user_id };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const user = await this.UserModel.findOne(filter).lean();
			if (user) {
				user._id = user._id.toString();
				if (user.permissions && Array.isArray(user.permissions)) {
					user.permissions = user.permissions.map((p) => String(p));
				}
				logger.debug(`User retrieved by ID: ${user_id}`, {
					tenantId: tenantId || 'none (single-tenant mode)'
				});
				return {
					success: true,
					data: user
				};
			} else {
				return {
					success: true,
					data: null
				};
			}
		} catch (err) {
			const message = `Error in UserAdapter.getUserById: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				user_id,
				tenantId: tenantId || 'none (single-tenant mode)'
			});
			return {
				success: false,
				message,
				error: {
					code: 'GET_USER_BY_ID_ERROR',
					message
				}
			};
		}
	}
	// Get a user by email
	async getUserByEmail(criteria) {
		try {
			if (!criteria.email || typeof criteria.email !== 'string') {
				logger.error('getUserByEmail called with invalid email:', { email: criteria.email, tenantId: criteria.tenantId });
				return {
					success: true,
					data: null
				};
			}
			const normalizedEmail = criteria.email.toLowerCase();
			const filter = { email: normalizedEmail };
			if (criteria.tenantId) {
				filter.tenantId = criteria.tenantId;
			}
			const user = await this.UserModel.findOne(filter).lean();
			if (user) {
				user._id = user._id.toString();
				if (user.permissions && Array.isArray(user.permissions)) {
					user.permissions = user.permissions.map((p) => String(p));
				}
				logger.debug(`User retrieved by email:`, {
					email: '[REDACTED]',
					tenantId: criteria.tenantId || 'none (single-tenant mode)'
				});
				return {
					success: true,
					data: user
				};
			} else {
				return {
					success: true,
					data: null
				};
			}
		} catch (err) {
			const message = `Error in UserAdapter.getUserByEmail: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				email: '[REDACTED]',
				tenantId: criteria.tenantId || 'none (single-tenant mode)'
			});
			return {
				success: false,
				message,
				error: {
					code: 'GET_USER_BY_EMAIL_ERROR',
					message
				}
			};
		}
	}
	// Assign a role to a user
	async assignRoleToUser(user_id, role) {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { role });
			logger.info(`Role ${role} assigned to user ${user_id}`);
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in UserAdapter.assignRoleToUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, role });
			return {
				success: false,
				message,
				error: {
					code: 'ASSIGN_ROLE_ERROR',
					message
				}
			};
		}
	}
	// Remove a role from a user
	async removeRoleFromUser(user_id) {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { $unset: { role: '' } });
			logger.info(`Role removed from user ${user_id}`);
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in UserAdapter.removeRoleFromUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'REMOVE_ROLE_ERROR',
					message
				}
			};
		}
	}
	// Get roles for a user
	async getRolesForUser(user_id) {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (!user || !user.role) {
				logger.warn(`User or role not found for user ID: ${user_id}`);
				return {
					success: true,
					data: []
				};
			}
			user._id = user._id.toString();
			const role = getPrivateSettingSync('ROLES')?.find((r) => r._id === user.role);
			if (!role) {
				logger.warn(`Role not found: ${user.role} for user ID: ${user_id}`);
				return {
					success: true,
					data: []
				};
			}
			logger.debug(`Roles retrieved for user ID: ${user_id}`);
			return {
				success: true,
				data: [role]
			};
		} catch (err) {
			const message = `Error in UserAdapter.getRolesForUser: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'GET_ROLES_ERROR',
					message
				}
			};
		}
	}
	// Fetch the last 5 users who logged in
	async getRecentUserActivities() {
		try {
			const recentUsers = await this.UserModel.find({ lastActiveAt: { $ne: null } })
				.sort({ lastActiveAt: -1 })
				.limit(5)
				.select('email username lastActiveAt')
				.lean();
			logger.debug('Retrieved recent user activities');
			const mappedUsers = recentUsers.map((user) => {
				user._id = user._id.toString();
				return user;
			});
			return {
				success: true,
				data: mappedUsers
			};
		} catch (err) {
			const message = `Error in UserAdapter.getRecentUserActivities: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'GET_RECENT_ACTIVITIES_ERROR',
					message
				}
			};
		}
	}
	// Check user role
	async checkUserRole(user_id, role_name) {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (user) {
				user._id = user._id.toString();
				return {
					success: true,
					data: user.role === role_name
				};
			}
			return {
				success: true,
				data: false
			};
		} catch (err) {
			const message = `Error in UserAdapter.checkUserRole: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, role_name });
			return {
				success: false,
				message,
				error: {
					code: 'CHECK_USER_ROLE_ERROR',
					message
				}
			};
		}
	}
	// Update lastActiveAt
	async updateLastActiveAt(user_id) {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				lastActiveAt: /* @__PURE__ */ new Date()
			});
			logger.debug(`Updated lastActiveAt for user: ${user_id}`);
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in UserAdapter.updateLastActiveAt: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'UPDATE_LAST_ACTIVE_ERROR',
					message
				}
			};
		}
	}
	// Set expiration date
	async setUserExpiration(user_id, expirationDate) {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, {
				expiresAt: expirationDate
			});
			logger.debug(`Set expiration date for user: ${user_id}`);
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in UserAdapter.setUserExpiration: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id, expirationDate });
			return {
				success: false,
				message,
				error: {
					code: 'SET_USER_EXPIRATION_ERROR',
					message
				}
			};
		}
	}
	// check if a user is expired
	async isUserExpired(user_id) {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			if (user && user.expiresAt) {
				return {
					success: true,
					data: new Date(user.expiresAt) < /* @__PURE__ */ new Date()
				};
			}
			return {
				success: true,
				data: false
			};
		} catch (err) {
			const message = `Error in UserAdapter.isUserExpired: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id });
			return {
				success: false,
				message,
				error: {
					code: 'IS_USER_EXPIRED_ERROR',
					message
				}
			};
		}
	}
}
const SessionSchema = new Schema(
	{
		_id: { type: String, required: true },
		// UUID as primary key
		// Index definitions have been removed from here to prevent duplication.
		user_id: { type: String, required: true },
		// User identifier
		tenantId: { type: String },
		// Tenant identifier for multi-tenancy
		expires: { type: Date, required: true },
		// Expiry timestamp - MUST be Date for TTL index
		rotated: { type: Boolean, default: false },
		// Flag to mark rotated sessions
		rotatedTo: { type: String }
		// ID of the new session this was rotated to
	},
	{
		timestamps: true,
		// Automatically adds createdAt and updatedAt as Date types
		_id: false
		// Disable auto ObjectId generation - we provide our own UUID
	}
);
SessionSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ user_id: 1, expires: 1, rotated: 1 });
SessionSchema.index({ tenantId: 1, user_id: 1, expires: 1 });
SessionSchema.index({ tenantId: 1, expires: 1, rotated: 1 });
SessionSchema.index({ rotated: 1, expires: 1 });
SessionSchema.index({ rotatedTo: 1 }, { sparse: true });
class SessionAdapter {
	SessionModel;
	constructor() {
		if (mongoose.models?.auth_sessions) {
			delete mongoose.models.auth_sessions;
		}
		this.SessionModel = mongoose.model('auth_sessions', SessionSchema);
		this.migrateToUuidSessions().catch((err) => {
			logger.warn('Failed to migrate sessions to UUID format', { error: err.message });
		});
	}
	// Migration: Remove old ObjectId-based sessions
	async migrateToUuidSessions() {
		try {
			const result = await this.SessionModel.deleteMany({
				$or: [
					{ _id: { $type: 'objectId' } },
					// MongoDB ObjectId type
					{ _id: { $regex: /^[0-9a-f]{24}$/ } }
					// 24-char hex string (ObjectId format)
				]
			});
			if (result.deletedCount && result.deletedCount > 0) {
				logger.info(`🔄 Migrated sessions: Removed ${result.deletedCount} old ObjectId-based sessions`);
			}
		} catch (err) {
			logger.debug('Session migration check completed', { error: err instanceof Error ? err.message : String(err) });
		}
	}
	// Validate token signature and claims
	async validateToken(token, user_id, _type, tenantId) {
		try {
			const session = await this.SessionModel.findById(token).lean();
			if (!session) {
				return {
					success: true,
					data: { success: false, message: 'Session not found' }
				};
			}
			if (new Date(session.expires) <= /* @__PURE__ */ new Date()) {
				await this.SessionModel.findByIdAndDelete(token);
				return {
					success: true,
					data: { success: false, message: 'Session expired' }
				};
			}
			if (user_id && session.user_id !== user_id) {
				return {
					success: true,
					data: { success: false, message: 'Session does not match user' }
				};
			}
			if (tenantId && session.tenantId !== tenantId) {
				return {
					success: true,
					data: { success: false, message: 'Session does not match tenant' }
				};
			}
			return {
				success: true,
				data: { success: true, message: 'Token is valid' }
			};
		} catch (err) {
			logger.error(`Token validation failed: ${err instanceof Error ? err.message : String(err)}`);
			return {
				success: false,
				message: `Token validation failed: ${err instanceof Error ? err.message : String(err)}`,
				error: {
					code: 'VALIDATION_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}
	// Create a new session
	async createSession(sessionData) {
		try {
			const sessionId = generateId();
			const session = new this.SessionModel({ ...sessionData, _id: sessionId });
			await session.save();
			logger.info(`Session created: ${sessionId} for user: ${sessionData.user_id}`);
			const sessionObj = session.toObject();
			return {
				success: true,
				data: this.formatSession(sessionObj)
			};
		} catch (err) {
			const message = `Error in SessionAdapter.createSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'CREATE_SESSION_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}
	// Create a new session with options (optimized with atomic bulkWrite)
	async createSessionWithOptions(sessionData, options = {}) {
		try {
			if (options.invalidateOthers !== false) {
				const now = /* @__PURE__ */ new Date();
				const filter = {
					user_id: sessionData.user_id,
					expires: { $gt: now },
					// Only delete active (non-expired) sessions
					$or: [
						{ rotated: { $ne: true } },
						// Delete non-rotated sessions
						{ rotated: true, expires: { $lte: new Date(now.getTime() + 6e4).toISOString() } }
						// Delete rotated sessions close to expiry
					]
				};
				if (sessionData.tenantId) {
					filter.tenantId = sessionData.tenantId;
				}
				const sessionId = generateId();
				const newSession = new this.SessionModel({ ...sessionData, _id: sessionId });
				await this.SessionModel.bulkWrite([
					{
						// Step 1: Delete all existing active sessions for this user
						deleteMany: {
							filter
						}
					},
					{
						// Step 2: Insert the new session
						insertOne: {
							document: newSession
						}
					}
				]);
				logger.info(`Session created: ${sessionId} for user: ${sessionData.user_id}`);
				return this.formatSession({
					_id: sessionId,
					user_id: sessionData.user_id,
					expires: sessionData.expires,
					tenantId: sessionData.tenantId,
					rotated: false
				});
			} else {
				const sessionResult = await this.createSession(sessionData);
				if (!sessionResult.success) {
					throw new Error(sessionResult.message);
				}
				return sessionResult.data;
			}
		} catch (err) {
			const message = `Error in SessionAdapter.createSessionWithOptions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}
	// Rotate token - create new session and gracefully transition from old one
	async rotateToken(oldToken, expires) {
		try {
			const oldSession = await this.SessionModel.findById(oldToken).lean();
			if (!oldSession) {
				return {
					success: false,
					message: `Session not found: ${oldToken}`,
					error: {
						code: 'SESSION_NOT_FOUND',
						message: `Session not found: ${oldToken}`,
						statusCode: 404
					}
				};
			}
			if (new Date(oldSession.expires) <= /* @__PURE__ */ new Date()) {
				logger.warn(`Attempting to rotate expired session: ${oldToken}`);
				return {
					success: false,
					message: `Cannot rotate expired session: ${oldToken}`,
					error: {
						code: 'SESSION_EXPIRED',
						message: `Cannot rotate expired session: ${oldToken}`,
						statusCode: 400
					}
				};
			}
			const newSession = await this.createSessionWithOptions(
				{
					user_id: oldSession.user_id,
					expires,
					tenantId: oldSession.tenantId
				},
				{ invalidateOthers: false }
			);
			const graceExpiry = new Date(Date.now() + 5 * 60 * 1e3);
			await this.SessionModel.findByIdAndUpdate(oldToken, {
				expires: graceExpiry,
				// Add a flag to mark this as a rotated session for cleanup
				rotated: true,
				rotatedTo: newSession._id
			});
			logger.info(`Token rotated successfully - old: ${oldToken} (grace period until ${graceExpiry.toISOString()}), new: ${newSession._id}`);
			return {
				success: true,
				data: newSession._id
			};
		} catch (err) {
			const message = `Error in SessionAdapter.rotateToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'ROTATE_TOKEN_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}
	// Update the expiry of an existing session
	async updateSessionExpiry(session_id, newExpiry) {
		try {
			const session = await this.SessionModel.findByIdAndUpdate(session_id, { expires: newExpiry }, { new: true }).lean();
			if (!session) {
				return {
					success: false,
					message: `Session not found: ${session_id}`,
					error: {
						code: 'SESSION_NOT_FOUND',
						message: `Session not found: ${session_id}`,
						statusCode: 404
					}
				};
			}
			logger.debug('Session expiry updated', { session_id });
			return {
				success: true,
				data: this.formatSession(session)
			};
		} catch (err) {
			const message = `Error in SessionAdapter.updateSessionExpiry: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'UPDATE_SESSION_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}
	// Delete a session
	async deleteSession(session_id) {
		try {
			await this.SessionModel.findByIdAndDelete(session_id);
			logger.info(`Session deleted: ${session_id}`);
			return {
				success: true,
				data: void 0
			};
		} catch (err) {
			const message = `Error in SessionAdapter.deleteSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'DELETE_SESSION_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}
	// Delete expired sessions (enhanced to clean up rotated sessions)
	async deleteExpiredSessions() {
		try {
			const now = /* @__PURE__ */ new Date();
			const result = await this.SessionModel.deleteMany({ expires: { $lte: now.toISOString() } });
			logger.info('Expired sessions deleted', { deletedCount: result.deletedCount });
			return {
				success: true,
				data: result.deletedCount
			};
		} catch (err) {
			const message = `Error in SessionAdapter.deleteExpiredSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'DELETE_EXPIRED_SESSIONS_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}
	// Validate a session (optimized with MongoDB $lookup aggregation)
	async validateSession(session_id) {
		try {
			if (!session_id || typeof session_id !== 'string' || session_id.length < 32) {
				logger.warn('Invalid session ID format', { session_id });
				return { success: true, data: null };
			}
			const sessionExists = await this.SessionModel.findById(session_id).lean();
			logger.debug('Session lookup', {
				session_id,
				exists: !!sessionExists,
				expires: sessionExists?.expires,
				expired: sessionExists ? new Date(sessionExists.expires) <= /* @__PURE__ */ new Date() : null
			});
			const results = await this.SessionModel.aggregate([
				// Stage 1: Find the session by its ID (UUID string)
				{ $match: { _id: session_id } },
				// Stage 2: Check for expiration
				{ $match: { expires: { $gt: /* @__PURE__ */ new Date() } } },
				// Stage 3: "Join" with the auth_users collection (both using UUID strings)
				{
					$lookup: {
						from: 'auth_users',
						localField: 'user_id',
						// UUID string
						foreignField: '_id',
						// UUID string
						as: 'user'
					}
				},
				// Stage 4: Deconstruct the user array
				{ $unwind: { path: '$user', preserveNullAndEmptyArrays: false } },
				// Stage 5: Add rotation metadata to user object
				{
					$addFields: {
						'user._sessionRotated': '$rotated',
						'user._sessionRotatedTo': '$rotatedTo'
					}
				},
				// Stage 6: Make user the root document
				{ $replaceRoot: { newRoot: '$user' } }
			]);
			logger.debug('Aggregation results', {
				session_id,
				resultsCount: results.length,
				hasUser: results.length > 0 && !!results[0]
			});
			if (results.length > 0) {
				const user = results[0];
				if (user._sessionRotated && user._sessionRotatedTo) {
					logger.debug(`Session ${session_id} was rotated to ${user._sessionRotatedTo}, but still valid during grace period`);
				}
				delete user._sessionRotated;
				delete user._sessionRotatedTo;
				user._id = user._id.toString();
				if (user.permissions && Array.isArray(user.permissions)) {
					user.permissions = user.permissions.map((p) => String(p));
				}
				logger.debug('Session validated', { session_id });
				return { success: true, data: user };
			}
			await this.SessionModel.findByIdAndDelete(session_id);
			logger.warn('Session invalid or expired', { session_id });
			return { success: true, data: null };
		} catch (err) {
			const message = `Error in SessionAdapter.validateSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'VALIDATION_ERROR', message }
			};
		}
	}
	// Invalidate all sessions for a user (enhanced to handle rotated sessions)
	async invalidateAllUserSessions(user_id, tenantId) {
		try {
			const now = /* @__PURE__ */ new Date();
			const filter = {
				user_id,
				expires: { $gt: now.toISOString() },
				// Only delete active (non-expired) sessions
				$or: [
					{ rotated: { $ne: true } },
					// Delete non-rotated sessions
					{ rotated: true, expires: { $lte: new Date(now.getTime() + 6e4).toISOString() } }
					// Delete rotated sessions close to expiry
				]
			};
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const result = await this.SessionModel.deleteMany(filter);
			logger.debug(
				`InvalidateAllUserSessions: Attempted to delete sessions for user_id=${user_id} at ${now.toISOString()}. Deleted count: ${result.deletedCount}`
			);
			return { success: true, data: void 0 };
		} catch (err) {
			const message = `Error in SessionAdapter.invalidateAllUserSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'INVALIDATION_ERROR', message }
			};
		}
	}
	// Get active sessions for a user (enhanced to show rotation status)
	async getActiveSessions(user_id, tenantId) {
		try {
			const filter = {
				user_id,
				expires: { $gt: /* @__PURE__ */ new Date().toISOString() }
			};
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const sessions = await this.SessionModel.find(filter).lean();
			logger.debug('Active sessions retrieved for user', { user_id, count: sessions.length });
			return { success: true, data: sessions.map((session) => this.formatSession(session)) };
		} catch (err) {
			const message = `Error in SessionAdapter.getActiveSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'RETRIEVAL_ERROR', message }
			};
		}
	}
	// Get all active sessions for all users (for online users widget)
	async getAllActiveSessions(tenantId) {
		try {
			const query = {
				expires: { $gt: /* @__PURE__ */ new Date().toISOString() }
			};
			if (tenantId) {
				query.tenantId = tenantId;
			}
			const sessions = await this.SessionModel.find(query).lean();
			logger.debug('All active sessions retrieved', { count: sessions.length, tenantId });
			return { success: true, data: sessions.map((session) => this.formatSession(session)) };
		} catch (err) {
			const message = `Error in SessionAdapter.getAllActiveSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'RETRIEVAL_ERROR', message }
			};
		}
	}
	// Get session token metadata including expiration (enhanced to handle rotated sessions)
	async getSessionTokenData(session_id) {
		try {
			const session = await this.SessionModel.findById(session_id).lean();
			if (!session) {
				return { success: true, data: null };
			}
			if (new Date(session.expires) <= /* @__PURE__ */ new Date()) {
				await this.SessionModel.findByIdAndDelete(session_id);
				return { success: true, data: null };
			}
			return {
				success: true,
				data: {
					expiresAt: toISOString(session.expires),
					user_id: session.user_id
					// Include user_id as required by authDBInterface
				}
			};
		} catch (err) {
			const message = `Failed to get token data: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'TOKEN_DATA_ERROR', message }
			};
		}
	}
	// Clean up rotated sessions that have passed their grace period
	async cleanupRotatedSessions() {
		try {
			const now = /* @__PURE__ */ new Date();
			const result = await this.SessionModel.deleteMany({
				rotated: true,
				expires: { $lte: now.toISOString() }
			});
			if (result.deletedCount > 0) {
				logger.info(`Cleaned up ${result.deletedCount} rotated sessions past grace period`);
			}
			return { success: true, data: result.deletedCount };
		} catch (err) {
			const message = `Error in SessionAdapter.cleanupRotatedSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'CLEANUP_ERROR', message }
			};
		}
	}
	formatSession(session) {
		return {
			...session,
			_id: typeof session._id === 'string' ? session._id : session._id.toString(),
			expires: toISOString(session.expires)
			// Convert to ISODateString
		};
	}
}
class MongoAuthModelRegistrar {
	mongoose;
	/**
	 * Constructs the model registrar.
	 * @param {typeof Mongoose} mongooseInstance - The Mongoose instance to register models with.
	 */
	constructor(mongooseInstance) {
		this.mongoose = mongooseInstance;
		logger.info('MongoAuthModelRegistrar initialized.');
	}
	/**
	 * Registers authentication models (User, Token, Session).
	 * This process is idempotent; it will not re-register models that already exist.
	 * @throws {DatabaseError} If schemas cannot be imported or models fail to register.
	 */
	async setupAuthModels() {
		try {
			this._registerModel('auth_users', UserSchema);
			this._registerModel('auth_sessions', SessionSchema);
			this._registerModel('auth_tokens', TokenSchema);
			logger.info('Authentication models registered successfully.');
		} catch (error2) {
			throw createDatabaseError(error2, 'AUTH_MODEL_SETUP_FAILED', 'Failed to set up authentication models');
		}
	}
	/**
	 * A private helper that checks for a model's existence before registering it.
	 * @param {string} name - The name of the model.
	 * @param {Mongoose.Schema} schema - The Mongoose schema for the model.
	 */
	_registerModel(name, schema) {
		if (!this.mongoose.models[name]) {
			this.mongoose.model(name, schema);
			logger.debug(`Model '${name}' was registered`);
		} else {
			logger.debug(`Model '${name}' already exists and was not re-registered`);
		}
	}
}
class MongoCollectionMethods {
	// Internal registry of all dynamically created models
	models = /* @__PURE__ */ new Map();
	/**
	 * Gets a registered collection model by ID
	 * Cached with 600s TTL since schemas rarely change
	 */
	async getModel(id) {
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
	async createModel(schema) {
		const collectionId = schema._id;
		if (!collectionId) {
			throw new Error('Schema must have an _id field');
		}
		logger.debug(`Creating/updating collection model for: ${collectionId}`);
		await invalidateCollectionCache(`schema:collection:${collectionId}`);
		const modelName = `collection_${collectionId}`;
		if (this.models.has(collectionId)) {
			logger.debug(`Removing existing model ${collectionId} for refresh...`);
			this.models.delete(collectionId);
		}
		if (mongoose.models[modelName]) {
			logger.debug(`Deleting Mongoose model ${modelName} for refresh...`);
			delete mongoose.models[modelName];
		}
		const schemaDefinition = {
			_id: { type: String, required: true },
			status: { type: String, default: 'draft' },
			createdAt: { type: String, default: () => nowISODateString() },
			updatedAt: { type: String, default: () => nowISODateString() },
			createdBy: { type: Schema.Types.Mixed, ref: 'auth_users' },
			updatedBy: { type: Schema.Types.Mixed, ref: 'auth_users' }
		};
		if (schema.fields && Array.isArray(schema.fields)) {
			for (const field of schema.fields) {
				if (typeof field === 'object' && field !== null) {
					const fieldObj = field;
					const fieldKey =
						fieldObj.db_fieldName ||
						(fieldObj.label
							? String(fieldObj.label)
									.toLowerCase()
									.replace(/[^a-z0-9_]/g, '_')
							: null) ||
						fieldObj.Name;
					if (!fieldKey) continue;
					schemaDefinition[fieldKey] = {
						type: mongoose.Schema.Types.Mixed,
						required: fieldObj.required || false,
						unique: fieldObj.unique || false
					};
				}
			}
		}
		const mongooseSchema = new mongoose.Schema(schemaDefinition, {
			_id: false,
			// Disable auto ObjectId generation
			strict: schema.strict !== false,
			timestamps: false,
			// We handle timestamps explicitly with ISODateString
			collection: modelName.toLowerCase()
		});
		const model = mongoose.model(modelName, mongooseSchema);
		const wrappedModel = {
			findOne: async (query) => {
				const result = await model.findOne(query).lean().exec();
				return result;
			},
			aggregate: async (pipeline) => {
				return await model.aggregate(pipeline).exec();
			}
		};
		this.models.set(collectionId, { model, wrapped: wrappedModel });
		logger.info(`Collection model created: ${collectionId} (${modelName})`);
		await this.createIndexes(model, schema);
	}
	/**
	 * Updates an existing collection model
	 */
	async updateModel(schema) {
		if (schema._id) {
			await invalidateCollectionCache(`schema:collection:${schema._id}`);
		}
		await this.createModel(schema);
	}
	/**
	 * Deletes a collection model
	 */
	async deleteModel(id) {
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
	async collectionExists(collectionName) {
		try {
			const collections =
				(await mongoose.connection.db
					?.listCollections({
						name: collectionName.toLowerCase()
					})
					.toArray()) ?? [];
			return collections.length > 0;
		} catch (error2) {
			logger.error(`Error checking collection existence: ${error2}`);
			return false;
		}
	}
	/**
	 * Gets the internal Mongoose model (for CRUD operations)
	 */
	getMongooseModel(id) {
		const entry = this.models.get(id);
		return entry ? entry.model : null;
	}
	/**
	 * Gets all registered model IDs
	 */
	getRegisteredModelIds() {
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
	async createIndexes(model, schema) {
		try {
			const collectionId = schema._id;
			logger.debug(`Creating indexes for collection: ${collectionId}`);
			const indexes = [
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
			if (schema.fields && Array.isArray(schema.fields)) {
				for (const field of schema.fields) {
					if (typeof field === 'object' && field !== null) {
						const fieldObj = field;
						const fieldKey =
							fieldObj.db_fieldName ||
							(fieldObj.label
								? String(fieldObj.label)
										.toLowerCase()
										.replace(/[^a-z0-9_]/g, '_')
								: null) ||
							fieldObj.Name;
						if (!fieldKey) continue;
						if (fieldObj.unique) {
							indexes.push({
								fields: { [fieldKey]: 1 },
								options: { unique: true, sparse: true }
							});
						}
						if (fieldObj.indexed || fieldObj.searchable || fieldObj.sortable) {
							indexes.push({ fields: { [fieldKey]: 1 } });
						}
						if (fieldObj.searchable && (fieldObj.type === 'text' || fieldObj.type === 'textarea')) {
							indexes.push({
								fields: { [fieldKey]: 'text' },
								options: { default_language: 'english' }
							});
						}
					}
				}
			}
			const collection = model.collection;
			for (const index of indexes) {
				try {
					await collection.createIndex(index.fields, index.options || {});
					logger.trace(`Created index on ${Object.keys(index.fields).join(', ')} for ${collectionId}`);
				} catch (error2) {
					if (error2.message.includes('already exists')) {
						continue;
					}
					logger.warn(`Failed to create index for ${collectionId}: ${error2}`);
				}
			}
			logger.info(`Indexes created for collection: ${collectionId}`);
		} catch (error2) {
			logger.error(`Error creating indexes: ${error2}`);
		}
	}
}
class MongoCrudMethods {
	model;
	constructor(model) {
		this.model = model;
	}
	async findOne(query, options = {}) {
		try {
			const result = await this.model.findOne(query, options.fields?.join(' ')).lean().exec();
			if (!result) return null;
			return processDates(result);
		} catch (error2) {
			throw createDatabaseError(error2, 'FIND_ONE_ERROR', `Failed to find document in ${this.model.modelName}`);
		}
	}
	async findById(id) {
		try {
			const result = await this.model.findById(id).lean().exec();
			if (!result) return null;
			return processDates(result);
		} catch (error2) {
			throw createDatabaseError(error2, 'FIND_BY_ID_ERROR', `Failed to find document by ID in ${this.model.modelName}`);
		}
	}
	async findByIds(ids) {
		try {
			const results = await this.model
				.find({ _id: { $in: ids } })
				.lean()
				.exec();
			return processDates(results);
		} catch (error2) {
			throw createDatabaseError(error2, 'FIND_BY_IDS_ERROR', `Failed to find documents by IDs in ${this.model.modelName}`);
		}
	}
	async findMany(query, options = {}) {
		try {
			const results = await this.model
				.find(query, options.fields?.join(' '))
				.sort(options.sort || {})
				.skip(options.skip ?? 0)
				.limit(options.limit ?? 0)
				.lean()
				.exec();
			return processDates(results);
		} catch (error2) {
			throw createDatabaseError(error2, 'FIND_MANY_ERROR', `Failed to find documents in ${this.model.modelName}`);
		}
	}
	async insert(data) {
		try {
			const doc = {
				...data,
				_id: generateId(),
				createdAt: nowISODateString(),
				updatedAt: nowISODateString()
			};
			return (await this.model.create(doc)).toObject();
		} catch (error2) {
			if (error2 instanceof mongo.MongoServerError && error2.code === 11e3) {
				throw createDatabaseError(error2, 'DUPLICATE_KEY_ERROR', 'A document with the same unique key already exists.');
			}
			throw createDatabaseError(error2, 'INSERT_ERROR', `Failed to insert document into ${this.model.modelName}`);
		}
	}
	async insertMany(data) {
		try {
			const docs = data.map((d) => ({
				...d,
				_id: generateId(),
				createdAt: nowISODateString(),
				updatedAt: nowISODateString()
			}));
			const result = await this.model.insertMany(docs);
			return result.map((doc) => doc.toObject());
		} catch (error2) {
			throw createDatabaseError(error2, 'INSERT_MANY_ERROR', `Failed to insert many documents into ${this.model.modelName}`);
		}
	}
	async update(id, data) {
		try {
			const updateData = {
				...data,
				updatedAt: nowISODateString()
			};
			const result = await this.model.findByIdAndUpdate(id, { $set: updateData }, { new: true }).lean().exec();
			if (!result) return null;
			return processDates(result);
		} catch (error2) {
			throw createDatabaseError(error2, 'UPDATE_ERROR', `Failed to update document ${id} in ${this.model.modelName}`);
		}
	}
	async upsert(query, data) {
		try {
			const result = await this.model
				.findOneAndUpdate(
					query,
					{
						$set: { ...data, updatedAt: nowISODateString() },
						$setOnInsert: { _id: generateId(), createdAt: nowISODateString() }
					},
					{ new: true, upsert: true, runValidators: true }
				)
				.lean()
				.exec();
			return processDates(result);
		} catch (error2) {
			throw createDatabaseError(error2, 'UPSERT_ERROR', `Failed to upsert document in ${this.model.modelName}`);
		}
	}
	async delete(id) {
		try {
			const result = await this.model.deleteOne({ _id: id });
			return result.deletedCount > 0;
		} catch (error2) {
			throw createDatabaseError(error2, 'DELETE_ERROR', `Failed to delete document ${id} from ${this.model.modelName}`);
		}
	}
	async updateMany(query, data) {
		try {
			const updateData = {
				...data,
				updatedAt: nowISODateString()
			};
			const result = await this.model.updateMany(query, { $set: updateData });
			return {
				modifiedCount: result.modifiedCount,
				matchedCount: result.matchedCount
			};
		} catch (error2) {
			throw createDatabaseError(error2, 'UPDATE_MANY_ERROR', `Failed to update multiple documents in ${this.model.modelName}`);
		}
	}
	async deleteMany(query) {
		try {
			const result = await this.model.deleteMany(query);
			return { deletedCount: result.deletedCount };
		} catch (error2) {
			throw createDatabaseError(error2, 'DELETE_MANY_ERROR', `Failed to delete documents from ${this.model.modelName}`);
		}
	}
	async upsertMany(items) {
		try {
			if (items.length === 0) return { upsertedCount: 0, modifiedCount: 0 };
			const now = nowISODateString();
			const operations = items.map((item) => ({
				updateOne: {
					filter: item.query,
					update: {
						$set: { ...item.data, updatedAt: now },
						$setOnInsert: { _id: generateId(), createdAt: now }
					},
					upsert: true
				}
			}));
			const result = await this.model.bulkWrite(operations);
			return {
				upsertedCount: result.upsertedCount,
				modifiedCount: result.modifiedCount
			};
		} catch (error2) {
			throw createDatabaseError(error2, 'UPSERT_MANY_ERROR', `Failed to upsert documents in ${this.model.modelName}`);
		}
	}
	async count(query = {}) {
		try {
			return await this.model.countDocuments(query);
		} catch (error2) {
			throw createDatabaseError(error2, 'COUNT_ERROR', `Failed to count documents in ${this.model.modelName}`);
		}
	}
	/**
	 * Checks if a document exists matching the given query.
	 * Uses findOne with _id projection instead of exists() for faster execution.
	 * MongoDB stops scanning as soon as it finds the first match, and projection reduces network overhead.
	 */
	async exists(query) {
		try {
			const doc = await this.model.findOne(query, { _id: 1 }).lean().exec();
			return !!doc;
		} catch (error2) {
			throw createDatabaseError(error2, 'EXISTS_ERROR', `Failed to check for document existence in ${this.model.modelName}`);
		}
	}
	async aggregate(pipeline) {
		try {
			return await this.model.aggregate(pipeline).exec();
		} catch (error2) {
			throw createDatabaseError(error2, 'AGGREGATION_ERROR', `Aggregation failed in ${this.model.modelName}`);
		}
	}
}
function isObjectId(value) {
	if (!value || typeof value !== 'object') return false;
	return typeof value.toHexString === 'function';
}
function normalizeId(id) {
	if (id === null || id === void 0) {
		return null;
	}
	if (typeof id === 'string') {
		return id;
	}
	if (isObjectId(id)) {
		return id.toHexString();
	}
	if (typeof id === 'number' || typeof id === 'bigint' || typeof id === 'boolean') {
		return String(id);
	}
	if (typeof id === 'object') {
		const candidate = id;
		if (candidate._id !== void 0) {
			const nested = normalizeId(candidate._id);
			if (nested) {
				return nested;
			}
		}
		if (candidate.id !== void 0) {
			const nested = normalizeId(candidate.id);
			if (nested) {
				return nested;
			}
		}
		if (typeof candidate.valueOf === 'function') {
			const value = candidate.valueOf();
			if (value && value !== id) {
				const nested = normalizeId(value);
				if (nested) {
					return nested;
				}
			}
		}
		if (typeof candidate.toString === 'function') {
			const asString = candidate.toString();
			if (asString && asString !== '[object Object]') {
				return asString;
			}
		}
	}
	const fallback = String(id);
	return fallback === '[object Object]' ? null : fallback;
}
function buildTree(nodes) {
	const nodeMap = /* @__PURE__ */ new Map();
	const roots = [];
	for (const node of nodes) {
		const nodeId = typeof node._id === 'string' ? node._id : String(node._id);
		nodeMap.set(nodeId, { ...node, children: [] });
	}
	for (const node of nodeMap.values()) {
		if (node.parentId) {
			const parentId = typeof node.parentId === 'string' ? node.parentId : String(node.parentId);
			const parent = nodeMap.get(parentId);
			if (parent) {
				parent.children.push(node);
			} else {
				logger.warn(`[buildTree] Parent ${parentId} not found for node ${node._id}, treating as root`);
				roots.push(node);
			}
		} else {
			roots.push(node);
		}
	}
	logger.trace(`[buildTree] Built tree with ${roots.length} root nodes from ${nodes.length} total nodes`);
	return roots;
}
class MongoContentMethods {
	// Repositories are injected for testability and code reuse
	nodesRepo;
	draftsRepo;
	revisionsRepo;
	/**
	 * Creates an instance of MongoContentMethods.
	 * @param nodesRepo A repository for ContentNode operations.
	 * @param draftsRepo A repository for ContentDraft operations.
	 * @param revisionsRepo A repository for ContentRevision operations.
	 */
	constructor(nodesRepo, draftsRepo, revisionsRepo) {
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
	async getStructure(mode = 'flat', filter = {}, bypassCache = false) {
		const filterKey = JSON.stringify(filter);
		const cacheKey = `content:structure:${mode}:${filterKey}`;
		const fetchData = async () => {
			const nodes = await this.nodesRepo.findMany(filter);
			if (mode === 'flat') {
				return nodes;
			}
			return buildTree(nodes);
		};
		if (bypassCache) {
			return fetchData();
		}
		return withCache(cacheKey, fetchData, { category: CacheCategory.CONTENT });
	}
	// Atomically creates a new node or updates an existing one based on its path.
	async upsertNodeByPath(nodeData) {
		try {
			const { path, parentId } = nodeData;
			const normalizedParentId = normalizeId(parentId);
			const result = await this.nodesRepo.model
				.findOneAndUpdate(
					{ path },
					{
						$set: { ...nodeData, parentId: normalizedParentId, updatedAt: /* @__PURE__ */ new Date() },
						$setOnInsert: { _id: generateId(), createdAt: /* @__PURE__ */ new Date() }
					},
					{ new: true, upsert: true, runValidators: true }
				)
				.lean()
				.exec();
			await invalidateCategoryCache(CacheCategory.CONTENT);
			return result;
		} catch (error2) {
			throw createDatabaseError(error2, 'NODE_UPSERT_ERROR', 'Failed to upsert content structure node.');
		}
	}
	/**
	 * Updates multiple nodes in a single, efficient bulk operation.
	 * Uses upsert to create nodes if they don't exist.
	 * IMPORTANT: For collections, the _id from compiled files is used as the document _id
	 * to ensure navigation and caching work correctly.
	 */
	async bulkUpdateNodes(updates) {
		if (updates.length === 0) return { modifiedCount: 0 };
		try {
			logger.trace(`[bulkUpdateNodes] Processing ${updates.length} updates`);
			const operations = updates.map(({ path, changes }) => {
				const { _id, createdAt, ...safeChanges } = changes;
				const normalizedChanges = { ...safeChanges };
				if ('parentId' in normalizedChanges) {
					const originalParentId = normalizedChanges.parentId;
					const normalizedParentId = normalizeId(originalParentId);
					if (normalizedParentId === null) {
						if (originalParentId !== null && originalParentId !== void 0) {
							logger.warn(`[bulkUpdateNodes] Unable to safely normalize parentId for path="${path}". Falling back to null value.`, {
								parentId: originalParentId
							});
						}
						normalizedChanges.parentId = null;
					} else {
						normalizedChanges.parentId = normalizedParentId;
					}
				}
				const setOnInsert = { createdAt: /* @__PURE__ */ new Date() };
				if (_id) {
					setOnInsert._id = _id;
				}
				return {
					updateOne: {
						filter: { path },
						update: {
							$set: { ...normalizedChanges, updatedAt: /* @__PURE__ */ new Date() },
							$setOnInsert: setOnInsert
						},
						upsert: true
						// Create the document if it doesn't exist
					}
				};
			});
			logger.trace(`[bulkUpdateNodes] Executing bulkWrite with ${operations.length} operations`);
			const result = await this.nodesRepo.model.bulkWrite(operations);
			logger.info(
				`[bulkUpdateNodes] Result: modified=${result.modifiedCount}, upserted=${result.upsertedCount}, total=${result.modifiedCount + result.upsertedCount}`
			);
			await invalidateCategoryCache(CacheCategory.CONTENT);
			return { modifiedCount: result.modifiedCount + result.upsertedCount };
		} catch (error2) {
			throw createDatabaseError(error2, 'NODE_BULK_UPDATE_ERROR', 'Failed to perform bulk update on nodes.');
		}
	}
	// Persists a full or partial content structure reorder using the efficient Model method.
	async reorderStructure(items) {
		try {
			const result = await this.nodesRepo.model.reorderStructure(items);
			if (!result.success) {
				throw result.error || new Error(result.message);
			}
			await invalidateCategoryCache(CacheCategory.CONTENT);
		} catch (error2) {
			throw createDatabaseError(error2, 'NODE_REORDER_ERROR', 'Failed to reorder content structure.');
		}
	}
	/**
	 * Fixes content nodes that have mismatched _id values.
	 * This can happen when nodes were created before _id was properly set from compiled files.
	 * For each node where the expected _id differs from the actual _id, delete and recreate.
	 */
	async fixMismatchedNodeIds(expectedNodes) {
		if (expectedNodes.length === 0) return { fixed: 0 };
		try {
			let fixedCount = 0;
			for (const { path, expectedId, changes } of expectedNodes) {
				const existing = await this.nodesRepo.model.findOne({ path });
				if (existing) {
					const existingId = normalizeId(existing._id);
					if (existingId !== expectedId) {
						logger.info(`[fixMismatchedNodeIds] Fixing node at path="${path}": ${existingId} → ${expectedId}`);
						await this.nodesRepo.model.deleteOne({ path });
						await this.nodesRepo.model.insertOne({
							_id: expectedId,
							...changes,
							createdAt: existing.createdAt || /* @__PURE__ */ new Date(),
							updatedAt: /* @__PURE__ */ new Date()
						});
						fixedCount++;
					}
				}
			}
			if (fixedCount > 0) {
				await invalidateCategoryCache(CacheCategory.CONTENT);
				logger.info(`[fixMismatchedNodeIds] Fixed ${fixedCount} nodes with mismatched IDs`);
			}
			return { fixed: fixedCount };
		} catch (error2) {
			throw createDatabaseError(error2, 'NODE_FIX_IDS_ERROR', 'Failed to fix mismatched node IDs.');
		}
	}
	// ============================================================
	// Draft Methods
	// ============================================================
	async createDraft(draft) {
		return this.draftsRepo.insert(draft);
	}
	async getDraftsForContent(contentId, options) {
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
		} catch (error2) {
			throw createDatabaseError(error2, 'DRAFT_FETCH_ERROR', 'Failed to fetch drafts for content.');
		}
	}
	// Publishes multiple drafts in a single batch operation.
	async publishManyDrafts(draftIds) {
		if (draftIds.length === 0) return { modifiedCount: 0 };
		try {
			const result = await this.draftsRepo.model.updateMany(
				{ _id: { $in: draftIds } },
				{ $set: { status: 'published', publishedAt: /* @__PURE__ */ new Date() } }
			);
			return { modifiedCount: result.modifiedCount };
		} catch (error2) {
			throw createDatabaseError(error2, 'DRAFT_BULK_PUBLISH_ERROR', 'Failed to publish drafts.');
		}
	}
	// ============================================================
	// Revision Methods
	// ============================================================
	async createRevision(revision) {
		return this.revisionsRepo.insert(revision);
	}
	async getRevisionHistory(contentId, options) {
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
		} catch (error2) {
			throw createDatabaseError(error2, 'REVISION_FETCH_ERROR', 'Failed to fetch revision history.');
		}
	}
	// Deletes old revisions for a piece of content, keeping only the specified number of recent ones.
	async cleanupRevisions(contentId, keepLatest) {
		try {
			const revisionsToKeep = await this.revisionsRepo.model
				.find({ contentId })
				.sort({ createdAt: -1 })
				.limit(keepLatest)
				.select('_id')
				.lean()
				.exec();
			const keepIds = revisionsToKeep.map((r) => r._id.toString());
			return this.revisionsRepo.deleteMany({
				contentId,
				_id: { $nin: keepIds }
			});
		} catch (error2) {
			throw createDatabaseError(error2, 'REVISION_CLEANUP_ERROR', 'Failed to cleanup old revisions.');
		}
	}
}
class MongoMediaMethods {
	mediaModel;
	/**
	 * Constructs the MongoMediaMethods instance.
	 * @param {MediaModelType} mediaModel - The Mongoose model for the 'media' collection.
	 */
	constructor(mediaModel) {
		this.mediaModel = mediaModel;
		logger.debug('MongoMediaMethods initialized with media model.');
	}
	/**
	 * Idempotently registers the required Mongoose models.
	 * This should be called once during application startup.
	 * @param {typeof Mongoose} mongooseInstance - The active Mongoose instance.
	 */
	static registerModels(mongooseInstance) {
		if (!mongooseInstance.models['media']) {
			mongooseInstance.model('media', mediaSchema);
			logger.debug("Model 'media' was registered.");
		}
	}
	// ============================================================
	// File Operations
	// ============================================================
	/// Uploads multiple media files in a single, efficient batch operation
	async uploadMany(files) {
		try {
			const result = await this.mediaModel.insertMany(files);
			await invalidateCategoryCache(CacheCategory.MEDIA);
			return result.map((doc) => doc.toObject());
		} catch (error2) {
			throw createDatabaseError(error2, 'MEDIA_UPLOAD_MANY_ERROR', 'Failed to upload media files');
		}
	}
	// Deletes multiple media files in a single batch operation
	async deleteMany(fileIds) {
		try {
			if (fileIds.length === 0) {
				return { deletedCount: 0 };
			}
			const result = await this.mediaModel.deleteMany({ _id: { $in: fileIds } });
			await invalidateCategoryCache(CacheCategory.MEDIA);
			return { deletedCount: result.deletedCount };
		} catch (error2) {
			throw createDatabaseError(error2, 'MEDIA_DELETE_MANY_ERROR', 'Failed to delete media files');
		}
	}
	// Updates metadata for a single file
	async updateMetadata(fileId, metadata) {
		try {
			const updateData = Object.entries(metadata).reduce((acc, [key, value]) => {
				acc[`metadata.${key}`] = value;
				return acc;
			}, {});
			updateData.updatedAt = /* @__PURE__ */ new Date();
			const result = await this.mediaModel.findByIdAndUpdate(fileId, { $set: updateData }, { new: true }).lean().exec();
			await invalidateCategoryCache(CacheCategory.MEDIA);
			return result;
		} catch (error2) {
			throw createDatabaseError(error2, 'UPDATE_METADATA_ERROR', 'Failed to update metadata');
		}
	}
	// Moves multiple files to a different folder
	async move(fileIds, targetFolderId) {
		try {
			const result = await this.mediaModel.updateMany(
				{ _id: { $in: fileIds } },
				{ $set: { folderId: targetFolderId, updatedAt: /* @__PURE__ */ new Date() } }
			);
			await invalidateCategoryCache(CacheCategory.MEDIA);
			return { movedCount: result.modifiedCount };
		} catch (error2) {
			throw createDatabaseError(error2, 'MEDIA_MOVE_ERROR', 'Failed to move files');
		}
	}
	// Retrieves a paginated list of media files, optionally filtered by folder
	async getFiles(folderId, options = {}) {
		const { page = 1, pageSize = 25, sortField = 'createdAt', sortDirection = 'desc' } = options;
		const cacheKey = `media:files:${folderId || 'root'}:${page}:${pageSize}:${sortField}:${sortDirection}`;
		return withCache(
			cacheKey,
			async () => {
				try {
					const query = folderId ? { folderId } : { folderId: { $in: [null, void 0] } };
					const skip = (page - 1) * pageSize;
					const sort = { [sortField]: sortDirection === 'asc' ? 1 : -1 };
					const [items, total] = await Promise.all([
						this.mediaModel.find(query).sort(sort).skip(skip).limit(pageSize).lean().exec(),
						this.mediaModel.countDocuments(query)
					]);
					return {
						items,
						total,
						page,
						pageSize,
						hasNextPage: page * pageSize < total,
						hasPreviousPage: page > 1
					};
				} catch (error2) {
					throw createDatabaseError(error2, 'GET_FILES_ERROR', 'Failed to fetch media files');
				}
			},
			{ category: CacheCategory.MEDIA }
		);
	}
}
class MongoSystemMethods {
	SystemPreferencesModel;
	SystemSettingModel;
	/**
	 * Constructs the MongoSystemMethods instance with injected models.
	 * @param {SystemPreferencesModelType} systemPreferencesModel - The Mongoose model for system preferences.
	 * @param {SystemSettingModelType} systemSettingModel - The Mongoose model for system settings.
	 */
	constructor(systemPreferencesModel, systemSettingModel) {
		this.SystemPreferencesModel = systemPreferencesModel;
		this.SystemSettingModel = systemSettingModel;
		logger.trace('MongoSystemMethods initialized with models.');
	}
	// ============================================================
	// Generic Preference Methods (Database-Agnostic Interface)
	// ============================================================
	/**
	 * Gets a single preference value by key.
	 * Returns null if not found, throws an error on database failure.
	 */
	async get(key, scope = 'system', userId) {
		try {
			if (scope === 'system') {
				const setting = await this.SystemSettingModel.findOne({ key }).lean();
				return setting ? setting.value : null;
			}
			if (!userId) {
				throw new Error('User ID is required for user-scoped preferences.');
			}
			const userPrefs = await this.SystemPreferencesModel.findOne(
				{ userId: userId.toString() },
				{ [`preferences.${key}`]: 1 }
				// Projection
			).lean();
			return userPrefs?.preferences?.[key] ?? null;
		} catch (error2) {
			throw createDatabaseError(error2, 'PREFERENCE_GET_ERROR', `Failed to get preference '${key}'`);
		}
	}
	// Sets a single preference value by key
	async set(key, value, scope = 'system', userId, category) {
		try {
			if (scope === 'system') {
				const updateData = { value, updatedAt: /* @__PURE__ */ new Date() };
				if (category) {
					updateData.category = category;
				}
				await this.SystemSettingModel.updateOne({ key }, { $set: updateData }, { upsert: true });
				return;
			}
			if (!userId) {
				throw new Error('User ID is required for user-scoped preferences.');
			}
			await this.SystemPreferencesModel.updateOne(
				{ userId: userId.toString() },
				{ $set: { [`preferences.${key}`]: value }, updatedAt: /* @__PURE__ */ new Date() },
				{ upsert: true }
			);
		} catch (error2) {
			throw createDatabaseError(error2, 'PREFERENCE_SET_ERROR', `Failed to set preference '${key}'`);
		}
	}
	// Deletes a single preference by key
	async delete(key, scope = 'system', userId) {
		try {
			if (scope === 'system') {
				const result2 = await this.SystemSettingModel.deleteOne({ key });
				if (result2.deletedCount === 0) {
					logger.warn(`System setting '${key}' not found for deletion.`);
				}
				return;
			}
			if (!userId) {
				throw new Error('User ID is required for user-scoped preferences.');
			}
			const result = await this.SystemPreferencesModel.updateOne({ userId: userId.toString() }, { $unset: { [`preferences.${key}`]: '' } });
			if (result.modifiedCount === 0) {
				logger.warn(`User preference '${key}' not found for user '${userId}' during deletion.`);
			}
		} catch (error2) {
			throw createDatabaseError(error2, 'PREFERENCE_DELETE_ERROR', `Failed to delete preference '${key}'`);
		}
	}
	/**
	 * Gets multiple preference values in a single database call using $in operator.
	 * 10x faster than sequential gets - one DB round-trip instead of N.
	 */
	async getMany(keys, scope = 'system', userId) {
		try {
			if (keys.length === 0) return {};
			if (scope === 'system') {
				logger.trace(`Querying for ${keys.length} keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
				const settings = await this.SystemSettingModel.find({ key: { $in: keys } }).lean();
				logger.trace(`Found ${settings.length} settings`);
				if (settings.length > 0) {
					logger.trace(
						`Sample: ${settings
							.slice(0, 3)
							.map((s) => `${s.key}=${JSON.stringify(s.value)}`)
							.join(', ')}`
					);
				}
				return settings.reduce((acc, setting) => {
					acc[setting.key] = setting.value;
					return acc;
				}, {});
			}
			if (!userId) {
				throw new Error('User ID is required for user-scoped preferences.');
			}
			const projection = keys.reduce((acc, key) => {
				acc[`preferences.${key}`] = 1;
				return acc;
			}, {});
			const userPrefs = await this.SystemPreferencesModel.findOne({ userId: userId.toString() }, projection).lean();
			if (!userPrefs?.preferences) return {};
			return keys.reduce((acc, key) => {
				if (key in userPrefs.preferences) {
					acc[key] = userPrefs.preferences[key];
				}
				return acc;
			}, {});
		} catch (error2) {
			throw createDatabaseError(error2, 'PREFERENCE_GET_MANY_ERROR', 'Failed to get multiple preferences');
		}
	}
	/**
	 * Sets multiple preference values in a single database call using bulkWrite.
	 * 33x faster than sequential sets - one DB round-trip instead of N.
	 */
	async setMany(preferences) {
		try {
			if (preferences.length === 0) return;
			const systemPrefs = preferences.filter((p) => (p.scope || 'system') === 'system');
			const userPrefs = preferences.filter((p) => p.scope === 'user');
			if (systemPrefs.length > 0) {
				const operations = systemPrefs.map((pref) => {
					const updateData = { value: pref.value, updatedAt: /* @__PURE__ */ new Date() };
					if (pref.category) {
						updateData.category = pref.category;
					}
					return {
						updateOne: {
							filter: { key: pref.key },
							update: { $set: updateData },
							upsert: true
						}
					};
				});
				await this.SystemSettingModel.bulkWrite(operations);
			}
			if (userPrefs.length > 0) {
				const prefsByUser = userPrefs.reduce((acc, pref) => {
					if (!pref.userId) {
						throw new Error('User ID is required for user-scoped preferences.');
					}
					const userIdStr = pref.userId.toString();
					if (!acc[userIdStr]) acc[userIdStr] = [];
					acc[userIdStr].push(pref);
					return acc;
				}, {});
				const operations = Object.entries(prefsByUser).map(([userIdStr, prefs]) => {
					const setFields = prefs.reduce(
						(acc, pref) => {
							acc[`preferences.${pref.key}`] = pref.value;
							return acc;
						},
						{ updatedAt: /* @__PURE__ */ new Date() }
					);
					return {
						updateOne: {
							filter: { userId: userIdStr },
							update: { $set: setFields },
							upsert: true
						}
					};
				});
				await this.SystemPreferencesModel.bulkWrite(operations);
			}
		} catch (error2) {
			throw createDatabaseError(error2, 'PREFERENCE_SET_MANY_ERROR', 'Failed to set multiple preferences');
		}
	}
	/**
	 * Deletes multiple preference keys in a single database call using bulkWrite.
	 * 33x faster than sequential deletes - one DB round-trip instead of N.
	 */
	async deleteMany(keys, scope = 'system', userId) {
		try {
			if (keys.length === 0) return;
			if (scope === 'system') {
				await this.SystemSettingModel.deleteMany({ key: { $in: keys } });
				return;
			}
			if (!userId) {
				throw new Error('User ID is required for user-scoped preferences.');
			}
			const unsetFields = keys.reduce((acc, key) => {
				acc[`preferences.${key}`] = '';
				return acc;
			}, {});
			await this.SystemPreferencesModel.updateOne({ userId: userId.toString() }, { $unset: unsetFields });
		} catch (error2) {
			throw createDatabaseError(error2, 'PREFERENCE_DELETE_MANY_ERROR', 'Failed to delete multiple preferences');
		}
	}
	// Clears all preferences within a given scope
	async clear(scope = 'system', userId) {
		try {
			if (scope === 'system') {
				await this.SystemSettingModel.deleteMany({});
				return;
			}
			if (userId) {
				await this.SystemPreferencesModel.deleteMany({ userId: userId.toString() });
			} else {
				await this.SystemPreferencesModel.deleteMany({});
			}
		} catch (error2) {
			throw createDatabaseError(error2, 'PREFERENCES_CLEAR_ERROR', `Failed to clear ${scope} preferences`);
		}
	}
}
class MongoSystemVirtualFolderMethods {
	async create(folder) {
		try {
			const _id = generateId();
			const newFolder = new SystemVirtualFolderModel({
				...folder,
				_id
			});
			const savedFolder = await newFolder.save();
			return { success: true, data: savedFolder.toObject() };
		} catch (error2) {
			return {
				success: false,
				error: createDatabaseError(error2, 'VIRTUAL_FOLDER_CREATE_ERROR', 'Failed to create virtual folder'),
				message: 'Failed to create virtual folder'
			};
		}
	}
	async getById(folderId) {
		try {
			const folder = await SystemVirtualFolderModel.findById(folderId).lean().exec();
			return { success: true, data: folder };
		} catch (error2) {
			return {
				success: false,
				error: createDatabaseError(error2, 'VIRTUAL_FOLDER_GET_ERROR', 'Failed to get virtual folder by ID'),
				message: 'Failed to get virtual folder by ID'
			};
		}
	}
	async getByParentId(parentId) {
		try {
			const folders = await SystemVirtualFolderModel.find({ parentId: parentId ?? null })
				.lean()
				.exec();
			return { success: true, data: folders };
		} catch (error2) {
			return {
				success: false,
				error: createDatabaseError(error2, 'VIRTUAL_FOLDER_GET_ERROR', 'Failed to get virtual folders by parent ID'),
				message: 'Failed to get virtual folders by parent ID'
			};
		}
	}
	async getAll() {
		try {
			const folders = await SystemVirtualFolderModel.find({}).lean().exec();
			return { success: true, data: folders };
		} catch (error2) {
			return {
				success: false,
				error: createDatabaseError(error2, 'VIRTUAL_FOLDER_GET_ERROR', 'Failed to get all virtual folders'),
				message: 'Failed to get all virtual folders'
			};
		}
	}
	async update(folderId, updateData) {
		try {
			const updatedFolder = await SystemVirtualFolderModel.findByIdAndUpdate(folderId, updateData, { new: true }).lean().exec();
			if (!updatedFolder) {
				return { success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' }, message: 'Folder not found' };
			}
			return { success: true, data: updatedFolder };
		} catch (error2) {
			return {
				success: false,
				error: createDatabaseError(error2, 'VIRTUAL_FOLDER_UPDATE_ERROR', 'Failed to update virtual folder'),
				message: 'Failed to update virtual folder'
			};
		}
	}
	async addToFolder(contentId, folderPath) {
		try {
			const folder = await SystemVirtualFolderModel.findOne({ path: folderPath }).lean().exec();
			if (!folder) {
				return { success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' }, message: 'Folder not found' };
			}
			await MediaModel.findByIdAndUpdate(contentId, { folderId: folder._id });
			return { success: true, data: void 0 };
		} catch (error2) {
			return {
				success: false,
				error: createDatabaseError(error2, 'VIRTUAL_FOLDER_ADD_ERROR', 'Failed to add content to virtual folder'),
				message: 'Failed to add content to virtual folder'
			};
		}
	}
	/**
	 * Gets the contents of a virtual folder (subfolders and files).
	 * Uses Promise.all to fetch subfolders and files in parallel (2x faster).
	 */
	async getContents(folderPath) {
		try {
			const folder = await SystemVirtualFolderModel.findOne({ path: folderPath }).lean().exec();
			const [subfolders, files] = await Promise.all([
				SystemVirtualFolderModel.find({ parentId: folder?._id }).lean().exec(),
				MediaModel.find({ folderId: folder?._id }).lean().exec()
			]);
			return { success: true, data: { folders: subfolders, files } };
		} catch (error2) {
			return {
				success: false,
				error: createDatabaseError(error2, 'VIRTUAL_FOLDER_CONTENTS_ERROR', 'Failed to get virtual folder contents'),
				message: 'Failed to get virtual folder contents'
			};
		}
	}
	async delete(folderId) {
		try {
			await SystemVirtualFolderModel.findByIdAndDelete(folderId).exec();
			return { success: true, data: void 0 };
		} catch (error2) {
			return {
				success: false,
				error: createDatabaseError(error2, 'VIRTUAL_FOLDER_DELETE_ERROR', 'Failed to delete virtual folder'),
				message: 'Failed to delete virtual folder'
			};
		}
	}
	/**
	 * Checks if a virtual folder exists at the given path.
	 * Uses findOne with projection instead of countDocuments for faster execution.
	 */
	async exists(path) {
		try {
			const doc = await SystemVirtualFolderModel.findOne({ path }, { _id: 1 }).lean().exec();
			return { success: true, data: !!doc };
		} catch (error2) {
			return {
				success: false,
				error: createDatabaseError(error2, 'VIRTUAL_FOLDER_EXISTS_ERROR', 'Failed to check if virtual folder exists'),
				message: 'Failed to check if virtual folder exists'
			};
		}
	}
}
class MongoThemeMethods {
	themeModel;
	/**
	 * Constructs the MongoThemeMethods instance.
	 * @param {ThemeModelType} themeModel - The Mongoose model for themes.
	 */
	constructor(themeModel) {
		this.themeModel = themeModel;
		logger.trace('MongoThemeMethods initialized.');
	}
	/**
	 * Retrieves the currently active theme.
	 * Cached with 300s TTL since active theme is accessed on every page load
	 * @returns {Promise<Theme | null>} The active theme object or null if none is active.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async getActive() {
		return withCache(
			'theme:active',
			async () => {
				try {
					return await this.themeModel.findOne({ isActive: true }).lean().exec();
				} catch (error2) {
					throw createDatabaseError(error2, 'THEME_FETCH_FAILED', 'Failed to get active theme');
				}
			},
			{ category: CacheCategory.THEME }
		);
	}
	/**
	 * Retrieves the default theme.
	 * Cached with 300s TTL since default theme is frequently accessed
	 * @returns {Promise<Theme | null>} The default theme object or null if none is set.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async getDefault() {
		return withCache(
			'theme:default',
			async () => {
				try {
					return await this.themeModel.findOne({ isDefault: true }).lean().exec();
				} catch (error2) {
					throw createDatabaseError(error2, 'THEME_FETCH_FAILED', 'Failed to get default theme');
				}
			},
			{ category: CacheCategory.THEME }
		);
	}
	/**
	 * Retrieves all themes from the database, sorted by order.
	 * Cached with 300s TTL since theme list is frequently accessed in admin UI
	 * @returns {Promise<Theme[]>} An array of theme objects.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async findAll() {
		return withCache(
			'theme:all',
			async () => {
				try {
					return await this.themeModel.find().sort({ order: 1 }).lean().exec();
				} catch (error2) {
					throw createDatabaseError(error2, 'THEME_FETCH_ALL_FAILED', 'Failed to get all themes');
				}
			},
			{ category: CacheCategory.THEME }
		);
	}
	/**
	 * Sets a specific theme as the active one. This will deactivate any other active theme.
	 * @param {DatabaseId} themeId The ID of the theme to activate.
	 * @returns {Promise<Theme | null>} The updated theme object or null if not found.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async setActive(themeId) {
		const result = await this._setUniqueFlag(themeId, 'isActive');
		await invalidateCategoryCache(CacheCategory.THEME);
		return result;
	}
	/**
	 * Sets a specific theme as the default one. This will unset any other default theme.
	 * @param {DatabaseId} themeId The ID of the theme to set as default.
	 * @returns {Promise<Theme | null>} The updated theme object or null if not found.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async setDefault(themeId) {
		const result = await this._setUniqueFlag(themeId, 'isDefault');
		await invalidateCategoryCache(CacheCategory.THEME);
		return result;
	}
	/**
	 * Installs (creates) a new theme in the database.
	 * @param {Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>} themeData - The theme data to install.
	 * @returns {Promise<Theme>} The newly created theme object.
	 * @throws {DatabaseError} If the creation fails.
	 */
	async install(themeData) {
		try {
			const newTheme = new this.themeModel(themeData);
			const savedTheme = await newTheme.save();
			await invalidateCategoryCache(CacheCategory.THEME);
			return savedTheme.toObject();
		} catch (error2) {
			throw createDatabaseError(error2, 'THEME_INSTALL_FAILED', 'Failed to install theme');
		}
	}
	/**
	 * Installs or updates a theme using atomic upsert operation.
	 * If the theme exists (by _id), it updates it. Otherwise, it creates a new one.
	 * This method is safe from duplicate key errors.
	 * @param {Theme} themeData - The complete theme data including _id.
	 * @returns {Promise<Theme>} The created or updated theme object.
	 * @throws {DatabaseError} If the operation fails.
	 */
	async installOrUpdate(themeData) {
		try {
			const result = await this.themeModel
				.findOneAndUpdate({ _id: themeData._id }, themeData, { upsert: true, new: true, setDefaultsOnInsert: true })
				.lean()
				.exec();
			await invalidateCategoryCache(CacheCategory.THEME);
			return result;
		} catch (error2) {
			throw createDatabaseError(error2, 'THEME_UPSERT_FAILED', 'Failed to install or update theme');
		}
	}
	/**
	 * Uninstalls (deletes) a theme from the database.
	 * @param {DatabaseId} themeId - The ID of the theme to uninstall.
	 * @returns {Promise<boolean>} True if a theme was deleted, false otherwise.
	 * @throws {DatabaseError} If the deletion fails.
	 */
	async uninstall(themeId) {
		try {
			const result = await this.themeModel.findByIdAndDelete(themeId).exec();
			await invalidateCategoryCache(CacheCategory.THEME);
			return !!result;
		} catch (error2) {
			throw createDatabaseError(error2, 'THEME_UNINSTALL_FAILED', 'Failed to uninstall theme');
		}
	}
	/**
	 * Updates an existing theme's data.
	 * @param {DatabaseId} themeId - The ID of the theme to update.
	 * @param {Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>} themeData - The fields to update.
	 * @returns {Promise<Theme | null>} The updated theme object, or null if not found.
	 * @throws {DatabaseError} If the update fails.
	 */
	async update(themeId, themeData) {
		try {
			const result = await this.themeModel.findByIdAndUpdate(themeId, { $set: themeData }, { new: true }).lean().exec();
			await invalidateCategoryCache(CacheCategory.THEME);
			return result;
		} catch (error2) {
			throw createDatabaseError(error2, 'THEME_UPDATE_FAILED', 'Failed to update theme');
		}
	}
	/**
	 * A private helper to atomically set a unique boolean flag on a document.
	 * Uses a single bulkWrite operation for atomicity and efficiency.
	 * @param {DatabaseId} themeId - The ID of the theme to set the flag on.
	 * @param {string} flag - The flag name ('isActive' or 'isDefault').
	 * @returns {Promise<Theme | null>} The updated theme object or null if not found.
	 * @throws {DatabaseError} If the operation fails.
	 */
	async _setUniqueFlag(themeId, flag) {
		try {
			await this.themeModel.bulkWrite([
				{
					// Step 1: Unset the flag for all other themes
					updateMany: {
						filter: { _id: { $ne: themeId } },
						update: { $set: { [flag]: false } }
					}
				},
				{
					// Step 2: Set the flag for the target theme
					updateOne: {
						filter: { _id: themeId },
						update: { $set: { [flag]: true } }
					}
				}
			]);
			return await this.themeModel.findById(themeId).lean().exec();
		} catch (error2) {
			throw createDatabaseError(error2, 'THEME_FLAG_UPDATE_FAILED', `Failed to set the '${flag}' flag for theme ${themeId}`);
		}
	}
}
class MongoWebsiteTokenMethods {
	crud;
	constructor(websiteTokenModel) {
		this.crud = new MongoCrudMethods(websiteTokenModel);
	}
	async create(token) {
		return this.crud.insert(token);
	}
	async getAll(options) {
		const sort = options.sort && options.order ? { [options.sort]: options.order } : {};
		const data = await this.crud.findMany(options.filter || {}, { limit: options.limit, skip: options.skip, sort });
		const total = await this.crud.count(options.filter || {});
		return { data, total };
	}
	async delete(tokenId) {
		return this.crud.delete(tokenId);
	}
	async getByName(name) {
		return this.crud.findOne({ name });
	}
}
class MongoWidgetMethods {
	widgetModel;
	/**
	 * Constructs the MongoWidgetMethods instance with an injected model.
	 * @param {WidgetModelType} widgetModel - The Mongoose model for widgets.
	 */
	constructor(widgetModel) {
		this.widgetModel = widgetModel;
		logger.trace('MongoWidgetMethods initialized.');
	}
	/**
	 * Registers (creates) a new widget in the database.
	 * @param {Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>} widgetData - The data for the new widget.
	 * @returns {Promise<Widget>} The created widget object.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async register(widgetData) {
		try {
			const widgetWithId = {
				...widgetData,
				_id: generateId()
			};
			logger.debug(`[WidgetMethods] Registering widget "${widgetData.name}" to database`, {
				widgetId: widgetWithId._id,
				collection: this.widgetModel.collection.name,
				widgetData: widgetWithId
			});
			const newWidget = new this.widgetModel(widgetWithId);
			const savedWidget = await newWidget.save();
			const result = savedWidget.toObject();
			logger.debug(`[WidgetMethods] Widget "${widgetData.name}" saved successfully`, {
				widgetId: result._id,
				isActive: result.isActive,
				collection: this.widgetModel.collection.name
			});
			return result;
		} catch (error2) {
			logger.error(`[WidgetMethods] Failed to register widget "${widgetData.name}"`, {
				error: error2 instanceof Error ? error2.message : String(error2),
				collection: this.widgetModel.collection.name
			});
			throw createDatabaseError(error2, 'WIDGET_REGISTER_FAILED', 'Failed to register widget');
		}
	}
	/**
	 * Finds a single widget by its ID.
	 * Cached with 600s TTL since widget configs are relatively stable
	 * @param {DatabaseId} widgetId - The ID of the widget to find.
	 * @returns {Promise<Widget | null>} The widget object or null if not found.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async findById(widgetId) {
		return withCache(
			`widget:id:${widgetId}`,
			async () => {
				try {
					return await this.widgetModel.findById(widgetId).lean().exec();
				} catch (error2) {
					throw createDatabaseError(error2, 'WIDGET_FETCH_FAILED', `Failed to find widget with ID ${widgetId}`);
				}
			},
			{ category: CacheCategory.WIDGET }
		);
	}
	/**
	 * Activates a widget, setting its `isActive` flag to true.
	 * @param {DatabaseId} widgetId - The ID of the widget to activate.
	 * @returns {Promise<Widget | null>} The updated widget object or null if not found.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async activate(widgetId) {
		try {
			const result = await this.widgetModel
				.findByIdAndUpdate(widgetId, { $set: { isActive: true } }, { new: true })
				.lean()
				.exec();
			logger.debug('[widgetMethods.activate] Invalidating active widgets cache');
			await Promise.all([
				invalidateCollectionCache(`widget:id:${widgetId}`),
				cacheService.delete('widget:active:all'),
				// No tenant (default)
				cacheService.delete('widget:active:all', 'default'),
				// Explicit default tenant
				cacheService.delete('widget:active:all', 'default-tenant'),
				// default-tenant
				invalidateCategoryCache(CacheCategory.WIDGET)
			]);
			logger.debug('[widgetMethods.activate] Cache invalidated successfully');
			return result;
		} catch (error2) {
			throw createDatabaseError(error2, 'WIDGET_UPDATE_FAILED', 'Failed to activate widget');
		}
	}
	/**
	 * Deactivates a widget, setting its `isActive` flag to false.
	 * @param {DatabaseId} widgetId - The ID of the widget to deactivate.
	 * @returns {Promise<Widget | null>} The updated widget object or null if not found.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async deactivate(widgetId) {
		try {
			const result = await this.widgetModel
				.findByIdAndUpdate(widgetId, { $set: { isActive: false } }, { new: true })
				.lean()
				.exec();
			logger.debug('[widgetMethods.deactivate] Invalidating active widgets cache');
			await Promise.all([
				invalidateCollectionCache(`widget:id:${widgetId}`),
				cacheService.delete('widget:active:all'),
				// No tenant (default)
				cacheService.delete('widget:active:all', 'default'),
				// Explicit default tenant
				cacheService.delete('widget:active:all', 'default-tenant'),
				// default-tenant
				invalidateCategoryCache(CacheCategory.WIDGET)
			]);
			logger.debug('[widgetMethods.deactivate] Cache invalidated successfully');
			return result;
		} catch (error2) {
			throw createDatabaseError(error2, 'WIDGET_UPDATE_FAILED', 'Failed to deactivate widget');
		}
	}
	/**
	 * Updates an existing widget with new data.
	 * @param {DatabaseId} widgetId - The ID of the widget to update.
	 * @param {Partial<Omit<Widget, '_id'>>} widgetData - The fields to update.
	 * @returns {Promise<Widget | null>} The updated widget object or null if not found.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async update(widgetId, widgetData) {
		try {
			logger.debug('[widgetMethods.update] Starting update', {
				widgetId,
				widgetData,
				collection: this.widgetModel.collection.name
			});
			const existingWidget = await this.widgetModel.findById(widgetId).lean().exec();
			logger.debug('[widgetMethods.update] Existing widget state', {
				widgetId,
				exists: !!existingWidget,
				currentIsActive: existingWidget?.isActive,
				currentUpdatedAt: existingWidget?.updatedAt
			});
			const result = await this.widgetModel.findByIdAndUpdate(widgetId, { $set: widgetData }, { new: true }).lean().exec();
			logger.debug('[widgetMethods.update] Update completed', {
				widgetId,
				success: !!result,
				resultIsActive: result?.isActive,
				resultUpdatedAt: result?.updatedAt
			});
			logger.debug('[widgetMethods.update] Invalidating caches', {
				widgetId,
				cacheKeys: ['widget:active:all (all tenants)']
			});
			await Promise.all([
				invalidateCollectionCache(`widget:id:${widgetId}`),
				cacheService.delete('widget:active:all'),
				// No tenant (default)
				cacheService.delete('widget:active:all', 'default'),
				// Explicit default tenant
				cacheService.delete('widget:active:all', 'default-tenant'),
				// default-tenant
				invalidateCategoryCache(CacheCategory.WIDGET)
			]);
			logger.debug('[widgetMethods.update] Caches invalidated successfully', {
				widgetId
			});
			return result;
		} catch (error2) {
			logger.error('[widgetMethods.update] Update failed', {
				widgetId,
				error: error2 instanceof Error ? error2.message : String(error2)
			});
			throw createDatabaseError(error2, 'WIDGET_UPDATE_FAILED', 'Failed to update widget');
		}
	}
	/**
	 * Deletes a widget from the database.
	 * @param {DatabaseId} widgetId - The ID of the widget to delete.
	 * @returns {Promise<boolean>} True if a widget was deleted, false otherwise.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async delete(widgetId) {
		try {
			const result = await this.widgetModel.findByIdAndDelete(widgetId).exec();
			await Promise.all([invalidateCollectionCache(`widget:id:${widgetId}`), invalidateCategoryCache(CacheCategory.WIDGET)]);
			return !!result;
		} catch (error2) {
			throw createDatabaseError(error2, 'WIDGET_DELETE_FAILED', 'Failed to delete widget');
		}
	}
	/**
	 * Retrieves all widgets from the database.
	 * @returns {Promise<Widget[]>} An array of all widget objects.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async findAll() {
		try {
			logger.debug('[widgetMethods.findAll] Querying widgets from database', {
				collection: this.widgetModel.collection.name
			});
			const widgets = await this.widgetModel.find().lean().exec();
			logger.debug('[widgetMethods.findAll] Query completed', {
				count: widgets.length,
				collection: this.widgetModel.collection.name,
				widgets: widgets.map((w) => ({ name: w.name, isActive: w.isActive, _id: w._id }))
			});
			return widgets;
		} catch (error2) {
			logger.error('[widgetMethods.findAll] Failed to query widgets', {
				error: error2 instanceof Error ? error2.message : String(error2),
				collection: this.widgetModel.collection.name
			});
			throw createDatabaseError(error2, 'WIDGET_FETCH_ALL_FAILED', 'Failed to get all widgets');
		}
	}
	/**
	 * Retrieves all active widgets from the database.
	 * Cached with 600s TTL since active widgets are frequently accessed on every page
	 * @returns {Promise<Widget[]>} An array of active widget objects.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async findAllActive(tenantId) {
		logger.debug('[widgetMethods.findAllActive] Fetching active widgets (may be cached)', { tenantId });
		const result = await withCache(
			'widget:active:all',
			async () => {
				try {
					logger.debug('[widgetMethods.findAllActive] Cache MISS - querying database');
					const widgets = await this.widgetModel.find({ isActive: true }).lean().exec();
					logger.debug('[widgetMethods.findAllActive] Database query completed', {
						count: widgets.length,
						widgets: widgets.map((w) => w.name)
					});
					return widgets;
				} catch (error2) {
					throw createDatabaseError(error2, 'WIDGET_FETCH_ACTIVE_FAILED', 'Failed to get active widgets');
				}
			},
			{ category: CacheCategory.WIDGET, tenantId }
		);
		logger.debug('[widgetMethods.findAllActive] Returning result', {
			count: result.length,
			widgets: result.map((w) => w.name)
		});
		return result;
	}
	/**
	 * Direct database query for active widgets
	 * This method pushes filtering to the database layer instead of fetching all widgets
	 * and filtering in application code. This is significantly faster for large widget sets.
	 * @returns {Promise<Widget[]>} An array of active widget objects.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async getActiveWidgets() {
		try {
			logger.debug('[widgetMethods.getActiveWidgets] Querying active widgets from database');
			const widgets = await this.widgetModel.find({ isActive: true }).lean().exec();
			logger.debug('[widgetMethods.getActiveWidgets] Query completed', {
				count: widgets.length,
				widgets: widgets.map((w) => ({ name: w.name, _id: w._id }))
			});
			return widgets;
		} catch (error2) {
			logger.error('[widgetMethods.getActiveWidgets] Failed to query active widgets', {
				error: error2 instanceof Error ? error2.message : String(error2)
			});
			throw createDatabaseError(error2, 'WIDGET_FETCH_ACTIVE_FAILED', 'Failed to get active widgets');
		}
	}
}
class MongoQueryBuilder {
	model;
	query = {};
	sortOptions = {};
	limitValue;
	skipValue;
	projectionFields;
	distinctField;
	// private paginationOptions?: PaginationOptions; // Removed unused variable
	optimizationHints;
	timeoutMs;
	selectedFields;
	excludedFields;
	searchQuery;
	inConditions = [];
	notInConditions = [];
	betweenConditions = [];
	nullConditions = [];
	groupByField;
	multiSortOptions = [];
	constructor(model) {
		this.model = model;
	}
	where(conditions) {
		if (typeof conditions === 'function') {
			logger.warn('Function-based where conditions have limited MongoDB support');
			return this;
		}
		this.query = { ...this.query, ...conditions };
		return this;
	}
	whereIn(field, values) {
		this.inConditions.push({ field, values });
		return this;
	}
	whereNotIn(field, values) {
		this.notInConditions.push({ field, values });
		return this;
	}
	whereBetween(field, min, max) {
		this.betweenConditions.push({ field, min, max });
		return this;
	}
	whereNull(field) {
		this.nullConditions.push({ field, isNull: true });
		return this;
	}
	whereNotNull(field) {
		this.nullConditions.push({ field, isNull: false });
		return this;
	}
	search(query, fields) {
		this.searchQuery = { query, fields };
		return this;
	}
	limit(value) {
		this.limitValue = value;
		return this;
	}
	skip(value) {
		this.skipValue = value;
		return this;
	}
	sort(field, direction) {
		this.sortOptions[field] = direction === 'asc' ? 1 : -1;
		return this;
	}
	orderBy(sorts) {
		this.multiSortOptions = sorts;
		sorts.forEach(({ field, direction }) => {
			this.sortOptions[field] = direction === 'asc' ? 1 : -1;
		});
		return this;
	}
	select(fields) {
		this.selectedFields = fields;
		return this;
	}
	exclude(fields) {
		this.excludedFields = fields;
		return this;
	}
	project(fields) {
		this.projectionFields = fields;
		return this;
	}
	distinct(field) {
		if (field) {
			this.distinctField = field;
		}
		return this;
	}
	groupBy(field) {
		this.groupByField = field;
		return this;
	}
	hint(hints) {
		this.optimizationHints = hints;
		return this;
	}
	timeout(milliseconds) {
		this.timeoutMs = milliseconds;
		return this;
	}
	paginate(options) {
		if (options.cursor) {
			const [cursorField, cursorValue] = options.cursor.split(':');
			if (cursorField && cursorValue) {
				const cursorCondition = options.sortDirection === 'desc' ? { $lt: cursorValue } : { $gt: cursorValue };
				this.query[cursorField] = cursorCondition;
			}
		} else if (options.page && options.pageSize) {
			this.skipValue = (options.page - 1) * options.pageSize;
			this.limitValue = options.pageSize;
		}
		if (options.sortField && options.sortDirection) {
			this.sortOptions[options.sortField] = options.sortDirection === 'asc' ? 1 : -1;
		}
		return this;
	}
	buildQuery() {
		const finalQuery = { ...this.query };
		this.inConditions.forEach(({ field, values }) => {
			finalQuery[field] = { $in: values };
		});
		this.notInConditions.forEach(({ field, values }) => {
			finalQuery[field] = { $nin: values };
		});
		this.betweenConditions.forEach(({ field, min, max }) => {
			finalQuery[field] = { $gte: min, $lte: max };
		});
		this.nullConditions.forEach(({ field, isNull }) => {
			if (isNull) {
				finalQuery[field] = { $eq: null };
			} else {
				finalQuery[field] = { $ne: null };
			}
		});
		if (this.searchQuery) {
			if (this.searchQuery.fields && this.searchQuery.fields.length > 0) {
				const searchConditions = this.searchQuery.fields.map((field) => ({
					[field]: { $regex: this.searchQuery.query, $options: 'i' }
				}));
				finalQuery.$or = searchConditions;
			} else {
				finalQuery.$text = { $search: this.searchQuery.query };
			}
		}
		return finalQuery;
	}
	buildProjection() {
		if (this.selectedFields?.length) {
			const projection = {};
			this.selectedFields.forEach((field) => {
				projection[field] = 1;
			});
			return projection;
		}
		if (this.excludedFields?.length) {
			const projection = {};
			this.excludedFields.forEach((field) => {
				projection[field] = 0;
			});
			return projection;
		}
		return this.projectionFields;
	}
	createDatabaseError(error2, code, message) {
		logger.error(`${code}: ${message}`, error2);
		return {
			code,
			message,
			details: error2 instanceof Error ? error2.message : String(error2),
			stack: error2 instanceof Error ? error2.stack : void 0
		};
	}
	buildQueryMeta(startTime) {
		const executionTime = Date.now() - startTime;
		return {
			executionTime,
			cached: false,
			// MongoDB doesn't provide direct cache info
			indexesUsed: this.optimizationHints?.useIndex || []
			// Note: MongoDB doesn't easily provide recordsExamined without explain()
			// For production monitoring, consider enabling explain() in development
		};
	}
	async count() {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			const count = await this.model.countDocuments(query);
			const meta = this.buildQueryMeta(startTime);
			return { success: true, data: count, meta };
		} catch (error2) {
			const dbError = this.createDatabaseError(error2, 'QUERY_COUNT_ERROR', 'Failed to count documents');
			return {
				success: false,
				error: dbError,
				message: dbError.message
			};
		}
	}
	async exists() {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			const count = await this.model.countDocuments(query).limit(1);
			const meta = this.buildQueryMeta(startTime);
			return { success: true, data: count > 0, meta };
		} catch (error2) {
			const dbError = this.createDatabaseError(error2, 'QUERY_EXISTS_ERROR', 'Failed to check document existence');
			return {
				success: false,
				error: dbError,
				message: dbError.message
			};
		}
	}
	async execute() {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			let mongoQuery = this.model.find(query);
			if (this.optimizationHints) {
				if (this.optimizationHints.useIndex?.length) {
					mongoQuery = mongoQuery.hint(this.optimizationHints.useIndex[0]);
				}
				if (this.optimizationHints.maxExecutionTime) {
					mongoQuery = mongoQuery.maxTimeMS(this.optimizationHints.maxExecutionTime);
				}
				if (this.optimizationHints.batchSize) {
					mongoQuery = mongoQuery.batchSize(this.optimizationHints.batchSize);
				}
			}
			if (this.timeoutMs) {
				mongoQuery = mongoQuery.maxTimeMS(this.timeoutMs);
			}
			if (this.multiSortOptions.length > 0) {
				const sortObj = {};
				this.multiSortOptions.forEach(({ field, direction }) => {
					sortObj[field] = direction === 'asc' ? 1 : -1;
				});
				mongoQuery = mongoQuery.sort(sortObj);
			} else if (Object.keys(this.sortOptions).length > 0) {
				mongoQuery = mongoQuery.sort(this.sortOptions);
			}
			const projection = this.buildProjection();
			if (projection) {
				mongoQuery = mongoQuery.select(projection);
			}
			if (this.skipValue !== void 0) {
				mongoQuery = mongoQuery.skip(this.skipValue);
			}
			if (this.limitValue !== void 0) {
				mongoQuery = mongoQuery.limit(this.limitValue);
			}
			if (this.distinctField) {
				const distinctValues = await this.model.distinct(this.distinctField, query);
				const meta2 = this.buildQueryMeta(startTime);
				return { success: true, data: distinctValues, meta: meta2 };
			}
			if (this.groupByField) {
				const pipeline = [{ $match: query }, { $group: { _id: `$${this.groupByField}`, items: { $push: '$$ROOT' } } }];
				const results2 = await this.model.aggregate(pipeline);
				const flatResults = results2.flatMap((group) => group.items);
				const meta2 = this.buildQueryMeta(startTime);
				return { success: true, data: flatResults, meta: meta2 };
			}
			const results = await mongoQuery.lean().exec();
			const processedResults = results.map((doc) => ({
				...doc,
				createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
				updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt
			}));
			const meta = this.buildQueryMeta(startTime);
			return { success: true, data: processedResults, meta };
		} catch (error2) {
			const dbError = this.createDatabaseError(error2, 'QUERY_EXECUTION_ERROR', 'Failed to execute query');
			return {
				success: false,
				error: dbError,
				message: dbError.message
			};
		}
	}
	async stream() {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			let mongoQuery = this.model.find(query);
			if (this.optimizationHints) {
				if (this.optimizationHints.batchSize) {
					mongoQuery = mongoQuery.batchSize(this.optimizationHints.batchSize);
				}
				if (this.optimizationHints.maxExecutionTime) {
					mongoQuery = mongoQuery.maxTimeMS(this.optimizationHints.maxExecutionTime);
				}
			}
			if (this.multiSortOptions.length > 0) {
				const sortObj = {};
				this.multiSortOptions.forEach(({ field, direction }) => {
					sortObj[field] = direction === 'asc' ? 1 : -1;
				});
				mongoQuery = mongoQuery.sort(sortObj);
			} else if (Object.keys(this.sortOptions).length > 0) {
				mongoQuery = mongoQuery.sort(this.sortOptions);
			}
			const projection = this.buildProjection();
			if (projection) {
				mongoQuery = mongoQuery.select(projection);
			}
			const cursor = mongoQuery.lean().cursor();
			const asyncIterable = {
				async *[Symbol.asyncIterator]() {
					try {
						for await (const doc of cursor) {
							const processedDoc = {
								...doc,
								createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
								updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt
							};
							yield processedDoc;
						}
					} catch (error2) {
						if (error2 instanceof Error) {
							logger.error(`Stream iteration failed: ${error2.message}`);
						} else {
							logger.error('Stream iteration failed with an unknown error', error2);
						}
						throw error2;
					}
				}
			};
			const meta = this.buildQueryMeta(startTime);
			return { success: true, data: asyncIterable, meta };
		} catch (error2) {
			const dbError = this.createDatabaseError(error2, 'QUERY_STREAM_ERROR', 'Failed to create query stream');
			return {
				success: false,
				error: dbError,
				message: dbError.message
			};
		}
	}
	async findOne() {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			let mongoQuery = this.model.findOne(query);
			if (this.optimizationHints) {
				if (this.optimizationHints.maxExecutionTime) {
					mongoQuery = mongoQuery.maxTimeMS(this.optimizationHints.maxExecutionTime);
				}
			}
			if (this.timeoutMs) {
				mongoQuery = mongoQuery.maxTimeMS(this.timeoutMs);
			}
			const projection = this.buildProjection();
			if (projection) {
				mongoQuery = mongoQuery.select(projection);
			}
			if (this.multiSortOptions.length > 0) {
				const sortObj = {};
				this.multiSortOptions.forEach(({ field, direction }) => {
					sortObj[field] = direction === 'asc' ? 1 : -1;
				});
				mongoQuery = mongoQuery.sort(sortObj);
			} else if (Object.keys(this.sortOptions).length > 0) {
				mongoQuery = mongoQuery.sort(this.sortOptions);
			}
			const result = await mongoQuery.lean().exec();
			if (!result) {
				const meta2 = this.buildQueryMeta(startTime);
				return { success: true, data: null, meta: meta2 };
			}
			const processedResult = {
				...result,
				createdAt: result.createdAt instanceof Date ? result.createdAt.toISOString() : result.createdAt,
				updatedAt: result.updatedAt instanceof Date ? result.updatedAt.toISOString() : result.updatedAt
			};
			const meta = this.buildQueryMeta(startTime);
			return { success: true, data: processedResult, meta };
		} catch (error2) {
			const dbError = this.createDatabaseError(error2, 'QUERY_FINDONE_ERROR', 'Failed to find document');
			return {
				success: false,
				error: dbError,
				message: dbError.message
			};
		}
	}
	async findOneOrFail() {
		const result = await this.findOne();
		if (!result.success) {
			return result;
		}
		if (result.data === null) {
			const dbError = this.createDatabaseError(new Error('Document not found'), 'DOCUMENT_NOT_FOUND', 'Required document not found');
			return {
				success: false,
				error: dbError,
				message: dbError.message
			};
		}
		return { success: true, data: result.data, meta: result.meta };
	}
	async updateMany(data) {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			const updateData = {
				...data,
				updatedAt: /* @__PURE__ */ new Date().toISOString()
			};
			const result = await this.model.updateMany(query, { $set: updateData });
			const meta = this.buildQueryMeta(startTime);
			return {
				success: true,
				data: { modifiedCount: result.modifiedCount || 0 },
				meta
			};
		} catch (error2) {
			const dbError = this.createDatabaseError(error2, 'QUERY_UPDATE_MANY_ERROR', 'Failed to update documents');
			return {
				success: false,
				error: dbError,
				message: dbError.message
			};
		}
	}
	async deleteMany() {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			const result = await this.model.deleteMany(query);
			const meta = this.buildQueryMeta(startTime);
			return {
				success: true,
				data: { deletedCount: result.deletedCount || 0 },
				meta
			};
		} catch (error2) {
			const dbError = this.createDatabaseError(error2, 'QUERY_DELETE_MANY_ERROR', 'Failed to delete documents');
			return {
				success: false,
				error: dbError,
				message: dbError.message
			};
		}
	}
}
function composeMongoAuthAdapter() {
	const userAdapter = new UserAdapter();
	const sessionAdapter = new SessionAdapter();
	const tokenAdapter = new TokenAdapter();
	const adapter = {
		// User Management Methods
		createUser: userAdapter.createUser.bind(userAdapter),
		updateUserAttributes: userAdapter.updateUserAttributes.bind(userAdapter),
		deleteUser: userAdapter.deleteUser.bind(userAdapter),
		getUserById: userAdapter.getUserById.bind(userAdapter),
		getUserByEmail: userAdapter.getUserByEmail.bind(userAdapter),
		getAllUsers: userAdapter.getAllUsers.bind(userAdapter),
		getUserCount: userAdapter.getUserCount.bind(userAdapter),
		deleteUsers: userAdapter.deleteUsers?.bind(userAdapter),
		blockUsers: userAdapter.blockUsers?.bind(userAdapter),
		unblockUsers: userAdapter.unblockUsers?.bind(userAdapter),
		// Combined Performance-Optimized Methods
		createUserAndSession: async (userData, sessionData) => {
			try {
				if (userData.password) {
					userData.password = await hashPassword(userData.password);
				}
				const userResult = await userAdapter.createUser(userData);
				if (!userResult.success) {
					return {
						success: false,
						message: userResult.message || 'Failed to create user',
						error: userResult.error
					};
				}
				const sessionResult = await sessionAdapter.createSession({
					user_id: userResult.data._id,
					expires: sessionData.expires,
					tenantId: sessionData.tenantId
				});
				if (!sessionResult.success) {
					await userAdapter.deleteUser(userResult.data._id, sessionData.tenantId);
					return {
						success: false,
						message: sessionResult.message || 'Failed to create session',
						error: sessionResult.error
					};
				}
				return {
					success: true,
					data: {
						user: userResult.data,
						session: sessionResult.data
					}
				};
			} catch (err) {
				const message = `Error in createUserAndSession: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				return {
					success: false,
					message,
					error: {
						code: 'CREATE_USER_AND_SESSION_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		},
		deleteUserAndSessions: async (user_id, tenantId) => {
			try {
				let deletedSessionCount = 0;
				try {
					const activeSessions = await sessionAdapter.getActiveSessions(user_id, tenantId);
					if (activeSessions.success && activeSessions.data) {
						deletedSessionCount = activeSessions.data.length;
					}
				} catch {
					logger.debug('Could not count sessions before deletion', { user_id });
				}
				const sessionsResult = await sessionAdapter.invalidateAllUserSessions(user_id, tenantId);
				if (!sessionsResult.success) {
					logger.warn('Failed to invalidate user sessions, continuing with user deletion', {
						user_id,
						error: sessionsResult.message
					});
				}
				const userResult = await userAdapter.deleteUser(user_id, tenantId);
				if (!userResult.success) {
					return {
						success: false,
						message: userResult.message || 'Failed to delete user',
						error: userResult.error
					};
				}
				logger.info(`User and sessions deleted: user=${user_id}, sessions=${deletedSessionCount}`, {
					user_id,
					deletedSessionCount,
					tenantId
				});
				return {
					success: true,
					data: {
						deletedUser: true,
						deletedSessionCount
					}
				};
			} catch (err) {
				const message = `Error in deleteUserAndSessions: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message, { user_id, tenantId });
				return {
					success: false,
					message,
					error: {
						code: 'DELETE_USER_AND_SESSIONS_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		},
		// Session Management Methods
		createSession: sessionAdapter.createSession.bind(sessionAdapter),
		updateSessionExpiry: sessionAdapter.updateSessionExpiry.bind(sessionAdapter),
		deleteSession: sessionAdapter.deleteSession.bind(sessionAdapter),
		deleteExpiredSessions: sessionAdapter.deleteExpiredSessions.bind(sessionAdapter),
		validateSession: sessionAdapter.validateSession.bind(sessionAdapter),
		invalidateAllUserSessions: sessionAdapter.invalidateAllUserSessions.bind(sessionAdapter),
		getActiveSessions: sessionAdapter.getActiveSessions.bind(sessionAdapter),
		getAllActiveSessions: sessionAdapter.getAllActiveSessions.bind(sessionAdapter),
		getSessionTokenData: sessionAdapter.getSessionTokenData.bind(sessionAdapter),
		rotateToken: sessionAdapter.rotateToken.bind(sessionAdapter),
		cleanupRotatedSessions: sessionAdapter.cleanupRotatedSessions?.bind(sessionAdapter),
		// Token Management Methods
		createToken: tokenAdapter.createToken.bind(tokenAdapter),
		validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
		consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
		getTokenByValue: tokenAdapter.getTokenByValue.bind(tokenAdapter),
		deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter),
		getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),
		updateToken: tokenAdapter.updateToken.bind(tokenAdapter),
		deleteTokens: tokenAdapter.deleteTokens.bind(tokenAdapter),
		blockTokens: tokenAdapter.blockTokens.bind(tokenAdapter),
		unblockTokens: tokenAdapter.unblockTokens.bind(tokenAdapter),
		// Role Management Methods (basic implementation)
		createRole: async (role) => {
			try {
				const RoleModel =
					mongoose.models.auth_roles ||
					mongoose.model(
						'auth_roles',
						new mongoose.Schema(
							{
								_id: { type: String, required: true },
								name: { type: String, required: true },
								description: String,
								isAdmin: Boolean,
								permissions: [String],
								tenantId: { type: String, index: true },
								// Multi-tenant support
								groupName: String,
								icon: String,
								color: String
							},
							{
								_id: false,
								timestamps: true,
								collection: 'auth_roles'
							}
						)
					);
				await RoleModel.collection.createIndex({ tenantId: 1 });
				await RoleModel.collection.createIndex({ tenantId: 1, _id: 1 });
				const newRole = await RoleModel.create(role);
				return {
					success: true,
					data: newRole.toObject()
				};
			} catch (err) {
				const message = `Error creating role: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				return {
					success: false,
					message,
					error: {
						code: 'CREATE_ROLE_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		},
		getAllRoles: async (tenantId) => {
			try {
				const RoleModel =
					mongoose.models.auth_roles ||
					mongoose.model(
						'auth_roles',
						new mongoose.Schema(
							{
								_id: { type: String, required: true },
								name: { type: String, required: true },
								description: String,
								isAdmin: Boolean,
								permissions: [String],
								tenantId: { type: String, index: true },
								groupName: String,
								icon: String,
								color: String
							},
							{
								_id: false,
								timestamps: true,
								collection: 'auth_roles'
							}
						)
					);
				const filter = tenantId ? { tenantId } : { tenantId: { $exists: false } };
				const roles = await RoleModel.find(filter).lean();
				return roles;
			} catch (err) {
				logger.error(`Error fetching roles: ${err instanceof Error ? err.message : String(err)}`);
				return [];
			}
		},
		getRoleById: async (roleId, tenantId) => {
			try {
				const RoleModel =
					mongoose.models.auth_roles ||
					mongoose.model(
						'auth_roles',
						new mongoose.Schema(
							{
								_id: { type: String, required: true },
								name: { type: String, required: true },
								description: String,
								isAdmin: Boolean,
								permissions: [String],
								tenantId: { type: String, index: true },
								groupName: String,
								icon: String,
								color: String
							},
							{
								_id: false,
								timestamps: true,
								collection: 'auth_roles'
							}
						)
					);
				const filter = { _id: roleId };
				if (tenantId) {
					filter.tenantId = tenantId;
				} else {
					filter.tenantId = { $exists: false };
				}
				const role = await RoleModel.findOne(filter).lean();
				return {
					success: true,
					data: role || null
				};
			} catch (err) {
				const message = `Error fetching role: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				return {
					success: false,
					message,
					error: {
						code: 'GET_ROLE_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		},
		updateRole: async (roleId, roleData, tenantId) => {
			try {
				const RoleModel =
					mongoose.models.auth_roles ||
					mongoose.model(
						'auth_roles',
						new mongoose.Schema(
							{
								_id: { type: String, required: true },
								name: { type: String, required: true },
								description: String,
								isAdmin: Boolean,
								permissions: [String],
								tenantId: { type: String, index: true },
								groupName: String,
								icon: String,
								color: String
							},
							{
								_id: false,
								timestamps: true,
								collection: 'auth_roles'
							}
						)
					);
				const filter = { _id: roleId };
				if (tenantId) {
					filter.tenantId = tenantId;
				} else {
					filter.tenantId = { $exists: false };
				}
				const updatedRole = await RoleModel.findOneAndUpdate(filter, { $set: roleData }, { new: true }).lean();
				if (!updatedRole) {
					return {
						success: false,
						message: 'Role not found',
						error: {
							code: 'ROLE_NOT_FOUND',
							message: 'Role not found'
						}
					};
				}
				return {
					success: true,
					data: updatedRole
				};
			} catch (err) {
				const message = `Error updating role: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				return {
					success: false,
					message,
					error: {
						code: 'UPDATE_ROLE_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		},
		deleteRole: async (roleId, tenantId) => {
			try {
				const RoleModel =
					mongoose.models.auth_roles ||
					mongoose.model(
						'auth_roles',
						new mongoose.Schema(
							{
								_id: { type: String, required: true },
								name: { type: String, required: true },
								description: String,
								isAdmin: Boolean,
								permissions: [String],
								tenantId: { type: String, index: true },
								groupName: String,
								icon: String,
								color: String
							},
							{
								_id: false,
								timestamps: true,
								collection: 'auth_roles'
							}
						)
					);
				const filter = { _id: roleId };
				if (tenantId) {
					filter.tenantId = tenantId;
				} else {
					filter.tenantId = { $exists: false };
				}
				const result = await RoleModel.deleteOne(filter);
				if (result.deletedCount === 0) {
					return {
						success: false,
						message: 'Role not found',
						error: {
							code: 'ROLE_NOT_FOUND',
							message: 'Role not found'
						}
					};
				}
				return {
					success: true,
					data: void 0
				};
			} catch (err) {
				const message = `Error deleting role: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				return {
					success: false,
					message,
					error: {
						code: 'DELETE_ROLE_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		}
	};
	return adapter;
}
class MongoDBAdapter {
	// --- Private properties for internal, unwrapped method classes ---
	_collectionMethods;
	_content;
	_media;
	_themes;
	_widgets;
	_websiteTokens;
	_system;
	_systemVirtualFolder;
	_auth;
	_repositories = /* @__PURE__ */ new Map();
	// --- Public properties that expose the compliant, wrapped API ---
	content;
	media;
	themes;
	widgets;
	systemPreferences;
	crud;
	auth;
	websiteTokens;
	utils = mongoDBUtils;
	cacheUtils = mongoDBCacheUtils;
	collection;
	getCapabilities() {
		return {
			supportsTransactions: true,
			supportsIndexing: true,
			supportsFullTextSearch: true,
			supportsAggregation: true,
			supportsStreaming: true,
			supportsPartitioning: false,
			maxBatchSize: 1e3,
			maxQueryComplexity: 10
		};
	}
	async getConnectionHealth() {
		try {
			if (!mongoose.connection.db) {
				return { success: false, message: 'Not connected to DB', error: { code: 'DB_DISCONNECTED', message: 'Not connected' } };
			}
			const start = Date.now();
			await mongoose.connection.db.admin().ping();
			const latency = Date.now() - start;
			const activeConnections = -1;
			return {
				success: true,
				data: {
					healthy: this.isConnected(),
					latency,
					activeConnections
				}
			};
		} catch (error2) {
			const dbError = this.utils.createDatabaseError(error2, 'CONNECTION_HEALTH_CHECK_FAILED', 'Failed to check connection health');
			return {
				success: false,
				error: dbError,
				message: dbError.message
			};
		}
	}
	// --- Legacy Support ---
	findMany(coll, query, options) {
		logger$1.warn('Direct call to dbAdapter.findMany() is deprecated. Use dbAdapter.crud.findMany() instead.');
		return this.crud.findMany(coll, query, options);
	}
	create(coll, data) {
		logger$1.warn('Direct call to dbAdapter.create() is deprecated. Use dbAdapter.crud.insert() instead.');
		return this.crud.insert(coll, data);
	}
	// --- Query Builder ---
	queryBuilder(collection) {
		const repo = this._getRepository(collection);
		if (!repo) {
			throw new Error(`Collection ${collection} not found`);
		}
		const model = repo.model;
		if (!model) {
			throw new Error(`Model not found for collection ${collection}`);
		}
		return new MongoQueryBuilder(model);
	}
	async _wrapResult(fn, ...args) {
		try {
			const data = await fn(...args);
			return { success: true, data };
		} catch (error2) {
			const typedError = error2;
			const dbError = this.utils.createDatabaseError(error2, typedError.code || 'OPERATION_FAILED', typedError.message || 'Unknown error');
			return {
				success: false,
				message: dbError.message,
				error: dbError
			};
		}
	}
	// Overload signatures to match IDBAdapter interface
	/**
	 * Check if the adapter is fully initialized (connection + models + wrappers)
	 */
	_isFullyInitialized() {
		return this.isConnected() && this.auth !== void 0 && this._auth !== void 0;
	}
	connect(connectionStringOrOptions, options) {
		return this._wrapResult(async () => {
			if (this._isFullyInitialized()) {
				logger$1.info('MongoDB adapter already fully initialized.');
				return;
			}
			if (this.isConnected() && !this._isFullyInitialized()) {
				logger$1.info('MongoDB connection exists but adapter not fully initialized. Completing initialization...');
				await this._initializeModelsAndWrappers();
				return;
			}
			let connectionString;
			let mongooseOptions = options;
			if (typeof connectionStringOrOptions === 'string' && connectionStringOrOptions) {
				connectionString = connectionStringOrOptions;
				logger$1.debug(`Using provided connection string: mongodb://*****@${connectionString.split('@')[1] || 'localhost'}`);
			} else if (connectionStringOrOptions && typeof connectionStringOrOptions === 'object') {
				logger$1.warn('ConnectionPoolOptions are not fully supported yet. Using default connection string.');
				connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/sveltycms';
				mongooseOptions = connectionStringOrOptions;
			} else {
				logger$1.warn('No connection string provided. Using environment variable or default.');
				connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/sveltycms';
			}
			const connectOptions = mongooseOptions || {
				// Connection Pool Settings (MongoDB 8.0+ optimized)
				maxPoolSize: 50,
				// Maximum concurrent connections
				minPoolSize: 10,
				// Maintain minimum pool for fast response
				maxIdleTimeMS: 3e4,
				// Close idle connections after 30s
				// Performance Optimizations
				// Note: Compression disabled to avoid optional dependency issues (zstd, snappy not installed)
				// You can enable compression by installing: bun add snappy @mongodb-js/zstd
				readPreference: 'primaryPreferred',
				// Balance between consistency and availability
				// Timeout Settings
				serverSelectionTimeoutMS: 5e3,
				// Fail fast on connection issues
				socketTimeoutMS: 45e3,
				// Socket timeout for long-running queries
				connectTimeoutMS: 1e4,
				// Connection timeout
				// Reliability Settings
				retryWrites: true,
				// Auto-retry failed writes
				retryReads: true,
				// Auto-retry failed reads
				w: 'majority',
				// Write concern for data durability
				// Monitoring
				monitorCommands: process.env.NODE_ENV === 'development'
				// Enable command monitoring in dev
			};
			const { getDatabaseResilience } = await import('./DatabaseResilience.js');
			const resilience = getDatabaseResilience();
			await resilience.executeWithRetry(async () => {
				await mongoose.connect(connectionString, connectOptions);
				logger$1.info('MongoDB connection established with resilience and optimized pool configuration.');
			}, 'MongoDB connection');
			this._setupReconnectionHandlers(connectionString, connectOptions);
			await this._initializeModelsAndWrappers();
		});
	}
	// Setup mongoose event listeners for self-healing database reconnection
	_setupReconnectionHandlers(connectionString, connectOptions) {
		mongoose.connection.removeAllListeners('disconnected');
		mongoose.connection.removeAllListeners('error');
		mongoose.connection.removeAllListeners('reconnected');
		mongoose.connection.on('disconnected', async () => {
			logger$1.warn('MongoDB connection lost. Attempting self-healing reconnection...');
			const { getDatabaseResilience, notifyAdminsOfDatabaseFailure } = await import('./DatabaseResilience.js');
			const resilience = getDatabaseResilience();
			const reconnected = await resilience.attemptReconnection(
				async () => {
					await mongoose.connect(connectionString, connectOptions);
				},
				async (error2) => {
					await notifyAdminsOfDatabaseFailure(error2, resilience.getMetrics());
				}
			);
			if (reconnected) {
				logger$1.info('MongoDB self-healing reconnection successful');
			} else {
				logger$1.error('MongoDB self-healing reconnection failed after all attempts');
			}
		});
		mongoose.connection.on('error', (err) => {
			logger$1.error('MongoDB connection error occurred', { error: err });
		});
		mongoose.connection.on('reconnected', () => {
			logger$1.info('MongoDB reconnected successfully');
		});
		logger$1.debug('Self-healing reconnection handlers registered');
	}
	// Initialize all models, repositories, method classes, and wrappers
	async _initializeModelsAndWrappers() {
		this._auth = new MongoAuthModelRegistrar(mongoose);
		await this._auth.setupAuthModels();
		MongoMediaMethods.registerModels(mongoose);
		logger$1.info('All Mongoose models registered.');
		const repositories = {
			nodes: new MongoCrudMethods(ContentStructureModel),
			drafts: new MongoCrudMethods(DraftModel),
			revisions: new MongoCrudMethods(RevisionModel),
			websiteTokens: new MongoCrudMethods(WebsiteTokenModel)
		};
		Object.entries(repositories).forEach(([key, repo]) => this._repositories.set(key, repo));
		this._collectionMethods = new MongoCollectionMethods();
		this._content = new MongoContentMethods(repositories.nodes, repositories.drafts, repositories.revisions);
		this._media = new MongoMediaMethods(MediaModel);
		this._themes = new MongoThemeMethods(ThemeModel);
		this._widgets = new MongoWidgetMethods(WidgetModel);
		this._websiteTokens = new MongoWebsiteTokenMethods(WebsiteTokenModel);
		this._system = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
		this._systemVirtualFolder = new MongoSystemVirtualFolderMethods();
		this._initializeWrappers();
		logger$1.info('MongoDB adapter fully initialized.');
	}
	_initializeWrappers() {
		const authAdapter = composeMongoAuthAdapter();
		this.auth = {
			// Setup method for model registration
			setupAuthModels: async () => {
				await this._auth.setupAuthModels();
			},
			// User Management Methods (authAdapter already returns DatabaseResult, don't double-wrap)
			createUser: (user) => authAdapter.createUser(user),
			updateUserAttributes: (userId, attributes) => authAdapter.updateUserAttributes(userId, attributes),
			deleteUser: (userId) => authAdapter.deleteUser(userId),
			getUserById: (userId) => authAdapter.getUserById(userId),
			getUserByEmail: (email) => authAdapter.getUserByEmail(email),
			getAllUsers: (pagination) => authAdapter.getAllUsers(pagination),
			getUserCount: () => authAdapter.getUserCount(),
			deleteUsers: (userIds) => authAdapter.deleteUsers?.(userIds),
			blockUsers: (userIds) => authAdapter.blockUsers?.(userIds),
			unblockUsers: (userIds) => authAdapter.unblockUsers?.(userIds),
			// Combined Performance-Optimized Methods
			createUserAndSession: (userData, sessionData) => authAdapter.createUserAndSession(userData, sessionData),
			deleteUserAndSessions: (userId, tenantId) => authAdapter.deleteUserAndSessions(userId, tenantId),
			// Session Management Methods (authAdapter already returns DatabaseResult, don't double-wrap)
			createSession: (session) => authAdapter.createSession(session),
			updateSessionExpiry: (sessionId, expiresAt) => authAdapter.updateSessionExpiry(sessionId, expiresAt),
			deleteSession: (sessionId) => authAdapter.deleteSession(sessionId),
			deleteExpiredSessions: () => authAdapter.deleteExpiredSessions(),
			validateSession: (sessionId) => authAdapter.validateSession(sessionId),
			invalidateAllUserSessions: (userId) => authAdapter.invalidateAllUserSessions(userId),
			getActiveSessions: (userId, pagination) => authAdapter.getActiveSessions(userId, pagination),
			getAllActiveSessions: (pagination) => authAdapter.getAllActiveSessions(pagination),
			getSessionTokenData: (sessionId) => authAdapter.getSessionTokenData(sessionId),
			rotateToken: (oldSessionId, expires) => authAdapter.rotateToken(oldSessionId, expires),
			cleanupRotatedSessions: async () => {
				const result = await authAdapter.cleanupRotatedSessions?.();
				return result || { success: true, data: 0 };
			},
			// Token Management Methods (authAdapter already returns DatabaseResult, don't double-wrap)
			createToken: (token) => authAdapter.createToken(token),
			updateToken: (tokenValue, updates) => authAdapter.updateToken(tokenValue, updates),
			validateToken: (tokenValue, type) => authAdapter.validateToken(tokenValue, type),
			consumeToken: (tokenValue) => authAdapter.consumeToken(tokenValue),
			getTokenData: (tokenValue) => authAdapter.getTokenByValue(tokenValue),
			getTokenByValue: (tokenValue) => authAdapter.getTokenByValue(tokenValue),
			getAllTokens: (pagination) => authAdapter.getAllTokens(pagination),
			deleteExpiredTokens: () => authAdapter.deleteExpiredTokens(),
			deleteTokens: (tokenIds) => authAdapter.deleteTokens?.(tokenIds),
			blockTokens: (tokenIds) => authAdapter.blockTokens?.(tokenIds),
			unblockTokens: (tokenIds) => authAdapter.unblockTokens?.(tokenIds),
			// Role Management Methods (authAdapter already returns DatabaseResult or Role[], don't double-wrap)
			getAllRoles: (tenantId) => authAdapter.getAllRoles(tenantId),
			getRoleById: (roleId, tenantId) => authAdapter.getRoleById(roleId, tenantId),
			createRole: (role) => authAdapter.createRole(role),
			updateRole: (roleId, roleData, tenantId) => authAdapter.updateRole(roleId, roleData, tenantId),
			deleteRole: (roleId, tenantId) => authAdapter.deleteRole(roleId, tenantId)
		};
		this.websiteTokens = {
			create: (token) => this._wrapResult(() => this._websiteTokens.create(token)),
			getAll: (options) => this._wrapResult(() => this._websiteTokens.getAll(options)),
			getByName: (name) => this._wrapResult(() => this._websiteTokens.getByName(name)),
			delete: (tokenId) =>
				this._wrapResult(async () => {
					await this._websiteTokens.delete(tokenId);
				})
		};
		this.themes = {
			setupThemeModels: async () => {},
			getActive: async () => {
				const result = await this._wrapResult(() => this._themes.getActive());
				if (!result.success) return result;
				if (!result.data) return { success: false, message: 'No active theme found', error: { code: 'NOT_FOUND', message: 'No active theme found' } };
				return { success: true, data: result.data };
			},
			setDefault: async (id) => {
				const result = await this._wrapResult(() => this._themes.setDefault(id));
				if (!result.success) return result;
				return { success: true, data: void 0 };
			},
			install: (theme) => this._wrapResult(() => this._themes.install(theme)),
			uninstall: async (id) => {
				const result = await this._wrapResult(() => this._themes.uninstall(id));
				if (!result.success) return result;
				return { success: true, data: void 0 };
			},
			update: async (id, theme) => {
				const result = await this._wrapResult(() => this._themes.update(id, theme));
				if (!result.success) return result;
				if (!result.data) return { success: false, message: 'Theme not found', error: { code: 'NOT_FOUND', message: 'Theme not found' } };
				return { success: true, data: result.data };
			},
			getAllThemes: async () => await this._themes.findAll(),
			storeThemes: async (themes) => {
				for (const theme of themes) {
					if (theme._id) {
						await this._themes.installOrUpdate(theme);
					} else {
						await this._themes.install(theme);
					}
				}
			},
			getDefaultTheme: async () => this._wrapResult(() => this._themes.getDefault())
		};
		this.widgets = {
			setupWidgetModels: async () => {},
			register: (widget) => this._wrapResult(() => this._widgets.register(widget)),
			findAll: async () => {
				const result = await this._wrapResult(() => this._widgets.findAll());
				if (!result.success) return result;
				return { success: true, data: result.data || [] };
			},
			getActiveWidgets: async () => {
				const result = await this._wrapResult(() => this._widgets.getActiveWidgets());
				if (!result.success) return result;
				return { success: true, data: result.data || [] };
			},
			activate: async (id) => {
				const result = await this._wrapResult(() => this._widgets.activate(id));
				if (!result.success) return result;
				return { success: true, data: void 0 };
			},
			deactivate: async (id) => {
				const result = await this._wrapResult(() => this._widgets.deactivate(id));
				if (!result.success) return result;
				return { success: true, data: void 0 };
			},
			update: async (id, widget) => {
				const result = await this._wrapResult(() => this._widgets.update(id, widget));
				if (!result.success) return result;
				if (!result.data) return { success: false, message: 'Widget not found', error: { code: 'NOT_FOUND', message: 'Widget not found' } };
				return { success: true, data: result.data };
			},
			delete: async (id) => {
				const result = await this._wrapResult(() => this._widgets.delete(id));
				if (!result.success) return result;
				return { success: true, data: void 0 };
			}
		};
		this.systemPreferences = {
			get: async (key, scope, userId) => {
				const result = await this._wrapResult(() => this._system.get(key, scope, userId));
				if (!result.success) return result;
				if (result.data === null)
					return { success: false, message: 'Preference not found', error: { code: 'NOT_FOUND', message: 'Preference not found' } };
				return { success: true, data: result.data };
			},
			// Use bulk database query instead of sequential gets (10x faster)
			getMany: (keys, scope, userId) => this._wrapResult(() => this._system.getMany(keys, scope, userId)),
			set: (key, value, scope, userId, category) => this._wrapResult(() => this._system.set(key, value, scope, userId, category)),
			// Use bulkWrite instead of sequential sets (33x faster)
			setMany: (preferences) => this._wrapResult(() => this._system.setMany(preferences)),
			delete: (key, scope, userId) => this._wrapResult(() => this._system.delete(key, scope, userId)),
			// Use bulk database operation instead of sequential deletes (33x faster)
			deleteMany: (keys, scope, userId) => this._wrapResult(() => this._system.deleteMany(keys, scope, userId)),
			clear: (scope, userId) => this._wrapResult(() => this._system.clear(scope, userId))
		};
		this.media = {
			setupMediaModels: async () => {},
			files: {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				upload: (file) => this._wrapResult(async () => (await this._media.uploadMany([file]))[0]),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				uploadMany: (files) => this._wrapResult(() => this._media.uploadMany(files)),
				delete: async (id) => {
					const result = await this._wrapResult(() => this._media.deleteMany([id]));
					if (!result.success) return result;
					return { success: true, data: void 0 };
				},
				deleteMany: (ids) => this._wrapResult(() => this._media.deleteMany(ids)),
				getByFolder: (folderId, options) => this._wrapResult(() => this._media.getFiles(folderId, options)),
				search: (_query, options) => this._wrapResult(() => this._media.getFiles(void 0, options)),
				getMetadata: (ids) =>
					this._wrapResult(async () => {
						const files = await this._repositories.get('media').findByIds(ids);
						return files.reduce((acc, f) => ({ ...acc, [f._id]: f.metadata }), {});
					}),
				updateMetadata: async (id, metadata) => {
					const result = await this._wrapResult(() => this._media.updateMetadata(id, metadata));
					if (!result.success) return result;
					if (!result.data) return { success: false, message: 'Media item not found', error: { code: 'NOT_FOUND', message: 'Media item not found' } };
					return { success: true, data: result.data };
				},
				move: (ids, targetId) => this._wrapResult(() => this._media.move(ids, targetId)),
				duplicate: (id, newName) =>
					this._wrapResult(async () => {
						const file = await this._repositories.get('media').findOne({ _id: id });
						if (!file) throw new Error('File not found');
						const newFile = await this._repositories.get('media').insert({
							...file,
							_id: this.utils.generateId(),
							filename: newName || `${file.filename}_copy`
						});
						return newFile;
					})
			},
			// Note: Media files are stored flat with hash-based naming
			// Physical folders (year/month) are managed by mediaStorage.ts utilities
			// Database stores only metadata (filename, size, type, etc.) with no folder hierarchy
			// For content organization, use SystemVirtualFolder instead
			folders: {
				create: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				createMany: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				delete: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				deleteMany: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				getTree: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				getFolderContents: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				move: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				}
			}
		};
		this.systemVirtualFolder = {
			create: (folder) => this._systemVirtualFolder.create(folder),
			getById: (folderId) => this._systemVirtualFolder.getById(folderId),
			getByParentId: (parentId) => this._systemVirtualFolder.getByParentId(parentId),
			getAll: () => this._systemVirtualFolder.getAll(),
			update: (folderId, updateData) => this._systemVirtualFolder.update(folderId, updateData),
			addToFolder: (contentId, folderPath) => this._systemVirtualFolder.addToFolder(contentId, folderPath),
			getContents: (folderPath) => this._systemVirtualFolder.getContents(folderPath),
			delete: (folderId) => this._systemVirtualFolder.delete(folderId),
			exists: (path) => this._systemVirtualFolder.exists(path)
		};
		this.content = {
			nodes: {
				getStructure: (mode, filter, bypassCache) => this._wrapResult(() => this._content.getStructure(mode, filter, bypassCache)),
				upsertContentStructureNode: (node) => this._wrapResult(() => this._content.upsertNodeByPath(node)),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				create: (node) => this._wrapResult(() => this._repositories.get('nodes').insert(node)),
				createMany: async () => {
					throw new Error('insertMany not implemented');
				},
				update: (path, changes) =>
					this._wrapResult(async () => {
						const node = await this._repositories.get('nodes').findOne({ path });
						if (!node) throw new Error('Node not found');
						return await this._repositories.get('nodes').update(node._id, changes);
					}),
				bulkUpdate: (updates) =>
					this._wrapResult(async () => {
						await this._content.bulkUpdateNodes(updates);
						const paths = updates.map((u) => u.path);
						return await this._repositories.get('nodes').findMany({ path: { $in: paths } });
					}),
				fixMismatchedNodeIds: (nodes) => this._content.fixMismatchedNodeIds(nodes),
				delete: (path) =>
					this._wrapResult(async () => {
						const node = await this._repositories.get('nodes').findOne({ path });
						if (!node) throw new Error('Node not found');
						await this._repositories.get('nodes').delete(node._id);
					}),
				deleteMany: (paths) => this._wrapResult(() => this._repositories.get('nodes').deleteMany({ path: { $in: paths } })),
				reorder: (nodeUpdates) =>
					this._wrapResult(async () => {
						const updates = nodeUpdates.map(({ path, newOrder }) => ({ path, changes: { order: newOrder } }));
						await this._content.bulkUpdateNodes(updates);
						const paths = nodeUpdates.map((u) => u.path);
						return await this._repositories.get('nodes').findMany({ path: { $in: paths } });
					}),
				reorderStructure: (items) => this._wrapResult(() => this._content.reorderStructure(items))
			},
			drafts: {
				create: (draft) => this._wrapResult(() => this._content.createDraft(draft)),
				createMany: async () => {
					throw new Error('insertMany not implemented');
				},
				update: (id, data) => this._wrapResult(() => this._repositories.get('drafts').update(id, { data })),
				publish: async (id) => {
					const result = await this._wrapResult(() => this._content.publishManyDrafts([id]));
					if (!result.success) return result;
					return { success: true, data: void 0 };
				},
				publishMany: (ids) =>
					this._wrapResult(async () => {
						const result = await this._content.publishManyDrafts(ids);
						return { publishedCount: result.modifiedCount };
					}),
				getForContent: (contentId, options) => this._wrapResult(() => this._content.getDraftsForContent(contentId, options)),
				delete: async (id) => {
					const result = await this._wrapResult(() => this._repositories.get('drafts').delete(id));
					if (!result.success) return result;
					return { success: true, data: void 0 };
				},
				deleteMany: (ids) => this._wrapResult(() => this._repositories.get('drafts').deleteMany({ _id: { $in: ids } }))
			},
			revisions: {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				create: (revision) => this._wrapResult(() => this._content.createRevision(revision)),
				getHistory: (contentId, options) => this._wrapResult(() => this._content.getRevisionHistory(contentId, options)),
				restore: () =>
					this._wrapResult(async () => {
						throw new Error('Restore not yet implemented');
					}),
				delete: async (id) => {
					const result = await this._wrapResult(() => this._repositories.get('revisions').delete(id));
					if (!result.success) return result;
					return { success: true, data: void 0 };
				},
				deleteMany: (ids) => this._wrapResult(() => this._repositories.get('revisions').deleteMany({ _id: { $in: ids } })),
				cleanup: (contentId, keepLatest) => this._wrapResult(() => this._content.cleanupRevisions(contentId, keepLatest))
			}
		};
		this.crud = {
			findOne: (coll, query, options) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.findOne(query, options));
			},
			findMany: (coll, query, options) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.findMany(query, { limit: options?.limit, skip: options?.offset, fields: options?.fields }));
			},
			insert: (coll, data) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.insert(data));
			},
			update: (coll, id, data) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.update(id, data));
			},
			delete: (coll, id) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(async () => {
					await repo.delete(id);
				});
			},
			findByIds: (coll, ids) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.findByIds(ids));
			},
			insertMany: (coll, data) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.insertMany(data));
			},
			updateMany: (coll, query, data) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.updateMany(query, data));
			},
			deleteMany: (coll, query) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.deleteMany(query));
			},
			upsert: (coll, query, data) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.upsert(query, data));
			},
			upsertMany: (coll, items) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.upsertMany(items));
			},
			count: (coll, query) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.count(query));
			},
			exists: (coll, query) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(async () => (await repo.count(query)) > 0);
			},
			aggregate: (coll, pipeline) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.aggregate(pipeline));
			}
		};
		this.collection = {
			getModel: async (id) => {
				return await this._collectionMethods.getModel(id);
			},
			createModel: async (schema) => {
				await this._collectionMethods.createModel(schema);
			},
			updateModel: async (schema) => {
				await this._collectionMethods.updateModel(schema);
			},
			deleteModel: async (id) => {
				await this._collectionMethods.deleteModel(id);
			}
		};
	}
	_getRepository(collection) {
		const normalized = this.utils.normalizeCollectionName(collection);
		if (this._repositories.has(normalized)) {
			return this._repositories.get(normalized);
		}
		try {
			let model;
			if (mongoose.models[normalized]) {
				model = mongoose.models[normalized];
			} else {
				const schema = new mongoose.Schema({ _id: { type: String, required: true } }, { _id: false, strict: false, timestamps: true });
				model = mongoose.model(normalized, schema);
			}
			const repo = new MongoCrudMethods(model);
			this._repositories.set(normalized, repo);
			return repo;
		} catch (error2) {
			logger$1.error(`Failed to create repository for ${collection}`, error2);
			return null;
		}
	}
	_repoNotFound(collection) {
		return Promise.resolve({
			success: false,
			message: `Collection ${collection} not found`,
			error: { code: 'COLLECTION_NOT_FOUND', message: 'Collection not found' }
		});
	}
	async disconnect() {
		return this._wrapResult(() => mongoose.disconnect());
	}
	isConnected() {
		return mongoose.connection.readyState === 1;
	}
	async transaction(fn) {
		const session = await mongoose.startSession();
		session.startTransaction();
		try {
			const result = await fn({
				commit: async () => {
					await session.commitTransaction();
					return { success: true, data: void 0 };
				},
				rollback: async () => {
					await session.abortTransaction();
					return { success: true, data: void 0 };
				}
			});
			if (result.success) {
				await session.commitTransaction();
			} else {
				await session.abortTransaction();
			}
			return result;
		} catch (error2) {
			await session.abortTransaction();
			const dbError = this.utils.createDatabaseError(error2, 'TRANSACTION_ERROR', 'Transaction failed');
			return { success: false, error: dbError, message: dbError.message };
		} finally {
			session.endSession();
		}
	}
	batch = {
		/**
		 * Executes a batch of mixed operations (insert, update, delete, upsert) using MongoDB's native bulkWrite.
		 * Uses bulkWrite per collection instead of sequential operations (33x faster for 100 operations).
		 * Operations are grouped by collection and executed in parallel across different collections.
		 */
		execute: async (operations) => {
			if (operations.length === 0) {
				return {
					success: true,
					data: {
						success: true,
						results: [],
						totalProcessed: 0,
						errors: []
					}
				};
			}
			try {
				const opsByCollection = operations.reduce((acc, op, index) => {
					if (!acc[op.collection]) {
						acc[op.collection] = [];
					}
					acc[op.collection].push({ op, originalIndex: index });
					return acc;
				}, {});
				const allErrors = [];
				let totalSuccessful = 0;
				const collectionResults = await Promise.all(
					Object.entries(opsByCollection).map(async ([collectionName, opsWithIndex]) => {
						const repo = this._getRepository(collectionName);
						if (!repo) {
							const error2 = createDatabaseError(
								new Error(`Collection ${collectionName} not found`),
								'COLLECTION_NOT_FOUND',
								`Collection ${collectionName} not found during batch execution`
							);
							return {
								collectionName,
								success: false,
								error: error2,
								operations: opsWithIndex
							};
						}
						try {
							const bulkOps = opsWithIndex.map(({ op }) => {
								const now = /* @__PURE__ */ new Date();
								switch (op.operation) {
									case 'insert':
										return {
											insertOne: {
												document: {
													...op.data,
													_id: generateId(),
													createdAt: now,
													updatedAt: now
												}
											}
										};
									case 'update':
										return {
											updateOne: {
												filter: { _id: op.id },
												update: { $set: { ...op.data, updatedAt: now } }
											}
										};
									case 'delete':
										return {
											deleteOne: {
												filter: { _id: op.id }
											}
										};
									case 'upsert':
										return {
											updateOne: {
												filter: op.query,
												update: {
													$set: { ...op.data, updatedAt: now },
													$setOnInsert: { createdAt: now }
												},
												upsert: true
											}
										};
									default:
										throw new Error(`Unknown operation type: ${op.operation}`);
								}
							});
							const result = await repo.model.bulkWrite(bulkOps, {
								ordered: false
								// Don't stop on first error, process all operations
							});
							return {
								collectionName,
								success: true,
								result,
								operations: opsWithIndex
							};
						} catch (error2) {
							const dbError = createDatabaseError(error2, 'BULK_WRITE_ERROR', `Bulk write failed for collection ${collectionName}`);
							return {
								collectionName,
								success: false,
								error: dbError,
								operations: opsWithIndex
							};
						}
					})
				);
				const results = new Array(operations.length);
				let overallSuccess = true;
				for (const collectionResult of collectionResults) {
					if (collectionResult.success && collectionResult.result) {
						const successCount =
							(collectionResult.result.insertedCount || 0) +
							(collectionResult.result.modifiedCount || 0) +
							(collectionResult.result.deletedCount || 0) +
							(collectionResult.result.upsertedCount || 0);
						totalSuccessful += successCount;
						for (const { originalIndex } of collectionResult.operations) {
							results[originalIndex] = {
								success: true,
								data: {}
								// bulkWrite doesn't return individual documents
							};
						}
					} else if (collectionResult.error) {
						overallSuccess = false;
						allErrors.push(collectionResult.error);
						for (const { originalIndex } of collectionResult.operations) {
							results[originalIndex] = {
								success: false,
								message: collectionResult.error.message,
								error: collectionResult.error
							};
						}
					}
				}
				return {
					success: true,
					data: {
						success: overallSuccess,
						results,
						totalProcessed: totalSuccessful,
						errors: allErrors
					}
				};
			} catch (error2) {
				const dbError = createDatabaseError(error2, 'BATCH_EXECUTE_ERROR', 'Batch execution failed');
				return {
					success: false,
					message: dbError.message,
					error: dbError
				};
			}
		},
		bulkInsert: async (collection, items) => {
			const repo = this._getRepository(collection);
			if (!repo) return this._repoNotFound(collection);
			return this._wrapResult(() => repo.insertMany(items));
		},
		bulkUpdate: async (collection, updates) => {
			const repo = this._getRepository(collection);
			if (!repo) return this._repoNotFound(collection);
			const bulkOps = updates.map((u) => ({
				updateOne: {
					filter: { _id: u.id },
					update: u.data
				}
			}));
			return this._wrapResult(async () => {
				const result = await repo.model.bulkWrite(bulkOps);
				return { modifiedCount: result.modifiedCount };
			});
		},
		bulkDelete: async (collection, ids) => {
			const repo = this._getRepository(collection);
			if (!repo) return this._repoNotFound(collection);
			const result = await repo.deleteMany({ _id: { $in: ids } });
			return { success: true, data: { deletedCount: result.deletedCount || 0 } };
		},
		bulkUpsert: async (collection, items) => {
			const repo = this._getRepository(collection);
			if (!repo) return this._repoNotFound(collection);
			const bulkOps = items.map((item) => ({
				updateOne: {
					filter: { _id: item.id },
					update: { $set: item },
					upsert: true
				}
			}));
			return this._wrapResult(async () => {
				await repo.model.bulkWrite(bulkOps);
				return [];
			});
		}
	};
	systemVirtualFolder;
	performance = {
		getMetrics: async () => {
			try {
				const cacheSnapshot = cacheMetrics.getSnapshot();
				const dbStats = mongoose.connection.db ? await mongoose.connection.db.stats() : null;
				return {
					success: true,
					data: {
						queryCount: cacheSnapshot.totalRequests,
						averageQueryTime: cacheSnapshot.avgResponseTime,
						slowQueries: [],
						cacheHitRate: cacheSnapshot.hitRate,
						connectionPoolUsage: dbStats ? dbStats.connections || -1 : -1
					}
				};
			} catch (error2) {
				return {
					success: false,
					message: 'Failed to get performance metrics',
					error: createDatabaseError(error2, 'METRICS_ERROR', 'Failed to retrieve performance metrics')
				};
			}
		},
		clearMetrics: async () => {
			try {
				cacheMetrics.reset();
				logger$1.info('Performance metrics cleared');
				return { success: true, data: void 0 };
			} catch (error2) {
				return {
					success: false,
					message: 'Failed to clear metrics',
					error: createDatabaseError(error2, 'METRICS_CLEAR_ERROR', 'Failed to clear performance metrics')
				};
			}
		},
		enableProfiling: async (enabled) => {
			if (!mongoose.connection.db) {
				return { success: false, message: 'Not connected to DB', error: { code: 'DB_DISCONNECTED', message: 'Not connected' } };
			}
			const level = enabled ? 'all' : 'off';
			await mongoose.connection.db.setProfilingLevel(level);
			return { success: true, data: void 0 };
		},
		getSlowQueries: async (limit = 10) => {
			if (!mongoose.connection.db) {
				return { success: false, message: 'Not connected to DB', error: { code: 'DB_DISCONNECTED', message: 'Not connected' } };
			}
			const profileData = await mongoose.connection.db.collection('system.profile').find().limit(limit).toArray();
			const slowQueries = profileData.map((p) => {
				const doc = p;
				return {
					query: JSON.stringify(doc.command),
					duration: doc.millis,
					timestamp: doc.ts.toISOString()
				};
			});
			return { success: true, data: slowQueries };
		},
		getPoolDiagnostics: async () => {
			try {
				const { getDatabaseResilience } = await import('./DatabaseResilience.js');
				const resilience = getDatabaseResilience();
				const diagnostics = await resilience.getPoolDiagnostics();
				return { success: true, data: diagnostics };
			} catch (error2) {
				return {
					success: false,
					message: 'Failed to get pool diagnostics',
					error: createDatabaseError(error2, 'POOL_DIAGNOSTICS_ERROR', 'Failed to retrieve connection pool diagnostics')
				};
			}
		}
	};
	// Smart Cache Layer Integration with Multi-Tenant Support
	cache = {
		get: async (key) => {
			try {
				await cacheService.initialize();
				const value = await cacheService.get(key);
				logger$1.debug(`Cache get: ${key}`, { found: value !== null });
				return { success: true, data: value };
			} catch (error2) {
				logger$1.error('Cache get failed:', error2);
				return {
					success: false,
					message: 'Cache retrieval failed',
					error: createDatabaseError(error2, 'CACHE_GET_ERROR', 'Failed to get from cache')
				};
			}
		},
		set: async (key, value, options) => {
			try {
				await cacheService.initialize();
				const ttl = options?.ttl || 60;
				const tenantId = options?.tags?.find((tag) => tag.startsWith('tenant:'))?.replace('tenant:', '');
				await cacheService.set(key, value, ttl, tenantId);
				logger$1.debug(`Cache set: ${key}`, { ttl, tenantId });
				return { success: true, data: void 0 };
			} catch (error2) {
				logger$1.error('Cache set failed:', error2);
				return {
					success: false,
					message: 'Cache storage failed',
					error: createDatabaseError(error2, 'CACHE_SET_ERROR', 'Failed to set in cache')
				};
			}
		},
		delete: async (key) => {
			try {
				await cacheService.initialize();
				await cacheService.delete(key);
				logger$1.debug(`Cache delete: ${key}`);
				return { success: true, data: void 0 };
			} catch (error2) {
				logger$1.error('Cache delete failed:', error2);
				return {
					success: false,
					message: 'Cache deletion failed',
					error: createDatabaseError(error2, 'CACHE_DELETE_ERROR', 'Failed to delete from cache')
				};
			}
		},
		clear: async (tags) => {
			try {
				await cacheService.initialize();
				if (tags && tags.length > 0) {
					for (const tag of tags) {
						const tenantId = tag.startsWith('tenant:') ? tag.replace('tenant:', '') : void 0;
						const pattern = tenantId ? `*` : `*${tag}*`;
						await cacheService.clearByPattern(pattern, tenantId);
					}
					logger$1.debug(`Cache cleared for tags: ${tags.join(', ')}`);
				} else {
					await cacheService.clearByPattern('*');
					logger$1.warn('All cache cleared (global clear)');
				}
				return { success: true, data: void 0 };
			} catch (error2) {
				logger$1.error('Cache clear failed:', error2);
				return {
					success: false,
					message: 'Cache clear failed',
					error: createDatabaseError(error2, 'CACHE_CLEAR_ERROR', 'Failed to clear cache')
				};
			}
		},
		invalidateCollection: async (collection) => {
			try {
				await cacheService.initialize();
				const pattern = `collection:${collection}:*`;
				await cacheService.clearByPattern(pattern);
				logger$1.info(`Cache invalidated for collection: ${collection}`);
				return { success: true, data: void 0 };
			} catch (error2) {
				logger$1.error('Cache invalidation failed:', error2);
				return {
					success: false,
					message: 'Cache invalidation failed',
					error: createDatabaseError(error2, 'CACHE_INVALIDATE_ERROR', 'Failed to invalidate collection cache')
				};
			}
		}
	};
	async getCollectionData(collectionName, options) {
		const repo = this._getRepository(collectionName);
		if (!repo) return this._repoNotFound(collectionName);
		const data = await repo.findMany({}, { limit: options?.limit, skip: options?.offset });
		if (options?.includeMetadata) {
			const totalCount = await repo.count({});
			const schema = repo.model.schema.obj;
			const indexes = Object.keys(repo.model.schema.indexes());
			return {
				success: true,
				data: {
					data,
					metadata: {
						totalCount,
						schema,
						indexes
					}
				}
			};
		}
		return { success: true, data: { data } };
	}
	async getMultipleCollectionData(collectionNames, options) {
		const results = await Promise.all(
			collectionNames.map((name) =>
				this.getCollectionData(name, options).then((result) => ({
					name,
					success: result.success,
					data: result.success ? result.data.data : []
				}))
			)
		);
		const responseData = {};
		for (const result of results) {
			if (result.success) {
				responseData[result.name] = result.data;
			} else {
				logger$1.warn(`Failed to fetch data for collection: ${result.name}`);
				responseData[result.name] = [];
			}
		}
		return { success: true, data: responseData };
	}
}
export { MongoDBAdapter };
//# sourceMappingURL=mongoDBAdapter.js.map
