/**
 * @file src/routes/api/[...path]/handlers/backups.ts
 * @description Backup and disaster recovery handler — handles `/api/backups/*` routes.
 *
 * Backups are disaster-recovery artifacts with manifest, checksums, restore plans,
 * and maintenance-lock-gated restore operations. Not designed for git-friendly diffs.
 *
 * ### Features:
 * - Encrypted backup archives with manifest and checksums
 * - Restore plan with dry-run preview
 * - Maintenance lock during restore
 * - Tenant-scoped backup and restore
 * - Cross-adapter backup format
 * - Background job dispatching for large backups/restores
 */

import { AppError } from "@utils/error-handling";
import { type RequestEvent } from "@sveltejs/kit";
import { successResponse, errorResponse } from "./base";
import type { DatabaseId } from "@src/content/types";
import type { LocalCMS } from "@src/services/sdk";

/**
 * Handle backup routes under `/api/backups/*`.
 */
export async function handleBackupRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;
  const action = segments[1];
  const user = event.locals.user as Record<string, any> | undefined;
  const userId = (user?._id ?? user?.id ?? "system") as string;

  // ── GET /api/backups ────────────────────────────────────────────────────
  if (!action && request.method === "GET") {
    const { backupService } = await import("@src/services/core/backup-service");
    const result = await backupService.listBackups(tenantId as string);
    if (!result.success) {
      return errorResponse(event, result.message, 500);
    }
    return successResponse(event, { backups: result.backups, message: result.message });
  }

  // ── POST /api/backups/create ────────────────────────────────────────────
  if (action === "create" && request.method === "POST") {
    const { backupService } = await import("@src/services/core/backup-service");
    const body = await request.json().catch(() => ({}));

    const result = await backupService.createBackup({
      tenantId: tenantId as string,
      userId,
      includeMedia: body.includeMedia ?? false,
      encryptionKey: body.encrypt ? body.encryptionKey : undefined,
      label: body.label,
      background: body.background,
    });

    if (!result.success) {
      return errorResponse(event, result.message, 500);
    }

    return successResponse(event, {
      jobId: result.jobId ?? null,
      backupPath: result.backupPath ?? null,
      manifest: result.manifest ?? null,
      message: result.message,
    });
  }

  // ── POST /api/backups/validate ──────────────────────────────────────────
  if (action === "validate" && request.method === "POST") {
    const { backupService } = await import("@src/services/core/backup-service");
    const body = await request.json().catch(() => ({}));

    if (!body.backupPath) {
      return errorResponse(event, "backupPath is required", 400, "MISSING_PARAM");
    }

    const result = await backupService.validateBackup(body.backupPath);
    // validateBackup returns BackupValidation — no success:boolean wrapper
    return successResponse(event, result);
  }

  // ── POST /api/backups/restore-plan ──────────────────────────────────────
  if (action === "restore-plan" && request.method === "POST") {
    const { backupService } = await import("@src/services/core/backup-service");
    const body = await request.json().catch(() => ({}));

    if (!body.backupPath) {
      return errorResponse(event, "backupPath is required", 400, "MISSING_PARAM");
    }

    const result = await backupService.createRestorePlan(body.backupPath, {
      tenantId: tenantId as string,
      collections: body.collections,
      decryptionKey: body.decryptionKey,
    });

    if (!result.success) {
      return errorResponse(event, result.message, 400, "RESTORE_PLAN_FAILED");
    }

    return successResponse(event, { plan: result.plan, message: result.message });
  }

  // ── POST /api/backups/restore ───────────────────────────────────────────
  if (action === "restore" && request.method === "POST") {
    const { backupService } = await import("@src/services/core/backup-service");
    const body = await request.json().catch(() => ({}));

    if (!body.backupPath) {
      return errorResponse(event, "backupPath is required", 400, "MISSING_PARAM");
    }

    if (!body.confirmed) {
      return errorResponse(
        event,
        "Restore requires explicit confirmation. Set confirmed: true to proceed.",
        400,
        "CONFIRMATION_REQUIRED",
      );
    }

    const result = await backupService.restoreBackup(body.backupPath, {
      confirmed: true,
      tenantId: tenantId as string,
      userId,
      superAdminOverride: body.superAdminOverride ?? false,
      decryptionKey: body.decryptionKey,
      collections: body.collections,
      background: body.background,
    });

    if (!result.success) {
      return errorResponse(event, result.message, 400, "RESTORE_FAILED");
    }

    return successResponse(event, {
      jobId: result.jobId ?? null,
      message: result.message,
    });
  }

  // ── GET /api/backups/jobs/:jobId ────────────────────────────────────────
  if (action === "jobs" && request.method === "GET") {
    const { backupService } = await import("@src/services/core/backup-service");
    const jobId = segments[2];

    if (!jobId) {
      return errorResponse(event, "jobId is required as a path parameter", 400, "MISSING_PARAM");
    }

    const result = await backupService.getJobStatus(jobId);

    if (!result) {
      return errorResponse(event, `Job "${jobId}" not found`, 404, "JOB_NOT_FOUND");
    }

    return successResponse(event, result);
  }

  throw new AppError(
    `Backup action "${action || "(none)"}" with method ${request.method} is not implemented`,
    404,
  );
}
