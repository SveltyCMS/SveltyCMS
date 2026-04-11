/**
 * @file src/databases/postgresql/modules/system/jobs-module.ts
 * @description Background jobs module for PostgreSQL.
 */

import { and, eq, lte, sql } from "drizzle-orm";
import type {
  DatabaseId,
  DatabaseResult,
  EntityCreate,
  Job,
  PaginationOption,
} from "../../../db-interface";
import type { AdapterCore } from "../../adapter/adapter-core";
import * as schema from "../../schema";
import * as utils from "../../utils";

export class JobsModule {
  private readonly core: AdapterCore;

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db;
  }

  async create(job: EntityCreate<Job>): Promise<DatabaseResult<Job>> {
    return this.core.wrap(async () => {
      const id = utils.generateId();
      const now = new Date();
      const values: typeof schema.sveltyJobs.$inferInsert = {
        ...(job as any),
        _id: id,
        payload: job.payload as any,
        createdAt: now,
        updatedAt: now,
      };
      await this.db!.insert(schema.sveltyJobs).values(values);
      const [result] = await this.db!.select()
        .from(schema.sveltyJobs)
        .where(eq(schema.sveltyJobs._id, id));
      return result as unknown as Job;
    }, "JOB_CREATE_FAILED");
  }

  async getById(jobId: DatabaseId): Promise<DatabaseResult<Job | null>> {
    return this.core.wrap(async () => {
      const [result] = await this.db!.select()
        .from(schema.sveltyJobs)
        .where(eq(schema.sveltyJobs._id, jobId as string));
      return (result as unknown as Job) || null;
    }, "JOB_GET_FAILED");
  }

  async getNextReady(limit = 10, tenantId?: string | null): Promise<DatabaseResult<Job[]>> {
    return this.core.wrap(async () => {
      const conditions = [
        eq(schema.sveltyJobs.status, "pending"),
        lte(schema.sveltyJobs.nextRunAt, new Date()),
      ];
      if (tenantId) {
        conditions.push(eq(schema.sveltyJobs.tenantId, tenantId));
      }

      const results = await this.db!.select()
        .from(schema.sveltyJobs)
        .where(and(...conditions))
        .orderBy(schema.sveltyJobs.nextRunAt)
        .limit(limit);

      return results as unknown as Job[];
    }, "JOB_FETCH_READY_FAILED");
  }

  async list(
    options?: PaginationOption & { status?: string; taskType?: string },
  ): Promise<DatabaseResult<Job[]>> {
    return this.core.wrap(async () => {
      let q = this.db!.select().from(schema.sveltyJobs).$dynamic();
      const conditions = [];

      if (options?.status) {
        conditions.push(eq(schema.sveltyJobs.status, options.status));
      }
      if (options?.taskType) {
        conditions.push(eq(schema.sveltyJobs.taskType, options.taskType));
      }

      if (conditions.length > 0) {
        q = q.where(and(...conditions));
      }

      q = q.orderBy(sql`${schema.sveltyJobs.createdAt} DESC`);

      if (options?.limit) q = q.limit(options.limit);
      if (options?.offset) q = q.offset(options.offset);

      const results = await q;
      return results as unknown as Job[];
    }, "JOB_LIST_FAILED");
  }

  async count(filter?: Record<string, unknown>): Promise<DatabaseResult<number>> {
    return this.core.wrap(async () => {
      let q = this.db!.select({ count: sql<number>`count(*)` })
        .from(schema.sveltyJobs)
        .$dynamic();
      const conditions = [];

      if (filter?.status) {
        conditions.push(eq(schema.sveltyJobs.status, filter.status as string));
      }
      if (filter?.taskType) {
        conditions.push(eq(schema.sveltyJobs.taskType, filter.taskType as string));
      }

      if (conditions.length > 0) {
        q = q.where(and(...conditions));
      }

      const [result] = await q;
      return Number(result?.count) || 0;
    }, "JOB_COUNT_FAILED");
  }

  async update(jobId: DatabaseId, data: Partial<EntityCreate<Job>>): Promise<DatabaseResult<Job>> {
    return this.core.wrap(async () => {
      const now = new Date();
      await this.db!.update(schema.sveltyJobs)
        .set({ ...data, updatedAt: now } as any)
        .where(eq(schema.sveltyJobs._id, jobId as string));

      const [result] = await this.db!.select()
        .from(schema.sveltyJobs)
        .where(eq(schema.sveltyJobs._id, jobId as string));
      return result as unknown as Job;
    }, "JOB_UPDATE_FAILED");
  }

  async delete(jobId: DatabaseId): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      await this.db!.delete(schema.sveltyJobs).where(eq(schema.sveltyJobs._id, jobId as string));
    }, "JOB_DELETE_FAILED");
  }

  async cleanup(olderThan: Date): Promise<DatabaseResult<number>> {
    return this.core.wrap(async () => {
      const result = await this.db!.delete(schema.sveltyJobs).where(
        lte(schema.sveltyJobs.createdAt, olderThan),
      );
      return (result as any).count || 0;
    }, "JOB_CLEANUP_FAILED");
  }
}
