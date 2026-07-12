/**
 * @file src/routes/api/[...path]/handlers/importers.ts
 * @description External importer handler — handles `/api/importers/*` routes.
 *
 * External importers bring data from other systems (WordPress, Drupal, CSV, JSON)
 * into SveltyCMS via the Smart Importer plugin. This handler provides the REST
 * interface for format detection, mapping preview, and background import jobs.
 *
 * ### Features:
 * - Multi-format auto-detection (WordPress WXR, Drupal JSON:API, CSV, JSON)
 * - Heuristic field mapping with preview
 * - Background job integration via Smart Importer plugin
 * - Delta import support with source metadata tracking
 * - Scaffold mode (create collections from import structure)
 */

import { AppError } from "@utils/error-handling";
import { json, type RequestEvent } from "@sveltejs/kit";
import { successResponse } from "./base";
import type { DatabaseId } from "@src/content/types";
import type { LocalCMS } from "@src/services/sdk";

/**
 * Handle external importer routes under `/api/importers/*`.
 */
export async function handleImporterRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;
  const action = segments[1];

  // ── /api/import-data compatibility (no sub-action) ──────────────────────
  if (!action && request.method === "GET") {
    return json(
      {
        success: true,
        message:
          "Use /api/importers/sources to list supported formats, or /api/migration/import to upload files.",
      },
      { status: 200, headers: { Deprecation: "true" } },
    );
  }

  if (action === "sources" && request.method === "GET") {
    return successResponse(event, {
      sources: [
        {
          id: "wordpress",
          name: "WordPress",
          formats: ["wxr", "xml"],
          description: "WordPress WXR export files",
        },
        { id: "drupal", name: "Drupal", formats: ["json"], description: "Drupal JSON:API exports" },
        {
          id: "directus",
          name: "Directus",
          formats: ["json"],
          description: "Directus JSON exports",
        },
        { id: "strapi", name: "Strapi", formats: ["json"], description: "Strapi JSON exports" },
        {
          id: "payload",
          name: "Payload CMS",
          formats: ["json"],
          description: "Payload CMS JSON exports",
        },
        {
          id: "sveltycms",
          name: "SveltyCMS",
          formats: ["ndjson"],
          description: "SveltyCMS content packages",
        },
        { id: "csv", name: "CSV", formats: ["csv"], description: "Comma-separated values" },
        {
          id: "json",
          name: "Generic JSON",
          formats: ["json"],
          description: "Flat or nested JSON arrays",
        },
      ],
    });
  }

  if (action === "validate" && request.method === "POST") {
    return json(
      {
        success: true,
        message:
          "Importer validation — not yet implemented via this endpoint. Use /api/migration/import for file uploads.",
      },
      { status: 501 },
    );
  }
  if (action === "preview" && request.method === "POST") {
    return json(
      {
        success: true,
        message:
          "Importer preview — not yet implemented via this endpoint. Use /api/migration/import for file uploads.",
      },
      { status: 501 },
    );
  }
  if (action === "run" && request.method === "POST") {
    return json(
      {
        success: true,
        message:
          "Importer run — not yet implemented via this endpoint. Use /api/migration/import for file uploads.",
      },
      { status: 501 },
    );
  }
  if (action === "jobs" && request.method === "GET") {
    return json(
      { success: true, message: "Importer job status — not yet implemented via this endpoint." },
      { status: 501 },
    );
  }

  throw new AppError(
    `Importer action "${action || "(none)"}" with method ${request.method} is not implemented`,
    404,
  );
}
