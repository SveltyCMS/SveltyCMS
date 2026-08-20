/**
 * @file src/databases/mongodb/system-virtual-folder.ts
 * @description MongoDB schema, model, and methods for System Virtual Folders.
 */

import type {
  DatabaseId,
  DatabaseResult,
  MediaItem,
  SystemVirtualFolder,
} from "@src/databases/db-interface";
import { generateId } from "@src/databases/mongodb/mongodb-utils";
import { nowISODateString } from "@utils/date";
import { getErrorMessage } from "@utils/error-handling";
import { logger } from "@utils/logger";
import mongoose, { type Model, Schema } from "mongoose";
import { MediaModel } from "./media";
import { createDatabaseError } from "./mongodb-utils";

export const systemVirtualFolderSchema = new Schema<SystemVirtualFolder>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    name: { type: String, required: true },
    path: { type: String, required: true, unique: true },
    parentId: { type: String, ref: "SystemVirtualFolder" },
    icon: { type: String, default: "bi:folder" },
    order: { type: Number, default: 0 },
    type: { type: String, enum: ["folder", "collection"], required: true },
    tenantId: { type: String, index: true },
    metadata: Schema.Types.Mixed,
    createdAt: { type: String, default: () => nowISODateString() },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: true,
    collection: "system_virtual_folders",
    strict: true,
    _id: false,
    statics: {
      async createVirtualFolder(
        folder: SystemVirtualFolder,
      ): Promise<DatabaseResult<SystemVirtualFolder>> {
        try {
          const existingFolder = await this.findOne({
            path: folder.path ?? `/${folder.name}`,
          });
          if (existingFolder) {
            const message = "Folder with this path already exists";
            return {
              success: false,
              message,
              error: {
                code: "VIRTUAL_FOLDER_DUPLICATE",
                message,
                details: { path: folder.path ?? `/${folder.name}` },
              },
            };
          }

          const newFolder = new this({
            ...folder,
            _id: folder._id,
            path: folder.path ?? `/${folder.name}`,
            type: "folder",
          });
          await newFolder.save();
          return { success: true, data: newFolder };
        } catch (error: any) {
          if (error?.code === 11_000) {
            const message = "Folder with this path already exists";
            return {
              success: false,
              message,
              error: {
                code: "VIRTUAL_FOLDER_DUPLICATE",
                message,
                details: { path: folder.path ?? `/${folder.name}` },
              },
            };
          }

          const message = "Failed to create virtual folder";
          logger.error(`Error creating virtual folder: ${getErrorMessage(error)}`);
          return {
            success: false,
            message,
            error: {
              code: "VIRTUAL_FOLDER_CREATE_FAILED",
              message: getErrorMessage(error),
            },
          };
        }
      },

      async getAllVirtualFolders(): Promise<DatabaseResult<SystemVirtualFolder[]>> {
        try {
          const folders = await this.find().sort({ order: 1, name: 1 });
          return { success: true, data: folders };
        } catch (error) {
          const message = "Failed to fetch virtual folders";
          logger.error(`Error fetching virtual folders: ${getErrorMessage(error)}`);
          return {
            success: false,
            message,
            error: {
              code: "VIRTUAL_FOLDER_FETCH_FAILED",
              message: getErrorMessage(error),
            },
          };
        }
      },

      async getVirtualFolderByPath(
        path: string,
      ): Promise<DatabaseResult<SystemVirtualFolder | null>> {
        try {
          const folder = await this.findOne({ path });
          return { success: true, data: folder };
        } catch (error) {
          const message = "Failed to fetch virtual folder";
          logger.error(`Error fetching virtual folder: ${getErrorMessage(error)}`);
          return {
            success: false,
            message,
            error: {
              code: "VIRTUAL_FOLDER_FETCH_FAILED",
              message: getErrorMessage(error),
            },
          };
        }
      },

      async getVirtualFolderChildren(
        parentId: string,
      ): Promise<DatabaseResult<SystemVirtualFolder[]>> {
        try {
          const folders = await this.find({ parentId } as any).sort({
            order: 1,
            name: 1,
          });
          return { success: true, data: folders };
        } catch (error) {
          const message = "Failed to fetch child virtual folders";
          logger.error(`Error fetching child virtual folders: ${getErrorMessage(error)}`);
          return {
            success: false,
            message,
            error: {
              code: "VIRTUAL_FOLDER_FETCH_FAILED",
              message: getErrorMessage(error),
            },
          };
        }
      },

      async bulkUpdateFolderOrder(
        updates: Array<{ id: string; order: number }>,
      ): Promise<DatabaseResult<void>> {
        try {
          const bulkOps = updates.map((update) => ({
            updateOne: {
              filter: { _id: update.id },
              update: { $set: { order: update.order } },
            },
          }));

          await this.bulkWrite(bulkOps as any);
          return { success: true, data: undefined };
        } catch (error) {
          const message = "Failed to update folder order";
          logger.error(`Error updating folder order: ${getErrorMessage(error)}`);
          return {
            success: false,
            message,
            error: {
              code: "VIRTUAL_FOLDER_UPDATE_FAILED",
              message: getErrorMessage(error),
            },
          };
        }
      },

      async exists(path: string): Promise<DatabaseResult<boolean>> {
        try {
          const count = await this.countDocuments({ path });
          return { success: true, data: count > 0 };
        } catch (error) {
          const message = "Failed to check folder existence";
          logger.error(`Error checking folder existence: ${getErrorMessage(error)}`);
          return {
            success: false,
            message,
            error: {
              code: "VIRTUAL_FOLDER_EXISTS_FAILED",
              message: getErrorMessage(error),
            },
          };
        }
      },

      async updateVirtualFolder(
        id: string,
        update: Partial<SystemVirtualFolder>,
      ): Promise<DatabaseResult<SystemVirtualFolder | null>> {
        try {
          const folder = await this.findByIdAndUpdate(id, update, {
            new: true,
          });
          return { success: true, data: folder };
        } catch (error) {
          const message = "Failed to update virtual folder";
          logger.error(`Error updating virtual folder: ${getErrorMessage(error)}`);
          return {
            success: false,
            message,
            error: {
              code: "VIRTUAL_FOLDER_UPDATE_FAILED",
              message: getErrorMessage(error),
            },
          };
        }
      },

      async deleteVirtualFolder(id: string): Promise<DatabaseResult<void>> {
        try {
          await this.deleteMany({
            $or: [{ _id: id }, { parentId: id }],
          } as any);
          return { success: true, data: undefined };
        } catch (error) {
          const message = "Failed to delete virtual folder";
          logger.error(`Error deleting virtual folder: ${getErrorMessage(error)}`);
          return {
            success: false,
            message,
            error: {
              code: "VIRTUAL_FOLDER_DELETE_FAILED",
              message: getErrorMessage(error),
            },
          };
        }
      },
    },
  },
);

export const SystemVirtualFolderModel =
  (mongoose.models?.SystemVirtualFolder as Model<SystemVirtualFolder> | undefined) ||
  mongoose.model<SystemVirtualFolder>("SystemVirtualFolder", systemVirtualFolderSchema);

export class MongoSystemVirtualFolderMethods {
  constructor(
    private readonly folderModel: Model<SystemVirtualFolder> = SystemVirtualFolderModel,
    private readonly mediaModel: Model<MediaItem> = MediaModel,
  ) {}

  async create(
    folder: Omit<SystemVirtualFolder, "_id" | "createdAt" | "updatedAt">,
    tenantId?: string | null,
  ): Promise<DatabaseResult<SystemVirtualFolder>> {
    try {
      const ID = generateId();
      const newFolder = new this.folderModel({
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

      const result = await this.folderModel
        .findOneAndUpdate(
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
      const folder = await this.folderModel.findOne(query).lean().exec();
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
      const folders = await this.folderModel.find(query).lean().exec();
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
      const folders = await this.folderModel.find(query).lean().exec();
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

      const updatedFolder = await this.folderModel
        .findOneAndUpdate(query, { $set: updateData }, { returnDocument: "after" })
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

      const folderRes = await this.folderModel
        .findOne(query, {
          _id: 1,
        })
        .lean()
        .exec();
      if (!folderRes) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Target folder not found" },
          message: "Folder not found",
        };
      }
      const foundFolderId = folderRes._id;

      const folderCheckResult = await this.getById(foundFolderId, tenantId);
      if (!folderCheckResult.success || !folderCheckResult.data) {
        return {
          success: false,
          error: {
            code: "FOLDER_DELETED",
            message: "Target folder was deleted after lookup.",
          },
          message: "Target folder no longer exists.",
        };
      }

      const updateQuery: any = { _id: contentId };
      if (tenantId) updateQuery.tenantId = tenantId;
      const result = await this.mediaModel.updateOne(updateQuery, {
        $set: { folderId: foundFolderId },
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
      const folder = await this.folderModel.findOne(query).lean().exec();

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
        this.folderModel.find(subQuery).lean().exec(),
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

      const folderToDelete = await this.folderModel.findOne(query).lean().exec();
      if (!folderToDelete) {
        return {
          success: false,
          message: "Folder not found or access denied",
          error: { code: "NOT_FOUND", message: "Folder not found" },
        };
      }

      await this._cascadeDelete(folderId, tenantId);
      await this.folderModel.deleteOne(query).exec();
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

  private async _cascadeDelete(folderId: DatabaseId, tenantId?: string | null): Promise<void> {
    const subQuery: any = { parentId: folderId };
    if (tenantId) subQuery.tenantId = tenantId;
    const subfolders = await this.folderModel.find(subQuery, { _id: 1 }).lean().exec();

    for (const sub of subfolders) {
      await this.delete(sub._id, tenantId);
    }

    const mediaQuery: any = { folderId };
    if (tenantId) mediaQuery.tenantId = tenantId;
    await MediaModel.updateMany(mediaQuery, { $set: { folderId: null } });
  }

  async exists(path: string, tenantId?: string | null): Promise<DatabaseResult<boolean>> {
    try {
      const query: any = { path };
      if (tenantId) query.tenantId = tenantId;
      const doc = await this.folderModel.findOne(query, { _id: 1 }).lean().exec();
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
