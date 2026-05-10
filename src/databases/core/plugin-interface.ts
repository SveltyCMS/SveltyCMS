/**
 * @file src/databases/core/plugin-interface.ts
 * @description Interface for database-aware initialization plugins.
 */

import type { IDBAdapter } from "../db-interface";

export interface DBInitPlugin {
  /**
   * Unique identifier for the plugin (e.g., 'auth', 'media', 'seo')
   */
  id: string;

  /**
   * List of plugin IDs that must be initialized before this one.
   */
  dependencies?: string[];

  /**
   * If true, failure to initialize this plugin will halt the system boot.
   */
  critical?: boolean;

  /**
   * Initialization logic for the service.
   */
  initialize(adapter: IDBAdapter): Promise<void>;
}
