/**
 * @file src/databases/agnostic-core/schema-proxy.ts
 * @description
 * Dynamic proxy layer for schema-driven database operations.
 * Enables db.users.find() style syntax by bridging collection definitions
 * to the underlying CRUD adapter.
 */

import type { IDBAdapter } from "../db-interface";
import { toDbId } from "@src/utils/db-id";

/**
 * Creates a proxy that exposes collection-specific methods on the database adapter.
 * Uses a more surgical approach to avoid intercepting internal properties or breaking optional chaining.
 */
export function createSchemaProxy(adapter: IDBAdapter): any {
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (value !== undefined) {
        return typeof value === "function" ? value.bind(target) : value;
      }

      // 2. Safeguard: return undefined for internal/meta properties to support optional chaining
      if (
        typeof prop !== "string" ||
        prop.startsWith("_") ||
        prop.startsWith("$") ||
        prop === "then" ||
        prop === "constructor" ||
        prop === "prototype" ||
        prop === "toJSON" ||
        prop === "reconcile"
      ) {
        return undefined;
      }

      // 3. Logic: If property is not found, we treat it as a virtual collection access.
      // But we only do this if it doesn't look like a camelCase method (optional chaining check).
      const isCollectionName = /^[a-z]/.test(prop) && !/[A-Z]/.test(prop);
      const isForcedCollection = prop.startsWith("collection_");

      if (isCollectionName || isForcedCollection) {
        return {
          find: (options?: any) => target.crud.findMany(prop, options?.filter || {}, options),
          findById: (id: string, options?: any) =>
            target.crud.findOne(prop, { _id: toDbId(id) } as any, options),
          create: (data: any, options?: any) => target.crud.insert(prop, data, options),
          update: (id: string, data: any, options?: any) =>
            target.crud.update(prop, toDbId(id), data, options),
          delete: (id: string, options?: any) => target.crud.delete(prop, toDbId(id), options),
          count: (filter: any, options?: any) => target.crud.count(prop, filter, options),
        };
      }

      // 4. Return undefined for everything else to allow natural behavior
      return undefined;
    },

    // Optional: accurately report that these virtual collections "exist"
    has(target, prop) {
      if (prop in target) return true;
      if (typeof prop === "string" && !prop.startsWith("_") && !prop.startsWith("$")) return true;
      return false;
    },
  });
}
