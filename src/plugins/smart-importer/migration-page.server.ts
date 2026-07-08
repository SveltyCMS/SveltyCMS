/**
 * @file src/plugins/smart-importer/migration-page.server.ts
 * @description Server handlers for the Smart Importer migration wizard (plugin page).
 *
 * Freemium model:
 * - Free tier: WordPress, Drupal, Strapi, Directus, SveltyCMS (5 formats)
 * - Pro tier: Contentful, Sanity, Ghost, Shopify, Webflow, Storyblok,
 *   Prismic + 25 more platforms + AI enrichments + rollback + DLQ
 *
 * License verification: calls marketplace.sveltycms.com/api/v1/license/verify
 * before executing premium features. Degrades gracefully when offline.
 */

import { fail } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";
import {
  PRO_PLATFORMS,
  MigrationLicenseError,
  MigrationDeltaError,
  MigrationPiiError,
  getMigrationLicenseTier,
  prepareMigrationEnvelope,
  runMigrationImport,
} from "@plugins/smart-importer/import-runner";
import { getKnownMappingsForFormat } from "@plugins/smart-importer/known-mappings";
import {
  inferTargetCollectionFromMigration,
  resolveTargetCollection,
} from "@plugins/smart-importer/infer-collection";

// Lazy-loaded plugin modules
let _ucpEngine: typeof import("@plugins/smart-importer/index.server") | null = null;
let _aiTransforms: typeof import("@plugins/smart-importer/ai-transforms") | null = null;

async function getUCPEngine() {
  if (!_ucpEngine) _ucpEngine = await import("@plugins/smart-importer/index.server");
  return _ucpEngine;
}

async function getAITransforms() {
  if (!_aiTransforms) _aiTransforms = await import("@plugins/smart-importer/ai-transforms");
  return _aiTransforms;
}

function parseContentTypesJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function resolveTargetFromForm(data: FormData, format: string): string {
  return resolveTargetCollection(data.get("targetCollection") as string | null, {
    format,
    selectedContentTypes: parseContentTypesJson(data.get("contentTypes") as string | null),
  });
}

async function getActionFormData(context: { request: Request; parsedBody?: unknown }) {
  if (context.parsedBody instanceof FormData) {
    return context.parsedBody;
  }

  return context.request.formData();
}

// ============================================================================
// Actions
// ============================================================================

export const actions = {
  /**
   * Step 1: Detect format + AI field analysis + license check
   */
  detect: async ({ request, parsedBody, locals }) => {
    const data = await getActionFormData({ request, parsedBody });
    const file = data.get("file") as File | null;
    if (!file) return fail(400, { error: "No file provided" });

    try {
      const text = await file.text();
      const name = file.name.toLowerCase();
      const ext = name.split(".").pop() || "";
      const header = text.slice(0, 500);

      let format = "unknown";
      let contentTypes: string[] = [];
      let fieldMappings = getKnownMappingsForFormat(format);
      let estimatedCount = 0;

      // ── Format Detection ──
      if (
        header.includes("<rss") ||
        header.includes("<channel>") ||
        header.includes("<wp:") ||
        header.includes("xmlns:wp=") ||
        ext === "wxr"
      ) {
        format = "wordpress";
        estimatedCount = (text.match(/<item>/g) || []).length;
        const typeMatch = text.match(/<wp:post_type>(\w+)<\/wp:post_type>/g);
        contentTypes = typeMatch
          ? [...new Set(Array.from(typeMatch, (m) => m.replace(/<\/?wp:post_type>/g, "")))]
          : ["post"];
        fieldMappings = getKnownMappingsForFormat("wordpress");
      } else if (header.includes('"db"') && header.includes('"posts"')) {
        format = "ghost";
        contentTypes = ["post", "page"];
      } else if (
        header.includes('"contentTypes"') ||
        (header.includes('"sys"') && header.includes('"space"'))
      ) {
        format = "contentful";
        contentTypes = ["entry"];
      } else if (ext === "csv" && (header.includes("_id,") || header.includes("Name,"))) {
        format = "webflow";
      } else if (header.includes('"products"') || header.includes('"product_type"')) {
        format = "shopify";
        fieldMappings = getKnownMappingsForFormat("shopify");
        contentTypes = ["products"];
      } else if (
        (ext === "yml" || ext === "yaml") &&
        (header.includes("uuid:") || header.includes("_meta:"))
      ) {
        format = "drupal";
        fieldMappings = getKnownMappingsForFormat("drupal");
        contentTypes = ["node"];
      } else if (ext === "json") {
        try {
          const parsed = JSON.parse(text.slice(0, 10000));
          if (parsed.entries && parsed.contentTypes) {
            format = "contentful";
          } else if (parsed.stories) {
            format = "storyblok";
          } else if (parsed.results?.[0]?.data) {
            format = "prismic";
          } else if (parsed.data && typeof parsed.data === "object") {
            format = "strapi";
            fieldMappings = getKnownMappingsForFormat("strapi");
            const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
            contentTypes = [
              ...new Set(items.map((i: any) => i.type || "entry").filter(Boolean)),
            ] as string[];
          } else if (parsed.collections || (parsed.data && Array.isArray(parsed.data))) {
            format = parsed.metadata ? "sveltycms" : "directus";
            fieldMappings = getKnownMappingsForFormat("directus");
          } else if (parsed.jsonapi || parsed.included) {
            format = "drupal";
            fieldMappings = getKnownMappingsForFormat("drupal");
            const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
            contentTypes = [
              ...new Set(
                items.map((i: any) => i.type?.replace("node--", "") || "node").filter(Boolean),
              ),
            ] as string[];
          } else if (Array.isArray(parsed)) {
            format = "sanity";
          }
          estimatedCount = Array.isArray(parsed.data)
            ? parsed.data.length
            : Array.isArray(parsed)
              ? parsed.length
              : 0;
        } catch {
          format = "unknown";
        }
      }

      // ── License Check ──
      const license = await getMigrationLicenseTier(locals);
      const isPro = license.tier === "pro";
      const needsPro = PRO_PLATFORMS.has(format);
      const licenseBlocked = needsPro && !isPro;

      // ── AI Data Flow Analysis (Pro only) ──
      let dataFlow: any = null;
      if (isPro && format !== "unknown") {
        try {
          const ai = await getAITransforms();
          const targetFields = [
            { name: "title", type: "text" },
            { name: "slug", type: "text" },
            { name: "content", type: "richtext" },
            { name: "excerpt", type: "text" },
            { name: "status", type: "select" },
            { name: "createdAt", type: "date" },
            { name: "updatedAt", type: "date" },
            { name: "author", type: "text" },
            { name: "featuredImage", type: "media" },
            { name: "tags", type: "taxonomy" },
            { name: "categories", type: "taxonomy" },
            { name: "language", type: "text" },
          ];
          const sources = fieldMappings.map((m) => m.source);
          const result = ai.analyzeDataFlow(sources, format, targetFields, undefined, isPro);
          dataFlow = {
            suggestions: result.suggestions,
            summary: result.summary,
            mermaid: ai.generateDataFlowMermaid(
              result.suggestions,
              format,
              inferTargetCollectionFromMigration({ format, contentTypes }),
            ),
          };
        } catch {
          /* AI analysis is non-critical */
        }
      }

      const normalizedContentTypes = [...new Set(contentTypes)].filter(Boolean);
      const suggestedTargetCollection = inferTargetCollectionFromMigration({
        format,
        contentTypes: normalizedContentTypes,
      });

      return {
        success: true,
        format,
        estimatedCount,
        fieldMappings,
        contentTypes: normalizedContentTypes,
        suggestedTargetCollection,
        fileName: file.name,
        fileSize: file.size,
        license: { tier: license.tier, valid: license.valid },
        needsPro,
        licenseBlocked,
        dataFlow,
      };
    } catch (err) {
      logger.error("[Migration] Detection failed:", err);
      return fail(500, {
        error: err instanceof Error ? err.message : "Detection failed",
      });
    }
  },

  /**
   * Step 3: Dry-run validation
   */
  dryRun: async ({ request, parsedBody, locals }) => {
    const data = await getActionFormData({ request, parsedBody });
    const file = data.get("file") as File | null;
    const format = data.get("format") as string;
    const contentTypesRaw = data.get("contentTypes") as string | null;
    const importOptionsRaw = data.get("importOptions") as string | null;
    const targetCollection = resolveTargetFromForm(data, format);
    const mappingsRaw = data.get("mappings") as string | null;
    const dbAdapter = (locals as { dbAdapter?: unknown }).dbAdapter ?? locals.cms?.db;

    if (!file || !format) return fail(400, { error: "File and format required" });

    const license = await getMigrationLicenseTier(locals);

    try {
      const txnToken = crypto.randomUUID?.() || `dry_${Date.now()}`;
      const prepared = await prepareMigrationEnvelope(
        await file.text(),
        format,
        txnToken,
        importOptionsRaw,
        contentTypesRaw,
        dbAdapter,
        targetCollection,
        license.tier,
      );

      if (!prepared?.envelope.entries.length) {
        return fail(400, {
          error: prepared?.delta?.skipped
            ? `Delta: all ${prepared.delta.skipped} entries unchanged`
            : "No entries found after filtering",
          delta: prepared?.delta,
        });
      }

      const mappings = mappingsRaw
        ? (JSON.parse(mappingsRaw) as Array<{
            source: string;
            target: string;
            type: string;
            action?: string;
          }>)
        : [];

      const { computeSchemaDiffReport } = await import("@plugins/smart-importer/schema-preview");
      const { ensureTargetCollectionProvisioned, normalizeCollectionId } = await import(
        "@plugins/smart-importer/collection-scaffold"
      );
      const { contentSystem } = await import("@src/content/index.server");
      const tenantId = locals.tenantId ?? null;
      const collectionId = normalizeCollectionId(targetCollection);

      if (dbAdapter && mappings.length > 0) {
        const user = locals.user;
        if (!user || !hasCollectionBuilderPermission(user, locals.roles ?? [], locals.isAdmin)) {
          return fail(403, {
            error: "config:collectionbuilder permission required to validate a new collection",
          });
        }

        await ensureTargetCollectionProvisioned(
          dbAdapter,
          tenantId,
          targetCollection,
          mappings,
          format,
        );
      }

      const existingSchema = contentSystem.getCollection(collectionId, tenantId);
      const schemaDiff = computeSchemaDiffReport(existingSchema, mappings);

      let previewDiff = null;
      if (dbAdapter) {
        const { generatePreview } = await import("@plugins/smart-importer/control-plane");
        previewDiff = await generatePreview(dbAdapter, prepared.envelope, collectionId, "skip");
      }

      return {
        success: true,
        dryRun: true,
        format,
        collectionId,
        estimatedItems: prepared.envelope.entries.length,
        filterReport: prepared.filterReport,
        delta: prepared.delta,
        schemaDiff,
        previewDiff,
        timestamp: nowISODateString(),
      };
    } catch (err) {
      if (err instanceof MigrationDeltaError || err instanceof MigrationPiiError) {
        return fail(402, { error: err.message, licenseRequired: true });
      }
      return fail(500, {
        error: err instanceof Error ? err.message : "Validation failed",
      });
    }
  },

  /**
   * Step 3b: Scaffold target collection from field mappings (Collection Builder pipeline)
   */
  scaffoldCollection: async ({ request, parsedBody, locals }) => {
    const user = locals.user;
    if (!user) return fail(401, { error: "Unauthorized" });

    if (!hasCollectionBuilderPermission(user, locals.roles ?? [], locals.isAdmin)) {
      return fail(403, {
        error: "config:collectionbuilder permission required to create collections",
      });
    }

    const data = await getActionFormData({ request, parsedBody });
    const format = (data.get("format") as string) || "wordpress";
    const targetCollection = resolveTargetFromForm(data, format);
    const mappingsRaw = data.get("mappings") as string | null;
    const dbAdapter = (locals as { dbAdapter?: unknown }).dbAdapter ?? locals.cms?.db;

    if (!mappingsRaw) return fail(400, { error: "Field mappings required" });

    try {
      const mappings = JSON.parse(mappingsRaw) as Array<{
        source: string;
        target: string;
        type: string;
        action?: string;
      }>;

      const { provisionCollectionFromMappings, normalizeCollectionId } =
        await import("@plugins/smart-importer/collection-scaffold");
      const { computeSchemaDiffReport } = await import("@plugins/smart-importer/schema-preview");
      const { contentSystem } = await import("@src/content/index.server");

      const tenantId = locals.tenantId ?? null;
      const result = await provisionCollectionFromMappings(
        dbAdapter,
        tenantId,
        targetCollection,
        mappings,
        format,
      );

      const collectionId = normalizeCollectionId(targetCollection);
      const existingSchema = contentSystem.getCollection(collectionId, tenantId);
      const schemaDiff = computeSchemaDiffReport(existingSchema, mappings);

      return {
        success: true,
        scaffold: result,
        schemaDiff,
        collectionId,
        message: result.created
          ? `Created collection "${collectionId}" with ${result.fieldCount} fields`
          : `Collection "${collectionId}" already exists`,
      };
    } catch (err) {
      logger.error("[Migration] Scaffold failed:", err);
      return fail(500, {
        error: err instanceof Error ? err.message : "Collection scaffold failed",
      });
    }
  },

  /**
   * Step 4: Import — gated by license for Pro platforms
   */
  import: async ({ request, parsedBody, locals }) => {
    const data = await getActionFormData({ request, parsedBody });
    const file = data.get("file") as File | null;
    const format = data.get("format") as string;
    const contentTypesRaw = data.get("contentTypes") as string | null;
    const importOptionsRaw = data.get("importOptions") as string | null;
    const mappingsRaw = data.get("mappings") as string | null;
    const importMedia = data.get("importMedia") === "true";
    const dbAdapter = (locals as any)?.dbAdapter ?? locals.cms?.db;

    if (!file || !format)
      return fail(400, {
        error: "File and format required",
      });

    const targetCollection = resolveTargetFromForm(data, format);

    const license = await getMigrationLicenseTier(locals);

    try {
      if (mappingsRaw) {
        const { normalizeCollectionId } =
          await import("@plugins/smart-importer/collection-scaffold");
        const { contentSystem } = await import("@src/content/index.server");
        const collectionId = normalizeCollectionId(targetCollection);
        const tenantId = locals.tenantId ?? null;
        if (!contentSystem.getCollection(collectionId, tenantId)) {
          const user = locals.user;
          if (!user || !hasCollectionBuilderPermission(user, locals.roles ?? [], locals.isAdmin)) {
            return fail(403, {
              error: "config:collectionbuilder permission required to import into a new collection",
            });
          }
        }
      }

      const result = await runMigrationImport({
        dbAdapter,
        fileText: await file.text(),
        format,
        targetCollection,
        licenseTier: license.tier,
        tenantId: locals.tenantId ?? null,
        contentTypesRaw,
        importOptionsRaw,
        mappingsRaw,
        importMedia,
      });
      return { success: true, ...result };
    } catch (err) {
      if (
        err instanceof MigrationLicenseError ||
        err instanceof MigrationDeltaError ||
        err instanceof MigrationPiiError
      ) {
        return fail(402, { error: err.message, licenseRequired: true });
      }
      logger.error("[Migration] Import failed:", err);
      return fail(500, {
        error: err instanceof Error ? err.message : "Import failed",
      });
    }
  },

  /**
   * Step 5: Rollback — Pro only
   */
  rollback: async ({ request, parsedBody, locals }) => {
    const data = await getActionFormData({ request, parsedBody });
    const transactionToken = data.get("transactionToken") as string;
    const dbAdapter = (locals as any)?.dbAdapter;
    if (!transactionToken) return fail(400, { error: "transactionToken required" });

    // Rollback is a Pro feature
    const license = await getMigrationLicenseTier(locals);
    if (license.tier !== "pro") {
      return fail(402, {
        error: "Rollback requires a Pro license",
        licenseRequired: true,
      });
    }

    try {
      const engine = await getUCPEngine();
      const success = await engine.rollbackTransaction(dbAdapter, transactionToken);
      return { success, message: success ? "Rolled back" : "Not found" };
    } catch (err) {
      return fail(500, {
        error: err instanceof Error ? err.message : "Rollback failed",
      });
    }
  },
};
