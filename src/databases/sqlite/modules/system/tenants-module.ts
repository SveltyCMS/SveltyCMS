/**
 * @file src/databases/sqlite/modules/system/tenants-module.ts
 * @description Tenants management module for SQLite
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date";
import { eq } from "drizzle-orm";
import type { DatabaseId, DatabaseResult, Tenant } from "../../../db-interface";
import type { AdapterCore } from "../../adapter/adapter-core";
import * as schema from "../../schema";
import * as utils from "../../utils";
import { DatabaseModule } from "../../../base-adapter";

export class TenantsModule extends DatabaseModule<AdapterCore> {
  constructor(core: AdapterCore) {
    super(core);
  }

  protected get core() {
    return this.adapter;
  }

  async create(
    tenant: Omit<Tenant, "_id" | "createdAt" | "updatedAt"> & { _id?: DatabaseId },
  ): Promise<DatabaseResult<Tenant>> {
    return this.core.wrap(async () => {
      const id = tenant._id || utils.generateId();
      const now = isoDateStringToDate(nowISODateString());

      await this.db.insert(schema.tenants).values({
        _id: id,
        name: tenant.name,
        ownerId: tenant.ownerId,
        status: tenant.status || "active",
        plan: tenant.plan || "free",
        quota: tenant.quota as any,
        usage: tenant.usage as any,
        settings: tenant.settings as any,
        createdAt: now,
        updatedAt: now,
      });

      const [created] = await this.db
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants._id, id));

      return utils.convertDatesToISO(created) as unknown as Tenant;
    }, "CREATE_TENANT_FAILED");
  }

  async getById(tenantId: DatabaseId): Promise<DatabaseResult<Tenant | null>> {
    return this.core.wrap(async () => {
      const [tenant] = await this.db
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants._id, tenantId))
        .limit(1);

      return tenant ? (utils.convertDatesToISO(tenant) as unknown as Tenant) : null;
    }, "GET_TENANT_FAILED");
  }

  async update(
    tenantId: DatabaseId,
    data: Partial<Omit<Tenant, "_id" | "createdAt" | "updatedAt">>,
  ): Promise<DatabaseResult<Tenant>> {
    return this.core.wrap(async () => {
      await this.db
        .update(schema.tenants)
        .set({
          ...data,
          updatedAt: isoDateStringToDate(nowISODateString()),
        } as any)
        .where(eq(schema.tenants._id, tenantId));

      const [updated] = await this.db
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants._id, tenantId))
        .limit(1);

      return utils.convertDatesToISO(updated) as unknown as Tenant;
    }, "UPDATE_TENANT_FAILED");
  }

  async delete(tenantId: DatabaseId): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      await this.db.delete(schema.tenants).where(eq(schema.tenants._id, tenantId));
    }, "DELETE_TENANT_FAILED");
  }

  async list(options: any = {}): Promise<DatabaseResult<Tenant[]>> {
    return this.core.wrap(async () => {
      let q = this.db.select().from(schema.tenants).$dynamic();

      if (options.limit) q = q.limit(options.limit);
      if (options.skip) q = q.offset(options.skip);

      const results = await q;
      return utils.convertArrayDatesToISO(results) as unknown as Tenant[];
    }, "LIST_TENANTS_FAILED");
  }
}
