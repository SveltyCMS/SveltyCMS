/**
 * @file src/databases/mariadb/crud/crud-module.ts
 * @description CRUD operations module for MariaDB, inheriting from RelationalCrudModule.
 */

import { sql } from "drizzle-orm";
import { safeQuery } from "@src/utils/security/safe-query";
import type { BaseEntity, DatabaseResult, ICrudAdapter } from "../../db-interface";
import { RelationalCrudModule } from "../../relational/modules/relational-crud-module";
import type { AdapterCore } from "../adapter/adapter-core";
import * as utils from "../utils";

export class CrudModule extends RelationalCrudModule implements ICrudAdapter {
  constructor(core: AdapterCore) {
    super(core as any);
  }

  /**
   * 🚀 OPTIMIZATION: MariaDB-specific findOne with prepared statement support.
   */
  async findOne<T extends BaseEntity>(
    collection: string,
    query: any,
    options: any = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(async () => {
        const secureQuery = safeQuery(query, options.tenantId, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
        });

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID lookups
        if (this.isLookupQuery(secureQuery) && !options?.tx) {
          const table = this.adapter.getTable(collection);
          const cacheKey = `findOne:${collection}`;

          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            const { and, eq, placeholder } = await import("drizzle-orm");
            prepared = (this.adapter as any).db
              .select()
              .from(table as any)
              .where(
                and(
                  eq((table as any)._id, placeholder("id")),
                  eq((table as any).tenantId, placeholder("tenantId")),
                ),
              )
              .prepare();
            this.preparedStatements.set(cacheKey, prepared);
          }

          const results = await prepared.execute({
            id: secureQuery._id,
            tenantId: secureQuery.tenantId || options.tenantId,
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

  async find<T extends BaseEntity>(
    collection: string,
    query: any,
    options: any = {},
  ): Promise<DatabaseResult<T[]>> {
    if (options.rawSql && options.sql) {
      const startTime = performance.now();
      return this.adapter
        .wrap(async () => {
          const db = options?.tx || (this.adapter as any).db;
          const results = await db.execute(sql.raw(options.sql));
          return utils.convertArrayDatesToISO(results[0] as Record<string, unknown>[]) as T[];
        }, "CRUD_FIND_FAILED")
        .then((res: any) => {
          if (res.success) res.meta = { executionTime: performance.now() - startTime };
          return res;
        });
    }

    return super.find(collection, query, options);
  }
}
