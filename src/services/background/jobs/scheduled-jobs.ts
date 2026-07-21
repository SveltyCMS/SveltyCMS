/**
 * @file src/services/background/jobs/scheduled-jobs.ts
 * @description Background job handler for publishing scheduled content.
 */

import { getDb } from "@src/databases/db";
import { StatusTypes } from "@src/content/types";
import { logger } from "@utils/logger";
import { webhookService } from "../webhook-service";
import { cacheService } from "@src/databases/cache/cache-service";
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

  const { withSystemScope } = await import("@src/databases/system-tenant-scope");
  const systemOpts = withSystemScope("scheduler");

  // 3. Find scheduled items
  const result = await db.content.nodes.getStructure("flat", {
    filter: { status: StatusTypes.schedule } as any,
    ...systemOpts,
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

  // 4a. Validate relation fields — ensure no referenced entries are still draft
  const allNodesResult = await db.content.nodes.getStructure("flat", {
    ...systemOpts,
  });
  const nodeStatusById = new Map<string, string>();
  if (allNodesResult.success && allNodesResult.data) {
    for (const n of allNodesResult.data) {
      nodeStatusById.set((n as any)._id, (n as any).status || StatusTypes.draft);
    }
  }

  const NODE_ID_REGEX = /^[0-9a-fA-F]{24}$/;
  const validNodes: typeof nodesToPublish = [];

  for (const node of nodesToPublish) {
    const nodeData = (node as any).data || {};
    const relationIds = new Set<string>();

    // Collect potential relation IDs from the node's data fields
    for (const value of Object.values(nodeData)) {
      if (typeof value === "string" && NODE_ID_REGEX.test(value)) {
        relationIds.add(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string" && NODE_ID_REGEX.test(item)) {
            relationIds.add(item);
          }
        }
      }
    }

    // Check if any related entry is still in draft status
    let hasDraftRelation = false;
    for (const relId of relationIds) {
      const relStatus = nodeStatusById.get(relId);
      if (relStatus === StatusTypes.draft) {
        logger.warn(
          `[ScheduledJob] Skipping publish of "${node.name}" (${node._id}) — ` +
            `related entry ${relId} is still in draft status`,
        );
        hasDraftRelation = true;
        break;
      }
    }

    if (!hasDraftRelation) {
      validNodes.push(node);
    }
  }

  if (validNodes.length === 0) {
    logger.info(`[ScheduledJob] No items passed relation validation, nothing to publish`);
    return;
  }

  if (validNodes.length < nodesToPublish.length) {
    logger.info(
      `[ScheduledJob] Proceeding with ${validNodes.length} of ${nodesToPublish.length} items after relation validation`,
    );
  }

  // 4b. Publish validated items
  for (const node of validNodes) {
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

        // Invalidate cache for this collection after successful publish
        await cacheService
          .invalidateCollection(node.collectionDef?.name || "unknown")
          .catch(() => {});
      } else {
        logger.warn(`[ScheduledJob] Node ${node._id} has no path, skipping publish`);
      }
    } catch (err) {
      logger.error(`[ScheduledJob] Failed to publish scheduled item ${node._id}:`, err);
    }
  }
};
