/**
 * @file src/services/background/jobs/scheduled-jobs.ts
 * @description Background job handler for publishing scheduled content.
 */

import { getDb } from "@src/databases/db";
import { StatusTypes } from "@src/content/types";
import { logger } from "@utils/logger";
import { webhookService } from "../webhook-service";
import type { JobHandler } from "./job-queue-service";

export const scheduledPublishHandler: JobHandler = async (_payload, _job) => {
  const db = getDb();
  if (!db) return;

  // 1. Connection & Capability Guards
  if (typeof db.isConnected === "function" && !db.isConnected()) return;
  const caps = typeof db.getCapabilities === "function" ? db.getCapabilities() : null;
  if (caps && !caps.supportsAggregation) return;

  // 2. Ensure content module is ready
  if (db.ensureContent) {
    try {
      await db.ensureContent();
    } catch {
      return;
    }
  }

  // 3. Find scheduled items
  const result = await db.content.nodes.getStructure("flat", {
    filter: { status: StatusTypes.schedule } as any,
    bypassTenantCheck: true,
  });

  if (!(result.success && result.data)) return;

  const now = Date.now();
  const nodesToPublish = result.data.filter((node) => {
    const n = node as any;
    const scheduledTime = n.data?._scheduled || n._scheduled;
    return scheduledTime && Number(scheduledTime) <= now;
  });

  if (nodesToPublish.length === 0) return;

  logger.info(`[ScheduledJob] Found ${nodesToPublish.length} items ready for publishing`);

  // 4. Publish items
  for (const node of nodesToPublish) {
    try {
      logger.info(`[ScheduledJob] Publishing scheduled item: ${node.name} (${node._id})`);

      const updateData = {
        status: StatusTypes.publish,
        data: {
          ...(node as any).data,
          _scheduled: null,
        },
        updatedAt: new Date().toISOString(),
      };

      if (node.path) {
        await db.content.nodes.update(node.path, updateData as any);
        webhookService.trigger(
          "entry:publish",
          {
            id: node._id,
            collection: node.collectionDef?.name || "unknown",
            title: node.name,
          },
          node.tenantId || "",
        );
      } else {
        logger.warn(`[ScheduledJob] Node ${node._id} has no path, skipping publish`);
      }
    } catch (err) {
      logger.error(`[ScheduledJob] Failed to publish scheduled item ${node._id}:`, err);
    }
  }
};
