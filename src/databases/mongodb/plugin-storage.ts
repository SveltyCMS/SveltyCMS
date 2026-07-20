/**
 * @file src/databases/mongodb/plugin-storage.ts
 * @description MongoDB schema for plugin storage records.
 *
 * Shared collection for arbitrary plugin JSON documents, scoped by
 * (plugin, collection, tenantId) — mirrors the SQL `plugin_storage` table.
 */

import { generateId } from "@src/databases/mongodb/mongodb-utils";
import { nowISODateString } from "@utils/date";
import type { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";

export interface PluginStorageDoc {
  _id: string;
  plugin: string;
  collection: string;
  tenantId?: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const pluginStorageSchema = new Schema<PluginStorageDoc>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    plugin: { type: String, required: true, index: true },
    collection: { type: String, required: true, index: true },
    tenantId: { type: String, default: null, index: true },
    data: { type: Schema.Types.Mixed, required: true, default: {} },
    createdAt: { type: String, default: () => nowISODateString() },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: false,
    collection: "plugin_storage",
    strict: true,
    _id: false,
  },
);

pluginStorageSchema.index({ plugin: 1, collection: 1, tenantId: 1 });
pluginStorageSchema.index({ plugin: 1, collection: 1 });

export type PluginStorageModelType = Model<PluginStorageDoc>;

export const PluginStorageModel =
  (mongoose.models?.PluginStorage as PluginStorageModelType | undefined) ||
  mongoose.model<PluginStorageDoc, PluginStorageModelType>("PluginStorage", pluginStorageSchema);
