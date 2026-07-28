/**
 * @file src/plugins/storage/types.ts
 * @description Type definitions for the Plugin Storage primitive.
 *
 * Provides a generic key-value/document store scoped by (plugin, collection)
 * so plugins can persist arbitrary JSON records without custom database tables.
 *
 * ### Features:
 * - Generic record storage typed by plugin and logical collection
 * - Multi-tenant isolation via optional tenantId
 * - Standard CRUD operations (create, get, list, delete)
 * - Uses the shared `plugin_storage` table — zero provisioning per plugin
 */

import type { ISODateString } from "@src/databases/db-interface";

/**
 * A single record stored in the plugin storage system.
 */
export interface StorageRecord<T = any> {
  /** Unique record identifier */
  _id: string;
  /** Plugin that owns this record (e.g., 'seo-audit', 'pagespeed') */
  plugin: string;
  /** Logical collection name within the plugin (e.g., 'results', 'reports') */
  collectionName: string;
  /** Tenant isolation (null for single-tenant) */
  tenantId?: string;
  /** Arbitrary JSON payload stored by the plugin */
  data: T;
  /** ISO-8601 creation timestamp */
  createdAt: ISODateString;
  /** ISO-8601 last-update timestamp */
  updatedAt: ISODateString;
}

/**
 * Options for creating a plugin storage record.
 */
export interface CreateRecordOptions {
  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
}

/**
 * Options for querying plugin storage records.
 */
export interface ListRecordsOptions {
  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
  /** Optional field-level filter (applied to the `data` field) */
  filter?: Record<string, unknown>;
  /** Maximum records to return (default: 50) */
  limit?: number;
  /** Number of records to skip (default: 0) */
  offset?: number;
}

/**
 * Options for single-record operations (get / delete).
 */
export interface RecordOperationOptions {
  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
}

/**
 * PluginStorageAdapter interface.
 *
 * Plugins receive an instance of this adapter at boot and use it to persist
 * arbitrary JSON records scoped by (plugin, collection) without creating
 * custom database tables.
 */
export interface PluginStorageAdapter {
  /**
   * Create a new storage record.
   * Returns the created record with its generated _id and timestamps.
   */
  createRecord<T = any>(
    plugin: string,
    collection: string,
    data: T,
    options?: CreateRecordOptions,
  ): Promise<StorageRecord<T>>;

  /**
   * Retrieve a single storage record by its ID.
   * Returns null if no record is found.
   */
  getRecord<T = any>(
    plugin: string,
    collection: string,
    recordId: string,
    options?: RecordOperationOptions,
  ): Promise<StorageRecord<T> | null>;

  /**
   * List storage records for a given (plugin, collection) pair.
   * Supports pagination and optional field-level filtering.
   */
  listRecords<T = any>(
    plugin: string,
    collection: string,
    options?: ListRecordsOptions,
  ): Promise<{ data: StorageRecord<T>[]; total: number }>;

  /**
   * Delete a single storage record by its ID.
   * Returns true if a record was deleted, false if not found.
   */
  deleteRecord(
    plugin: string,
    collection: string,
    recordId: string,
    options?: RecordOperationOptions,
  ): Promise<boolean>;
}
