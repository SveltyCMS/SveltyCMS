/**
 * @file src/routes/api/migration/import/+server.ts
 * @description SSE streaming endpoint for migration import progress.
 *
 * POST multipart form → text/event-stream with progress + completion events.
 */

import type { RequestHandler } from "./$types";
import { logger } from "@utils/logger";
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";
import { resolveTargetCollection } from "@plugins/smart-importer/infer-collection";
import {
  MigrationLicenseError,
  MigrationDeltaError,
  MigrationPiiError,
  getMigrationLicenseTier,
  runMigrationImport,
} from "@plugins/smart-importer/import-runner";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!hasCollectionBuilderPermission(user, locals.roles ?? [], locals.isAdmin)) {
    return new Response("config:collectionbuilder permission required", { status: 403 });
  }

  const dbAdapter = locals.cms?.db ?? (locals as { dbAdapter?: unknown }).dbAdapter;
  if (!dbAdapter) {
    return new Response("Database not available", { status: 500 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const format = form.get("format") as string | null;
  if (!(file instanceof File) || !format) {
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

  const license = await getMigrationLicenseTier(locals);
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
          const { importJobQueue } = await import("@plugins/smart-importer/job-queue");
          importComplete = await new Promise<typeof importComplete>((resolve, reject) => {
            const unsubscribe = importJobQueue.subscribe((job) => {
              if (job.id !== importComplete.jobId) return;

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
                unsubscribe();
                resolve({
                  ...importComplete,
                  imported: job.importedCount,
                  failed: job.failedCount,
                });
              } else if (job.status === "failed") {
                unsubscribe();
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
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
