/**
 * @file src/routes/api/[...path]/handlers/content-transfer.ts
 * @description Content package import/export handler — handles `/api/content-export/*`
 * and `/api/content-import/*` routes.
 *
 * Content transfer moves editorial records as portable packages with NDJSON streaming,
 * relation remapping, duplicate strategies, and background job support.
 *
 * ### Features:
 * - NDJSON streaming export with manifest and checksums
 * - Plan-first import with conflict preview
 * - Duplicate strategies: skip, update, create-copy, fail
 * - Relation and media reference remapping
 * - Background job integration for large transfers
 * - SHA-256 checksum integrity verification
 * - Tenant-scoped isolation
 * - Inline return for small exports (<1MB), jobId-based for large exports
 */

import { AppError } from "@utils/error-handling";
import { type RequestEvent } from "@sveltejs/kit";
import { successResponse, errorResponse } from "./base";
import type { DatabaseId } from "@src/content/types";
import type { ContentPackage } from "@src/services/core/content-package-service";
import type { LocalCMS } from "@src/services/sdk";

// ---------------------------------------------------------------------------
// In-memory export store for large packages
// ---------------------------------------------------------------------------

/** TTL for stored exports in milliseconds (1 hour). */
const EXPORT_STORE_TTL = 60 * 60 * 1000;

const exportStore = new Map<string, { pkg: ContentPackage; createdAt: number }>();

/** Periodic cleanup of expired exports (runs every 5 minutes). */
setInterval(
  () => {
    const now = Date.now();
    for (const [id, entry] of exportStore) {
      if (now - entry.createdAt > EXPORT_STORE_TTL) {
        exportStore.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);

// ---------------------------------------------------------------------------
// Content Export Routes
// ---------------------------------------------------------------------------

/**
 * Handle content export routes under `/api/content-export/*`.
 */
export async function handleContentExportRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  const user = locals.user as any;
  const userId = user?._id ?? user?.id ?? "system";
  const action = segments[1];
  const subId = segments[2]; // jobId for jobs/download actions

  // ── POST /api/content-export/validate ──────────────────────────────────
  if (action === "validate" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { contentPackageService } = await import("@src/services/core/content-package-service");

      const result = await contentPackageService.validateExport({
        collections: body.collections,
        filter: body.filter,
        locale: body.locale,
        relationDepth: body.relationDepth,
        includeMedia: body.includeMedia,
        tenantId: tenantId as string,
        userId,
      });

      return successResponse(event, result);
    } catch (err) {
      return errorResponse(event, `Export validation failed: ${(err as Error).message}`, 400);
    }
  }

  // ── POST /api/content-export/plan ──────────────────────────────────────
  if (action === "plan" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { contentPackageService } = await import("@src/services/core/content-package-service");

      const result = await contentPackageService.planExport({
        collections: body.collections,
        filter: body.filter,
        locale: body.locale,
        relationDepth: body.relationDepth,
        includeMedia: body.includeMedia,
        tenantId: tenantId as string,
        userId,
      });

      return successResponse(event, result);
    } catch (err) {
      return errorResponse(event, `Export planning failed: ${(err as Error).message}`, 400);
    }
  }

  // ── POST /api/content-export/run ───────────────────────────────────────
  if (action === "run" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { contentPackageService } = await import("@src/services/core/content-package-service");

      const pkg = await contentPackageService.runExport({
        collections: body.collections,
        filter: body.filter,
        locale: body.locale,
        relationDepth: body.relationDepth,
        includeMedia: body.includeMedia,
        tenantId: tenantId as string,
        userId,
      });

      // Estimate serialized size to decide inline vs jobId
      const serialized = JSON.stringify(pkg);
      const sizeBytes = new TextEncoder().encode(serialized).length;
      const ONE_MB = 1024 * 1024;

      if (sizeBytes < ONE_MB) {
        return successResponse(event, pkg);
      }

      // Large export: store and return jobId for download
      const jobId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      exportStore.set(jobId, { pkg, createdAt: Date.now() });

      return successResponse(event, {
        jobId,
        sizeBytes,
        message: `Export completed (${(sizeBytes / ONE_MB).toFixed(1)}MB). Use GET /api/content-export/download/${jobId} to retrieve.`,
      });
    } catch (err) {
      return errorResponse(event, `Export execution failed: ${(err as Error).message}`, 500);
    }
  }

  // ── GET /api/content-export/jobs/:jobId ────────────────────────────────
  if (action === "jobs" && request.method === "GET" && subId) {
    try {
      const { contentPackageService } = await import("@src/services/core/content-package-service");
      const status = await contentPackageService.getJobStatus(subId);

      if (!status) {
        // Check if it's a stored inline export
        const stored = exportStore.get(subId);
        if (stored) {
          return successResponse(event, {
            jobId: subId,
            status: "completed",
            progress: 100,
            message: "Export package is ready for download.",
          });
        }
        return errorResponse(event, `Job not found: ${subId}`, 404);
      }

      return successResponse(event, status);
    } catch (err) {
      return errorResponse(event, `Failed to get job status: ${(err as Error).message}`, 500);
    }
  }

  // ── GET /api/content-export/download/:jobId ────────────────────────────
  if (action === "download" && request.method === "GET" && subId) {
    const stored = exportStore.get(subId);
    if (!stored) {
      return errorResponse(event, `Export not found or expired: ${subId}`, 404);
    }

    const serialized = JSON.stringify(stored.pkg, null, 2);
    const filename = `content-export-${stored.pkg.manifest.createdAt.replace(/[:.]/g, "-")}.json`;

    return new Response(serialized, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(new TextEncoder().encode(serialized).length),
      },
    });
  }

  throw new AppError(
    `Content export action "${action || "(none)"}" with method ${request.method} is not implemented`,
    404,
  );
}

// ---------------------------------------------------------------------------
// Content Import Routes
// ---------------------------------------------------------------------------

/**
 * Handle content import routes under `/api/content-import/*`.
 */
export async function handleContentImportRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  const user = locals.user as any;
  const userId = user?._id ?? user?.id ?? "system";
  const action = segments[1];
  const subId = segments[2]; // jobId for jobs action

  // ── POST /api/content-import/validate ──────────────────────────────────
  if (action === "validate" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { contentPackageService } = await import("@src/services/core/content-package-service");

      // The body IS the ContentPackage with optional tenantId override
      const { tenantId: bodyTenantId, ...pkg } = body as ContentPackage & { tenantId?: string };

      const result = await contentPackageService.validateImport(pkg as ContentPackage, {
        tenantId: (bodyTenantId || tenantId) as string,
        userId,
      });

      return successResponse(event, result);
    } catch (err) {
      return errorResponse(event, `Import validation failed: ${(err as Error).message}`, 400);
    }
  }

  // ── POST /api/content-import/plan ──────────────────────────────────────
  if (action === "plan" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { contentPackageService } = await import("@src/services/core/content-package-service");

      // body: ContentPackage JSON + { duplicateStrategy?, tenantId? }
      const {
        duplicateStrategy,
        tenantId: bodyTenantId,
        ...pkg
      } = body as ContentPackage & {
        duplicateStrategy?: string;
        tenantId?: string;
      };

      const result = await contentPackageService.planImport(pkg as ContentPackage, {
        duplicateStrategy: duplicateStrategy as any,
        tenantId: (bodyTenantId || tenantId) as string,
        userId,
      });

      return successResponse(event, result);
    } catch (err) {
      return errorResponse(event, `Import planning failed: ${(err as Error).message}`, 400);
    }
  }

  // ── POST /api/content-import/apply ─────────────────────────────────────
  if (action === "apply" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));

      if (!body.planId) {
        throw new AppError("planId is required to apply an import plan", 400);
      }

      const { contentPackageService } = await import("@src/services/core/content-package-service");

      const result = await contentPackageService.applyImport(body.planId, {
        tenantId: tenantId as string,
        userId,
      });

      if (!result.success) {
        return errorResponse(event, result.message, 400);
      }

      return successResponse(event, result);
    } catch (err) {
      return errorResponse(event, `Import apply failed: ${(err as Error).message}`, 500);
    }
  }

  // ── GET /api/content-import/jobs/:jobId ────────────────────────────────
  if (action === "jobs" && request.method === "GET" && subId) {
    try {
      const { contentPackageService } = await import("@src/services/core/content-package-service");
      const status = await contentPackageService.getJobStatus(subId);

      if (!status) {
        return errorResponse(event, `Job not found: ${subId}`, 404);
      }

      return successResponse(event, status);
    } catch (err) {
      return errorResponse(event, `Failed to get job status: ${(err as Error).message}`, 500);
    }
  }

  throw new AppError(
    `Content import action "${action || "(none)"}" with method ${request.method} is not implemented`,
    404,
  );
}
