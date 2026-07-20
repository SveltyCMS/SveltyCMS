/**
 * @file src/databases/mongodb/models/outbox.ts
 * @description MongoDB schema and model for Transactional Outbox Events.
 *
 * The outbox collection stores events that must be delivered atomically with
 * the data changes that caused them. A background poller reads pending events
 * and dispatches them via the pub/sub system.
 */

import { generateId } from "@src/databases/mongodb/mongodb-utils";
import { nowISODateString } from "@utils/date";
import type { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";
import type { OutboxEvent } from "@src/services/outbox/outbox-service";

export const outboxSchema = new Schema<OutboxEvent>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    tenantId: { type: String, required: true },
    eventType: { type: String, required: true },
    aggregateType: { type: String, required: true },
    aggregateId: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "delivered", "failed"],
      default: "pending",
    },
    createdAt: { type: String, default: () => nowISODateString() },
    deliveredAt: { type: String },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: true,
    collection: "svelty_outbox",
    strict: true,
    _id: false,
  },
);

// --- Indexes ---
outboxSchema.index({ status: 1, createdAt: 1 });
outboxSchema.index({ tenantId: 1, status: 1 });
outboxSchema.index({ eventType: 1 });

export type OutboxModelType = Model<OutboxEvent>;

export const OutboxModel =
  (mongoose.models?.OutboxEvent as OutboxModelType | undefined) ||
  mongoose.model<OutboxEvent, OutboxModelType>("OutboxEvent", outboxSchema);
