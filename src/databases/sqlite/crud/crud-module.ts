/**
 * @file src/databases/sqlite/crud/crud-module.ts
 * @description CRUD operations module for SQLite, inheriting from RelationalCrudModule.
 */

import { eq, placeholder, and } from "drizzle-orm";
import { safeQuery } from "@src/utils/security/safe-query";
import type { BaseEntity, DatabaseResult } from "../../db-interface";
import { RelationalCrudModule } from "../../relational/modules/relational-crud-module";
import type { AdapterCore } from "../adapter/adapter-core";
import * as utils from "../utils";

export class CrudModule extends RelationalCrudModule {
  constructor(core: AdapterCore) {
    super(core as any);
  }

  /**
   * 🚀 OPTIMIZATION: SQLite-specific findOne with prepared statement support.
   */
  async findOne<T extends BaseEntity>(
    collection: string,
    query: any,
    options: any = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(async () => {
        const table = this.adapter.getTable(collection);
        const hasIsDeleted = (table as any).isDeleted !== undefined;

        const secureQuery = safeQuery(query, options.tenantId, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted || !hasIsDeleted,
        });

        // Use prepared statements for ID lookups if not in a transaction
        if (this.isLookupQuery(secureQuery) && !options?.transaction) {
          const table = this.adapter.getTable(collection);
          const cacheKey = `findOne:${collection}`;

          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            const tenantCol = (table as any).tenantId || (table as any).userId;
            const conditions = [eq((table as any)._id, placeholder("id"))];
            if (tenantCol) conditions.push(eq(tenantCol, placeholder("tenantId")));

            prepared = this.getDb(options)
              .select()
              .from(table as any)
              .where(and(...conditions))
              .prepare();
            this.preparedStatements.set(cacheKey, prepared);
          }

          const results = await prepared.all({
            id: secureQuery._id,
            tenantId: secureQuery.tenantId || options.tenantId || "global",
          });

          return results.length === 0
            ? null
            : (utils.convertDatesToISO(results[0] as Record<string, unknown>) as T);
        }

        return super.findOne(collection, query, options);
      }, "CRUD_FIND_ONE_FAILED")
      .then((res: any) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }
}
