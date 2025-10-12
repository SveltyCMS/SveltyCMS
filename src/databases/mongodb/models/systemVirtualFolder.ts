/**
 * @file src/databases/mongodb/models/systemVirtualFolder.ts
 * @description MongoDB schema and model for System Virtual Folders.
 *
 * This module defines a schema and model for virtual folders in the system.
 * Virtual folders are used to organize content in a hierarchical structure.
 */
import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import type { SystemVirtualFolder, DatabaseResult } from '@src/databases/dbInterface';
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';
import { nowISODateString } from '@utils/dateUtils';

import { getErrorMessage } from '@utils/errorHandling';

// System Logger
import { logger } from '@utils/logger.svelte';

// System virtual folder schema
export const systemVirtualFolderSchema = new Schema<SystemVirtualFolder>(
	{
		_id: { type: String, required: true, default: () => generateId() }, // UUID primary key
		name: { type: String, required: true },
		path: { type: String, required: true, unique: true },
		parentId: { type: String, ref: 'SystemVirtualFolder' }, // Reference to parent folder
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
		strict: true, // Enforce strict schema validation
		_id: false, // Disable Mongoose auto-ObjectId generation
		statics: {
			async createVirtualFolder(folder: SystemVirtualFolder): Promise<DatabaseResult<SystemVirtualFolder>> {
				try {
					// First check if folder with same path already exists
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
						_id: folder._id, // Ensure _id is set after spread to avoid duplication warning
						path: folder.path ?? `/${folder.name}`,
						type: 'folder'
					});
					await newFolder.save();
					return { success: true, data: newFolder };
				} catch (error: unknown) {
					// Handle duplicate key error specifically
					if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000) {
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

					const message = 'Failed to create virtual folder';
					logger.error(`Error creating virtual folder: ${getErrorMessage(error)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_CREATE_ERROR',
							message,
							details: error
						}
					};
				}
			},

			async getAllVirtualFolders(): Promise<DatabaseResult<SystemVirtualFolder[]>> {
				try {
					const folders = (await this.find({}).lean().exec()) as SystemVirtualFolder[];
					return { success: true, data: folders };
				} catch (error) {
					const message = 'Failed to retrieve virtual folders';
					logger.error(`Error retrieving virtual folders: ${getErrorMessage(error)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_GET_ERROR',
							message,
							details: error
						}
					};
				}
			}, // Get virtual folder by path
			async getVirtualFolderByPath(path: string): Promise<DatabaseResult<SystemVirtualFolder | null>> {
				try {
					const folder = (await this.findOne({ path }).lean().exec()) as SystemVirtualFolder | null;
					if (!folder) {
						return { success: true, data: null }; // Explicitly return null for "not found" case
					}
					logger.debug(`Retrieved virtual folder by path: ${path}`);
					return { success: true, data: folder };
				} catch (error) {
					const message = `Failed to retrieve virtual folder for path: ${path}`;
					logger.error(`Error retrieving virtual folder by path: ${getErrorMessage(error)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_GET_ERROR',
							message
						}
					};
				}
			}, // Get children of a virtual folder
			async getVirtualFolderChildren(parentPath: string): Promise<DatabaseResult<SystemVirtualFolder[]>> {
				try {
					const folders = (await this.find({ path: { $regex: `^${parentPath}/[^/]+$` } })
						.sort({ order: 1 })
						.lean()
						.exec()) as SystemVirtualFolder[];
					logger.debug(`Retrieved children for virtual folder path: ${parentPath}`);
					return { success: true, data: folders };
				} catch (error) {
					const message = `Failed to retrieve children for path: ${parentPath}`;
					logger.error(`Error retrieving virtual folder children: ${getErrorMessage(error)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_CHILDREN_ERROR',
							message
						}
					};
				}
			}, // Bulk update folder order
			async bulkUpdateFolderOrder(parentId: string, orderUpdates: Array<{ path: string; order: number }>): Promise<DatabaseResult<number>> {
				try {
					const bulkOps = orderUpdates.map((update) => ({
						updateOne: {
							filter: { path: update.path, parentId: parentId },
							update: { $set: { order: update.order } }
						}
					}));
					const result = await this.bulkWrite(bulkOps);
					logger.info(`Updated order for ${result.modifiedCount} virtual folders under parent: ${parentId}`);
					return { success: true, data: result.modifiedCount };
				} catch (error) {
					const message = 'Failed to bulk update folder order';
					logger.error(`Error bulk updating virtual folder order: ${getErrorMessage(error)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_ORDER_UPDATE_ERROR',
							message,
							details: error
						}
					};
				}
			}, // Check if folder with given path exists
			async exists(path: string): Promise<DatabaseResult<boolean>> {
				try {
					const count = await this.countDocuments({ path });
					return { success: true, data: count > 0 };
				} catch (error) {
					const message = 'Failed to check folder existence';
					logger.error(`Error checking folder existence: ${getErrorMessage(error)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_CHECK_ERROR',
							message,
							details: error
						}
					};
				}
			}, // Update a virtual folder
			async updateVirtualFolder(folderId: string, updateData: Partial<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>> {
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
					return { success: true, data: folder as SystemVirtualFolder };
				} catch (error) {
					const message = 'Failed to update virtual folder';
					logger.error(`Error updating virtual folder: ${getErrorMessage(error)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_UPDATE_ERROR',
							message,
							details: error
						}
					};
				}
			}, // Delete a virtual folder and its children recursively
			async deleteVirtualFolder(folderId: string): Promise<DatabaseResult<void>> {
				try {
					const folder = await this.findById(folderId).lean().exec();
					if (!folder) {
						return { success: true, data: undefined }; // Already deleted
					}

					// Find all children and grandchildren recursively based on path
					const children = await this.find({ path: { $regex: `^${folder.path}/` } })
						.lean()
						.exec();
					const folderIdsToDelete = [folder._id, ...children.map((c: SystemVirtualFolder) => c._id)];

					await this.deleteMany({ _id: { $in: folderIdsToDelete } });

					return { success: true, data: undefined };
				} catch (error) {
					const message = 'Failed to delete virtual folder';
					logger.error(`Error deleting virtual folder: ${getErrorMessage(error)}`);
					return {
						success: false,
						message,
						error: {
							code: 'VIRTUAL_FOLDER_DELETE_ERROR',
							message,
							details: error
						}
					};
				}
			}
		}
	}
);

// Indexes
systemVirtualFolderSchema.index({ parentId: 1 });
systemVirtualFolderSchema.index({ type: 1 });
systemVirtualFolderSchema.index({ order: 1 });

// Create and export the SystemVirtualFolderModel
export const SystemVirtualFolderModel =
	(mongoose.models?.SystemVirtualFolder as Model<SystemVirtualFolder> | undefined) ||
	mongoose.model<SystemVirtualFolder>('SystemVirtualFolder', systemVirtualFolderSchema);
