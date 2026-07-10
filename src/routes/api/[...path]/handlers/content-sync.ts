/**
 * @file src/routes/api/[...path]/handlers/content-sync.ts
 * @description Content sync handler — handles `/api/content-sync/*` routes.
 *
 * Content sync is an optional, explicit mechanism for controlled content movement
 * between environments. Disabled by default. Requires explicit channel configuration.
 *
 * ### Features:
 * - Channel-based sync configuration (source, target, collections)
 * - Push and pull operations with plan preview
 * - PII anonymization for production-to-development pulls
 * - Background job dispatching for large sync operations
 *
 * ### Rules:
 * - Disabled by default
 * - Requires explicit channel configuration
 * - Must support anonymization when pulling production data into lower environments
 * - Must never move secrets, sessions, or users without explicit enterprise safeguards
 */

import { AppError } from "@utils/error-handling";
import { type RequestEvent } from "@sveltejs/kit";
import { successResponse, errorResponse } from "./base";
import type { DatabaseId } from "@src/content/types";
import type { LocalCMS } from "@src/services/sdk";

/**
 * Handle content sync routes under `/api/content-sync/*`.
 */
export async function handleContentSyncRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;
  const action = segments[1]; // e.g., "channels", "plan", "push", "pull", "jobs"
  const user = event.locals.user as Record<string, any> | undefined;
  const userId = (user?._id ?? user?.id ?? "system") as string;

  // ─────────────────────────────────────────────────────────────────────────
  // Channel Management
  // ─────────────────────────────────────────────────────────────────────────

  // ── GET /api/content-sync/channels ─────────────────────────────────────
  if (action === "channels" && request.method === "GET") {
    try {
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      const channels = await contentSyncService.listChannels(tenantId as string);
      return successResponse(event, { channels });
    } catch (err) {
      return errorResponse(
        event,
        err instanceof Error ? err.message : "Failed to list channels.",
        500,
        "LIST_FAILED",
      );
    }
  }

  // ── POST /api/content-sync/channels ────────────────────────────────────
  if (action === "channels" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    if (!body.label || !body.source || !body.target || !body.collections) {
      return errorResponse(
        event,
        "label, source, target, and collections are required to create a channel.",
        400,
        "MISSING_PARAM",
      );
    }

    try {
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      const channel = await contentSyncService.createChannel({
        label: body.label,
        source: body.source,
        target: body.target,
        collections: body.collections,
        direction: body.direction,
        enabled: body.enabled,
        anonymizeOnPull: body.anonymizeOnPull,
        conflictStrategy: body.conflictStrategy,
      });
      return successResponse(event, channel, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create channel.";
      return errorResponse(event, message, 500, "CREATE_FAILED");
    }
  }

  // ── PATCH /api/content-sync/channels/:channelId ────────────────────────
  if (action === "channels" && request.method === "PATCH") {
    const channelId = segments[2];
    if (!channelId) {
      return errorResponse(
        event,
        "channelId is required as a path parameter.",
        400,
        "MISSING_PARAM",
      );
    }

    const body = await request.json().catch(() => ({}));

    try {
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      const channel = await contentSyncService.updateChannel(channelId, body);
      return successResponse(event, channel);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update channel.";
      const status = message.includes("not found") ? 404 : 400;
      return errorResponse(event, message, status, "UPDATE_FAILED");
    }
  }

  // ── DELETE /api/content-sync/channels/:channelId ───────────────────────
  if (action === "channels" && request.method === "DELETE") {
    const channelId = segments[2];
    if (!channelId) {
      return errorResponse(
        event,
        "channelId is required as a path parameter.",
        400,
        "MISSING_PARAM",
      );
    }

    try {
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      await contentSyncService.deleteChannel(channelId);
      return successResponse(event, { message: "Channel deleted." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete channel.";
      const status = message.includes("not found") ? 404 : 500;
      return errorResponse(event, message, status, "DELETE_FAILED");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sync Operations
  // ─────────────────────────────────────────────────────────────────────────

  // ── POST /api/content-sync/plan ────────────────────────────────────────
  if (action === "plan" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    if (!body.channelId) {
      return errorResponse(event, "channelId is required.", 400, "MISSING_PARAM");
    }

    try {
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      const plan = await contentSyncService.createSyncPlan(body.channelId, {
        locale: body.locale,
        relationDepth: body.relationDepth,
        includeMedia: body.includeMedia,
        userId,
      });
      return successResponse(event, { plan });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create sync plan.";
      const code = message.includes("not enabled")
        ? "CHANNEL_DISABLED"
        : message.includes("not found")
          ? "NOT_FOUND"
          : "PLAN_FAILED";
      const status = code === "CHANNEL_DISABLED" ? 400 : code === "NOT_FOUND" ? 404 : 400;
      return errorResponse(event, message, status, code);
    }
  }

  // ── POST /api/content-sync/push ────────────────────────────────────────
  if (action === "push" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    if (!body.channelId) {
      return errorResponse(event, "channelId is required.", 400, "MISSING_PARAM");
    }

    try {
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      const result = await contentSyncService.pushContent(body.channelId, {
        adminConfirmation: body.adminConfirmation ?? body.confirmed,
        userId,
        locale: body.locale,
        relationDepth: body.relationDepth,
        includeMedia: body.includeMedia,
      });

      if (!result.success) {
        return errorResponse(event, result.message, 400, "PUSH_FAILED");
      }

      return successResponse(event, {
        jobId: result.jobId ?? null,
        message: result.message,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to push content.";
      return errorResponse(event, message, 500, "PUSH_FAILED");
    }
  }

  // ── POST /api/content-sync/pull ────────────────────────────────────────
  if (action === "pull" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    if (!body.channelId) {
      return errorResponse(event, "channelId is required.", 400, "MISSING_PARAM");
    }

    try {
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      const result = await contentSyncService.pullContent(body.channelId, {
        anonymize: body.anonymize,
        userId,
        locale: body.locale,
        relationDepth: body.relationDepth,
        includeMedia: body.includeMedia,
      });

      if (!result.success) {
        return errorResponse(event, result.message, 400, "PULL_FAILED");
      }

      return successResponse(event, {
        jobId: result.jobId ?? null,
        message: result.message,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to pull content.";
      return errorResponse(event, message, 500, "PULL_FAILED");
    }
  }

  // ── GET /api/content-sync/jobs/:jobId ──────────────────────────────────
  if (action === "jobs" && request.method === "GET") {
    const jobId = segments[2];
    if (!jobId) {
      return errorResponse(event, "jobId is required as a path parameter.", 400, "MISSING_PARAM");
    }

    try {
      const { contentSyncService } = await import("@src/services/core/content-sync-service");
      const status = await contentSyncService.getJobStatus(jobId);

      if (!status) {
        return errorResponse(event, `Job "${jobId}" not found.`, 404, "JOB_NOT_FOUND");
      }

      return successResponse(event, status);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get job status.";
      return errorResponse(event, message, 500, "JOB_FAILED");
    }
  }

  // ── Fallback ───────────────────────────────────────────────────────────
  throw new AppError(
    `Content sync action "${action || "(none)"}" with method ${request.method} is not implemented`,
    404,
  );
}
