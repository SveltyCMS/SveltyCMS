/**
 * @file src/databases/mongodb/methods/systemVirtualFolderMethods.ts
 * @description Methods for managing system virtual folders in MongoDB.
 */

import type { DatabaseId, DatabaseResult, SystemVirtualFolder, MediaItem } from '@src/databases/dbInterface';
import { SystemVirtualFolderModel } from '../models/systemVirtualFolder';
import { generateId, createDatabaseError } from './mongoDBUtils';
import { MediaModel } from '../models';

/**
 * MongoSystemVirtualFolderMethods provides virtual folder management for MongoDB.
 * Implements the systemVirtualFolder interface from IDBAdapter.
 */
export class MongoSystemVirtualFolderMethods {
	async create(folder: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<SystemVirtualFolder>> {
		try {
			const _id = generateId();
			const newFolder = new SystemVirtualFolderModel({
				...folder,
				_id
			});
			const savedFolder = await newFolder.save();
			return { success: true, data: savedFolder.toObject() };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'VIRTUAL_FOLDER_CREATE_ERROR', 'Failed to create virtual folder'),
				message: 'Failed to create virtual folder'
			};
		}
	}

	async getById(folderId: DatabaseId): Promise<DatabaseResult<SystemVirtualFolder | null>> {
		try {
			const folder = await SystemVirtualFolderModel.findById(folderId).lean().exec();
			return { success: true, data: folder as SystemVirtualFolder | null };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'VIRTUAL_FOLDER_GET_ERROR', 'Failed to get virtual folder by ID'),
				message: 'Failed to get virtual folder by ID'
			};
		}
	}

	async getByParentId(parentId: DatabaseId | null): Promise<DatabaseResult<SystemVirtualFolder[]>> {
		try {
			const folders = await SystemVirtualFolderModel.find({ parentId: parentId ?? null })
				.lean()
				.exec();
			return { success: true, data: folders as SystemVirtualFolder[] };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'VIRTUAL_FOLDER_GET_ERROR', 'Failed to get virtual folders by parent ID'),
				message: 'Failed to get virtual folders by parent ID'
			};
		}
	}

	async getAll(): Promise<DatabaseResult<SystemVirtualFolder[]>> {
		try {
			const folders = await SystemVirtualFolderModel.find({}).lean().exec();
			return { success: true, data: folders as SystemVirtualFolder[] };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'VIRTUAL_FOLDER_GET_ERROR', 'Failed to get all virtual folders'),
				message: 'Failed to get all virtual folders'
			};
		}
	}

	async update(folderId: DatabaseId, updateData: Partial<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>> {
		try {
			const updatedFolder = await SystemVirtualFolderModel.findByIdAndUpdate(folderId, updateData, { new: true }).lean().exec();
			if (!updatedFolder) {
				return { success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' }, message: 'Folder not found' };
			}
			return { success: true, data: updatedFolder as SystemVirtualFolder };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'VIRTUAL_FOLDER_UPDATE_ERROR', 'Failed to update virtual folder'),
				message: 'Failed to update virtual folder'
			};
		}
	}

	async addToFolder(contentId: DatabaseId, folderPath: string): Promise<DatabaseResult<void>> {
		// This seems to be more related to media files, not generic content
		try {
			const folder = await SystemVirtualFolderModel.findOne({ path: folderPath }).lean().exec();
			if (!folder) {
				return { success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' }, message: 'Folder not found' };
			}
			await MediaModel.findByIdAndUpdate(contentId, { folderId: folder._id });
			return { success: true, data: undefined };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'VIRTUAL_FOLDER_ADD_ERROR', 'Failed to add content to virtual folder'),
				message: 'Failed to add content to virtual folder'
			};
		}
	}

	/**
	 * Gets the contents of a virtual folder (subfolders and files).
	 * Uses Promise.all to fetch subfolders and files in parallel (2x faster).
	 */
	async getContents(folderPath: string): Promise<DatabaseResult<{ folders: SystemVirtualFolder[]; files: MediaItem[] }>> {
		try {
			const folder = await SystemVirtualFolderModel.findOne({ path: folderPath }).lean().exec();

			// 🚀 Run these two independent queries in parallel
			const [subfolders, files] = await Promise.all([
				SystemVirtualFolderModel.find({ parentId: folder?._id }).lean().exec(),
				MediaModel.find({ folderId: folder?._id }).lean().exec()
			]);

			return { success: true, data: { folders: subfolders as SystemVirtualFolder[], files: files as MediaItem[] } };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'VIRTUAL_FOLDER_CONTENTS_ERROR', 'Failed to get virtual folder contents'),
				message: 'Failed to get virtual folder contents'
			};
		}
	}

	async delete(folderId: DatabaseId): Promise<DatabaseResult<void>> {
		try {
			// This should probably be a recursive delete or prevent deleting non-empty folders
			await SystemVirtualFolderModel.findByIdAndDelete(folderId).exec();
			return { success: true, data: undefined };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'VIRTUAL_FOLDER_DELETE_ERROR', 'Failed to delete virtual folder'),
				message: 'Failed to delete virtual folder'
			};
		}
	}

	/**
	 * Checks if a virtual folder exists at the given path.
	 * Uses findOne with projection instead of countDocuments for faster execution.
	 */
	async exists(path: string): Promise<DatabaseResult<boolean>> {
		try {
			// Use findOne with projection for optimal performance
			const doc = await SystemVirtualFolderModel.findOne({ path }, { _id: 1 }).lean().exec();
			return { success: true, data: !!doc };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'VIRTUAL_FOLDER_EXISTS_ERROR', 'Failed to check if virtual folder exists'),
				message: 'Failed to check if virtual folder exists'
			};
		}
	}
}
