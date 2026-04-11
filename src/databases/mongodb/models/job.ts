/**
 * @file src/databases/mongodb/models/job.ts
 * @description MongoDB schema and model for Background Jobs.
 */

import type { DatabaseResult, Job, PaginationOption } from "@src/databases/db-interface";
import { generateId } from "@src/databases/mongodb/methods/mongodb-utils";
import { nowISODateString } from "@utils/date-utils";
import { logger } from "@utils/logger";
import type { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";

export const jobSchema = new Schema<Job>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    taskType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true, default: {} },
    status: {
      type: String,
      required: true,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextRunAt: { type: String, default: () => nowISODateString() },
    lastError: { type: String },
    tenantId: { type: String },
    createdAt: { type: String, default: () => nowISODateString() },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: true,
    collection: "system_jobs",
    strict: true,
    _id: false,
  },
);

// --- Indexes ---
jobSchema.index({ status: 1, nextRunAt: 1 });
jobSchema.index({ tenantId: 1, status: 1 });

// Static methods
jobSchema.statics = {
  async getNextReady(limit = 10, tenantId: string | null = null): Promise<DatabaseResult<Job[]>> {
    try {
      const query: any = {
        status: "pending",
        nextRunAt: { $lte: nowISODateString() },
      };
      if (tenantId) query.tenantId = tenantId;

      const jobs = await this.find(query).sort({ nextRunAt: 1 }).limit(limit).lean().exec();
      return { success: true, data: jobs as unknown as Job[] };
    } catch (error) {
      const err = error as Error;
      logger.error(`Error fetching next ready jobs: ${err.message}`);
      return {
        success: false,
        message: "Failed to fetch ready jobs",
        error: { code: "JOB_FETCH_ERROR", message: err.message },
      };
    }
  },

  async list(
    options?: PaginationOption & { status?: string; taskType?: string },
  ): Promise<DatabaseResult<Job[]>> {
    try {
      const query: any = {};
      if (options?.status) query.status = options.status;
      if (options?.taskType) query.taskType = options.taskType;

      let q = this.find(query).sort({ createdAt: -1 });

      if (options?.limit) q = q.limit(options.limit);
      if (options?.offset) q = q.skip(options.offset);

      const jobs = await q.lean().exec();
      return { success: true, data: jobs as unknown as Job[] };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        message: "Failed to list jobs",
        error: { code: "JOB_LIST_ERROR", message: err.message },
      };
    }
  },

  async count(filter?: Record<string, unknown>): Promise<DatabaseResult<number>> {
    try {
      const query: any = {};
      if (filter?.status) query.status = filter.status;
      if (filter?.taskType) query.taskType = filter.taskType;

      const count = await this.countDocuments(query);
      return { success: true, data: count };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        message: "Failed to count jobs",
        error: { code: "JOB_COUNT_ERROR", message: err.message },
      };
    }
  },
};

export type JobModelType = Model<Job> & {
  getNextReady(limit?: number, tenantId?: string | null): Promise<DatabaseResult<Job[]>>;
  list(
    options?: PaginationOption & { status?: string; taskType?: string },
  ): Promise<DatabaseResult<Job[]>>;
  count(filter?: Record<string, unknown>): Promise<DatabaseResult<number>>;
};

export const JobModel =
  (mongoose.models?.Job as JobModelType | undefined) ||
  mongoose.model<Job, JobModelType>("Job", jobSchema);
