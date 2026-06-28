/**
 * @file src/routes/api/migration/import/+server.ts
 * @description SSE streaming endpoint for migration import progress.
 *
 * POST multipart form → text/event-stream with progress + completion events.
 */

import type { RequestHandler } from "./$types";
import { logger } from "@utils/logger";
import { AppError } from "@utils/error-handling";
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";
import { resolveTargetCollection } from "@plugins/smart-importer/infer-collection";
import {
  MigrationLicenseError,
  MigrationDeltaError,
  MigrationPiiError,
  getMigrationLicenseTier,
  runMigrationImport,
} from "@plugins/smart-importer/import-runner";

// Cached module reference — avoids filesystem descriptor penalty on repeated imports
let _preloadedJobQueue: any = null;

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!hasCollectionBuilderPermission(user, locals.roles ?? [], locals.isAdmin)) {
    return new Response("config:collectionbuilder permission required", {
      status: 403,
    });
  }

  const dbAdapter = locals.cms?.db ?? (locals as { dbAdapter?: unknown }).dbAdapter;
  if (!dbAdapter) {
    return new Response("Database not available", { status: 500 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const format = form.get("format") as string | null;
  if (
    !(file && typeof file === "object" && "arrayBuffer" in (file as any) && "name" in file) ||
    !format
  ) {
    return new Response("file and format required", { status: 400 });
  }

  let selectedContentTypes: string[] = [];
  const contentTypesRaw = form.get("contentTypes") as string | null;
  if (contentTypesRaw) {
    try {
      const parsed = JSON.parse(contentTypesRaw) as unknown;
      if (Array.isArray(parsed)) selectedContentTypes = parsed.map(String).filter(Boolean);
    } catch {
      /* ignore */
    }
  }

  const targetCollection = resolveTargetCollection(form.get("targetCollection") as string | null, {
    format,
    selectedContentTypes,
  });

  const license = await getMigrationLicenseTier(locals as any);

  const MAX_INLINE_FILE_SIZE = 15 * 1024 * 1024; // 15MB — guard against OOM on large uploads
  if ((file as any).size && (file as any).size > MAX_INLINE_FILE_SIZE) {
    return new Response(
      JSON.stringify({
        error: "File too large for inline import. Use CLI migration for files >15MB.",
      }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    );
  }

  const fileText = await file.text();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(payload)));
      };

      try {
        send({
          type: "progress",
          current: 0,
          total: 0,
          phase: "extracting",
          currentItem: "Parsing...",
        });

        let importComplete = await runMigrationImport({
          dbAdapter,
          fileText,
          format,
          targetCollection,
          licenseTier: license.tier,
          tenantId: locals.tenantId ?? null,
          contentTypesRaw: form.get("contentTypes") as string | null,
          importOptionsRaw: form.get("importOptions") as string | null,
          mappingsRaw: form.get("mappings") as string | null,
          importMedia: form.get("importMedia") === "true",
          onProgress: (progress) => {
            send({
              type: "progress",
              current: progress.current,
              total: progress.total,
              phase: progress.phase,
              currentItem: progress.currentItem,
              percent:
                progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0,
            });
          },
        });

        if (importComplete.background && importComplete.jobId) {
          if (!_preloadedJobQueue) {
            const mod = await import("@plugins/smart-importer/job-queue");
            _preloadedJobQueue = mod.importJobQueue;
          }
          importComplete = await new Promise<typeof importComplete>((resolve, reject) => {
            let active = true;

            const cleanup = () => {
              if (active) {
                active = false;
                unsubscribe();
                request.signal.removeEventListener("abort", onAbort);
              }
            };

            const onAbort = () => {
              cleanup();
              reject(new AppError("Client disconnected from migration stream", 499));
            };

            request.signal.addEventListener("abort", onAbort);

            const unsubscribe = _preloadedJobQueue.subscribe((job: any) => {
              if (!active || job.id !== importComplete.jobId) return;

              send({
                type: "progress",
                current: job.importedCount,
                total: job.totalEntries,
                phase: job.status === "completed" ? "completed" : "processing",
                currentItem: job.currentItem,
                percent: job.progressPercent,
                background: true,
                jobId: job.id,
              });

              if (job.status === "completed") {
                cleanup();
                resolve({
                  ...importComplete,
                  imported: job.importedCount,
                  failed: job.failedCount,
                });
              } else if (job.status === "failed") {
                cleanup();
                reject(new Error(job.error || "Background import failed"));
              }
            });
          });
        }

        send({
          type: "complete",
          success: true,
          imported: importComplete.imported,
          failed: importComplete.failed,
          transactionToken: importComplete.transactionToken,
          timestamp: importComplete.timestamp,
          background: importComplete.background,
          jobId: importComplete.jobId,
          scaffold: importComplete.scaffold,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        const licenseRequired =
          err instanceof MigrationLicenseError ||
          err instanceof MigrationDeltaError ||
          err instanceof MigrationPiiError;
        logger.error("[Migration SSE] Import failed:", err);
        send({
          type: "error",
          success: false,
          error: message,
          licenseRequired,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Nginx: disable chunk buffering for real-time SSE
    },
  });
};
