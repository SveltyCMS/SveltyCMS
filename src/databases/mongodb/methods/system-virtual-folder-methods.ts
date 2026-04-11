/**
 * @file src/databases/mongodb/methods/system-virtual-folder-methods.ts
 * @description Methods for managing system virtual folders in MongoDB.
 */

import type {
  DatabaseId,
  DatabaseResult,
  MediaItem,
  SystemVirtualFolder,
} from "@src/databases/db-interface";
import { MediaModel } from "../models";
import { SystemVirtualFolderModel } from "../models/system-virtual-folder";
import { createDatabaseError, generateId } from "./mongodb-utils";

/**
 * MongoSystemVirtualFolderMethods provides virtual folder management for MongoDB.
 * Implements the systemVirtualFolder interface from IDBAdapter.
 */
export class MongoSystemVirtualFolderMethods {
  async create(
    folder: Omit<SystemVirtualFolder, "_id" | "createdAt" | "updatedAt">,
    tenantId?: string | null,
  ): Promise<DatabaseResult<SystemVirtualFolder>> {
    try {
      const ID = generateId();
      const newFolder = new SystemVirtualFolderModel({
        ...folder,
        _id: ID,
        ...(tenantId && { tenantId }),
      });
      const savedFolder = await newFolder.save();
      return { success: true, data: savedFolder.toObject() };
    } catch (error) {
      return {
        success: false,
        error: createDatabaseError(
          error,
          "VIRTUAL_FOLDER_CREATE_ERROR",
          "Failed to create virtual folder",
        ),
        message: "Failed to create virtual folder",
      };
    }
  }

  async ensure(
    folder: Omit<SystemVirtualFolder, "_id" | "createdAt" | "updatedAt">,
    tenantId?: string | null,
  ): Promise<DatabaseResult<SystemVirtualFolder>> {
    try {
      const query: any = { path: folder.path };
      if (tenantId) query.tenantId = tenantId;

      const result = await SystemVirtualFolderModel.findOneAndUpdate(
        query,
        {
          $setOnInsert: {
            ...folder,
            _id: generateId(),
            ...(tenantId && { tenantId }),
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      )
        .lean()
        .exec();

      return { success: true, data: result as SystemVirtualFolder };
    } catch (error) {
      return {
        success: false,
        error: createDatabaseError(
          error,
          "VIRTUAL_FOLDER_ENSURE_ERROR",
          "Failed to ensure virtual folder",
        ),
        message: "Failed to ensure virtual folder",
      };
    }
  }

  async getById(
    folderId: DatabaseId,
    tenantId?: string | null,
  ): Promise<DatabaseResult<SystemVirtualFolder | null>> {
    try {
      const query: any = { _id: folderId };
      if (tenantId) query.tenantId = tenantId;
      const folder = await SystemVirtualFolderModel.findOne(query).lean().exec();
      return { success: true, data: folder as SystemVirtualFolder | null };
    } catch (error) {
      return {
        success: false,
        error: createDatabaseError(
          error,
          "VIRTUAL_FOLDER_GET_ERROR",
          "Failed to get virtual folder by ID",
        ),
        message: "Failed to get virtual folder by ID",
      };
    }
  }

  async getByParentId(
    parentId: DatabaseId | null,
    tenantId?: string | null,
  ): Promise<DatabaseResult<SystemVirtualFolder[]>> {
    try {
      const query: any = { parentId: parentId ?? null };
      if (tenantId) query.tenantId = tenantId;
      const folders = await SystemVirtualFolderModel.find(query).lean().exec();
      return { success: true, data: folders as SystemVirtualFolder[] };
    } catch (error) {
      return {
        success: false,
        error: createDatabaseError(
          error,
          "VIRTUAL_FOLDER_GET_ERROR",
          "Failed to get virtual folders by parent ID",
        ),
        message: "Failed to get virtual folders by parent ID",
      };
    }
  }

  async getAll(tenantId?: string | null): Promise<DatabaseResult<SystemVirtualFolder[]>> {
    try {
      const query: any = {};
      if (tenantId) query.tenantId = tenantId;
      const folders = await SystemVirtualFolderModel.find(query).lean().exec();
      return { success: true, data: folders as SystemVirtualFolder[] };
    } catch (error) {
      return {
        success: false,
        error: createDatabaseError(
          error,
          "VIRTUAL_FOLDER_GET_ERROR",
          "Failed to get all virtual folders",
        ),
        message: "Failed to get all virtual folders",
      };
    }
  }

  async update(
    folderId: DatabaseId,
    updateData: Partial<SystemVirtualFolder>,
    tenantId?: string | null,
  ): Promise<DatabaseResult<SystemVirtualFolder>> {
    try {
      const query: any = { _id: folderId };
      if (tenantId) query.tenantId = tenantId;
      const updatedFolder = await SystemVirtualFolderModel.findOneAndUpdate(query, updateData, {
        returnDocument: "after",
      })
        .lean()
        .exec();
      if (!updatedFolder) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Folder not found or access denied",
          },
          message: "Folder not found",
        };
      }
      return { success: true, data: updatedFolder as SystemVirtualFolder };
    } catch (error) {
      return {
        success: false,
        error: createDatabaseError(
          error,
          "VIRTUAL_FOLDER_UPDATE_ERROR",
          "Failed to update virtual folder",
        ),
        message: "Failed to update virtual folder",
      };
    }
  }

  async addToFolder(
    contentId: DatabaseId,
    folderPath: string,
    tenantId?: string | null,
  ): Promise<DatabaseResult<void>> {
    try {
      const query: any = { path: folderPath };
      if (tenantId) query.tenantId = tenantId;
      const folder = await SystemVirtualFolderModel.findOne(query).lean().exec();
      if (!folder) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Folder not found" },
          message: "Folder not found",
        };
      }

      const updateQuery: any = { _id: contentId };
      if (tenantId) updateQuery.tenantId = tenantId;
      const result = await MediaModel.updateOne(updateQuery, {
        $set: { folderId: folder._id },
      });

      if (result.matchedCount === 0) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Media item not found or access denied",
          },
          message: "Media item not found",
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: createDatabaseError(
          error,
          "VIRTUAL_FOLDER_ADD_ERROR",
          "Failed to add content to virtual folder",
        ),
        message: "Failed to add content to virtual folder",
      };
    }
  }

  async getContents(
    folderPath: string,
    tenantId?: string | null,
  ): Promise<DatabaseResult<{ folders: SystemVirtualFolder[]; files: MediaItem[] }>> {
    try {
      const query: any = { path: folderPath };
      if (tenantId) query.tenantId = tenantId;
      const folder = await SystemVirtualFolderModel.findOne(query).lean().exec();

      if (!folder) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Folder at path "${folderPath}" not found`,
          },
          message: "Folder not found",
        };
      }

      const subQuery: any = { parentId: folder._id };
      if (tenantId) subQuery.tenantId = tenantId;
      const fileQuery: any = { folderId: folder._id };
      if (tenantId) fileQuery.tenantId = tenantId;

      const [subfolders, files] = await Promise.all([
        SystemVirtualFolderModel.find(subQuery).lean().exec(),
        MediaModel.find(fileQuery).lean().exec(),
      ]);

      return {
        success: true,
        data: {
          folders: subfolders as SystemVirtualFolder[],
          files: files as MediaItem[],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: createDatabaseError(
          error,
          "VIRTUAL_FOLDER_CONTENTS_ERROR",
          "Failed to get virtual folder contents",
        ),
        message: "Failed to get virtual folder contents",
      };
    }
  }

  async delete(folderId: DatabaseId, tenantId?: string | null): Promise<DatabaseResult<void>> {
    try {
      const query: any = { _id: folderId };
      if (tenantId) query.tenantId = tenantId;
      const res = await SystemVirtualFolderModel.deleteOne(query).exec();
      if (res.deletedCount === 0) {
        return {
          success: false,
          message: "Folder not found or access denied",
          error: { code: "NOT_FOUND", message: "Folder not found" },
        };
      }
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: createDatabaseError(
          error,
          "VIRTUAL_FOLDER_DELETE_ERROR",
          "Failed to delete virtual folder",
        ),
        message: "Failed to delete virtual folder",
      };
    }
  }

  async exists(path: string, tenantId?: string | null): Promise<DatabaseResult<boolean>> {
    try {
      const query: any = { path };
      if (tenantId) query.tenantId = tenantId;
      const doc = await SystemVirtualFolderModel.findOne(query, { _id: 1 }).lean().exec();
      return { success: true, data: !!doc };
    } catch (error) {
      return {
        success: false,
        error: createDatabaseError(
          error,
          "VIRTUAL_FOLDER_EXISTS_ERROR",
          "Failed to check if virtual folder exists",
        ),
        message: "Failed to check if virtual folder exists",
      };
    }
  }
}
