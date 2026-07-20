/**
 * @file src/plugins/storage/index.ts
 * @description Plugin Storage primitive — barrel exports.
 */

export {
  PluginStorageAdapterImpl,
  PLUGIN_STORAGE_COLLECTION,
  matchesPluginStorageFilter,
  normalizeStorageRecord,
} from "./plugin-storage-adapter";
export type {
  PluginStorageAdapter,
  StorageRecord,
  CreateRecordOptions,
  ListRecordsOptions,
  RecordOperationOptions,
} from "./types";
