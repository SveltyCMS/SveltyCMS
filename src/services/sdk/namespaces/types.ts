/**
 * @file src/services/local-cms/types.ts
 * @description Common types for LocalCMS SDK namespaces.
 */

import type { DatabaseId } from "@src/databases/db-interface";
import type { CollectionMap } from "@src/content/types";

export interface LocalApiOptions {
  user?: any;
  tenantId?: DatabaseId | null;
  permanent?: boolean;
  bypassCache?: boolean;
  bypassRequestCache?: boolean;
  system?: boolean;
  skipValidation?: boolean;
  disableErrors?: boolean;
  populate?: string[];
}

export interface TokenOptions extends LocalApiOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

/**
 * Type-safe proxy for collection operations.
 */
export type CollectionProxy = {
  [K in keyof CollectionMap]: {
    find(options?: any): Promise<any>;
    findById(id: string, options?: any): Promise<any>;
    create(data: Partial<CollectionMap[K]>, options?: any): Promise<any>;
    update(id: string, data: Partial<CollectionMap[K]>, options?: any): Promise<any>;
    delete(id: string, options?: any): Promise<any>;
    queryBuilder(options?: any): any;
  };
};
