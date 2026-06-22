/**
 * @file src/routes/(app)/config/migration/+page.server.ts
 * @description Server-side for the 5-step visual migration wizard.
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

// ============================================================================
// License & Tier Gating
// ============================================================================

/** Platforms that require a Pro license */
const PRO_PLATFORMS = new Set([
  "contentful",
  "sanity",
  "ghost",
  "typo3",
  "craft",
  "statamic",
  "storyblok",
  "prismic",
  "webflow",
  "shopify",
  "magento",
  "prestashop",
  "opencart",
  "joomla",
  "grav",
  "processwire",
  "hygraph",
  "contentstack",
  "dato",
  "builder",
  "kontent",
  "hubspot",
  "wix",
  "squarespace",
  "duda",
  "tilda",
  "contao",
  "silverstripe",
  "concrete",
  "october",
  "bolt",
  "expressionengine",
  "backdrop",
  "cockpit",
  "pimcore",
]);

async function checkLicense(locals: any): Promise<{ valid: boolean; tier: "free" | "pro" }> {
  try {
    const pluginRegistry = (await import("@src/plugins/registry")).pluginRegistry;
    const tenantId = (locals as any)?.tenantId || "default";
    const state = await pluginRegistry.getPluginState("smart-importer", tenantId);
    const isPro = state?.settings?.isProActivated || state?.settings?.licenseKey;
    if (isPro) {
      // Verify with marketplace
      const engine = await getUCPEngine();
      const verified = await engine.verifyMarketplaceLicense(
        state?.settings?.licenseKey || "",
        tenantId,
      );
      return { valid: verified, tier: verified ? "pro" : "free" };
    }
    return { valid: true, tier: "free" };
  } catch {
    // Offline fallback: allow free tier, block pro
    return { valid: true, tier: "free" };
  }
}

// ============================================================================
// Known AI Mappings per Platform
// ============================================================================

const KNOWN_MAPPINGS: Record<
  string,
  Array<{ source: string; target: string; confidence: number; type: string }>
> = {
  wordpress: [
    { source: "post_title", target: "title", confidence: 95, type: "text" },
    {
      source: "content:encoded",
      target: "content",
      confidence: 90,
      type: "richtext",
    },
    {
      source: "excerpt:encoded",
      target: "excerpt",
      confidence: 85,
      type: "text",
    },
    { source: "wp:post_name", target: "slug", confidence: 90, type: "text" },
    { source: "wp:status", target: "status", confidence: 85, type: "select" },
    {
      source: "wp:post_date",
      target: "createdAt",
      confidence: 90,
      type: "date",
    },
    {
      source: "wp:post_modified",
      target: "updatedAt",
      confidence: 90,
      type: "date",
    },
    { source: "dc:creator", target: "author", confidence: 75, type: "text" },
    {
      source: "wp:post_parent",
      target: "parentId",
      confidence: 70,
      type: "relation",
    },
    {
      source: "wp:menu_order",
      target: "order",
      confidence: 70,
      type: "number",
    },
    {
      source: "_thumbnail_id",
      target: "featuredImage",
      confidence: 80,
      type: "media",
    },
    {
      source: "category",
      target: "categories",
      confidence: 85,
      type: "taxonomy",
    },
    { source: "post_tag", target: "tags", confidence: 85, type: "taxonomy" },
  ],
  drupal: [
    { source: "title", target: "title", confidence: 95, type: "text" },
    { source: "body", target: "content", confidence: 90, type: "richtext" },
    {
      source: "field_summary",
      target: "excerpt",
      confidence: 80,
      type: "text",
    },
    { source: "path", target: "slug", confidence: 85, type: "text" },
    { source: "status", target: "status", confidence: 80, type: "select" },
    { source: "created", target: "createdAt", confidence: 90, type: "date" },
    { source: "changed", target: "updatedAt", confidence: 90, type: "date" },
    { source: "uid", target: "author", confidence: 75, type: "text" },
    { source: "langcode", target: "language", confidence: 80, type: "text" },
    { source: "field_tags", target: "tags", confidence: 85, type: "taxonomy" },
    {
      source: "field_category",
      target: "categories",
      confidence: 85,
      type: "taxonomy",
    },
    {
      source: "field_image",
      target: "featuredImage",
      confidence: 80,
      type: "media",
    },
    {
      source: "field_media",
      target: "featuredImage",
      confidence: 75,
      type: "media",
    },
  ],
  strapi: [
    { source: "title", target: "title", confidence: 95, type: "text" },
    { source: "content", target: "content", confidence: 90, type: "richtext" },
    { source: "description", target: "excerpt", confidence: 80, type: "text" },
    { source: "slug", target: "slug", confidence: 90, type: "text" },
    { source: "created_at", target: "createdAt", confidence: 90, type: "date" },
    { source: "updated_at", target: "updatedAt", confidence: 90, type: "date" },
    {
      source: "published_at",
      target: "publishedAt",
      confidence: 85,
      type: "date",
    },
    { source: "image", target: "featuredImage", confidence: 80, type: "media" },
  ],
  directus: [
    { source: "title", target: "title", confidence: 95, type: "text" },
    { source: "content", target: "content", confidence: 90, type: "richtext" },
    { source: "description", target: "excerpt", confidence: 80, type: "text" },
    { source: "slug", target: "slug", confidence: 90, type: "text" },
    { source: "status", target: "status", confidence: 85, type: "select" },
    {
      source: "date_created",
      target: "createdAt",
      confidence: 90,
      type: "date",
    },
    {
      source: "date_updated",
      target: "updatedAt",
      confidence: 90,
      type: "date",
    },
    { source: "image", target: "featuredImage", confidence: 80, type: "media" },
  ],
  shopify: [
    { source: "title", target: "title", confidence: 95, type: "text" },
    {
      source: "body_html",
      target: "content",
      confidence: 85,
      type: "richtext",
    },
    { source: "handle", target: "slug", confidence: 90, type: "text" },
    { source: "vendor", target: "vendor", confidence: 85, type: "text" },
    {
      source: "product_type",
      target: "productType",
      confidence: 85,
      type: "text",
    },
    { source: "price", target: "price", confidence: 90, type: "number" },
    { source: "sku", target: "sku", confidence: 90, type: "text" },
    {
      source: "inventory_quantity",
      target: "inventory",
      confidence: 85,
      type: "number",
    },
    { source: "image", target: "featuredImage", confidence: 80, type: "media" },
    { source: "tags", target: "tags", confidence: 85, type: "taxonomy" },
  ],
};

// ============================================================================
// Actions
// ============================================================================

export const actions = {
  /**
   * Step 1: Detect format + AI field analysis + license check
   */
  detect: async ({ request, locals }) => {
    const data = await request.formData();
    const file = data.get("file") as File | null;
    if (!file) return fail(400, { error: "No file provided" });

    try {
      const text = await file.text();
      const name = file.name.toLowerCase();
      const ext = name.split(".").pop() || "";
      const header = text.slice(0, 500);

      let format = "unknown";
      let contentTypes: string[] = [];
      let fieldMappings: (typeof KNOWN_MAPPINGS)["wordpress"] = [];
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
        fieldMappings = KNOWN_MAPPINGS.wordpress;
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
        fieldMappings = KNOWN_MAPPINGS.shopify;
        contentTypes = ["products"];
      } else if (
        (ext === "yml" || ext === "yaml") &&
        (header.includes("uuid:") || header.includes("_meta:"))
      ) {
        format = "drupal";
        fieldMappings = KNOWN_MAPPINGS.drupal;
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
            fieldMappings = KNOWN_MAPPINGS.strapi;
            const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
            contentTypes = [
              ...new Set(items.map((i: any) => i.type || "entry").filter(Boolean)),
            ] as string[];
          } else if (parsed.collections || (parsed.data && Array.isArray(parsed.data))) {
            format = parsed.metadata ? "sveltycms" : "directus";
            fieldMappings = KNOWN_MAPPINGS.directus;
          } else if (parsed.jsonapi || parsed.included) {
            format = "drupal";
            fieldMappings = KNOWN_MAPPINGS.drupal;
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
      const license = await checkLicense(locals);
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
            mermaid: ai.generateDataFlowMermaid(result.suggestions, format, "imported_content"),
          };
        } catch {
          /* AI analysis is non-critical */
        }
      }

      return {
        success: true,
        format,
        estimatedCount,
        fieldMappings,
        contentTypes: [...new Set(contentTypes)].filter(Boolean),
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
  dryRun: async ({ request }) => {
    const data = await request.formData();
    const file = data.get("file") as File | null;
    const format = data.get("format") as string;
    if (!file || !format) return fail(400, { error: "File and format required" });

    // Free tier: allow all formats for dry-run (preview only)
    try {
      const engine = await getUCPEngine();
      const txnToken = crypto.randomUUID?.() || `dry_${Date.now()}`;
      const envelope = engine.parseFileToSNC(await file.text(), format as any, txnToken);
      return {
        success: true,
        dryRun: true,
        format,
        estimatedItems: envelope?.entries.length || 0,
        timestamp: nowISODateString(),
      };
    } catch (err) {
      return fail(500, {
        error: err instanceof Error ? err.message : "Validation failed",
      });
    }
  },

  /**
   * Step 4: Import — gated by license for Pro platforms
   */
  import: async ({ request, locals }) => {
    const data = await request.formData();
    const file = data.get("file") as File | null;
    const format = data.get("format") as string;
    const targetCollection = data.get("targetCollection") as string;
    const dbAdapter = (locals as any)?.dbAdapter;
    const tenantId = (locals as any)?.tenantId || "default";

    if (!file || !format || !targetCollection)
      return fail(400, {
        error: "File, format, and targetCollection required",
      });

    // License gate for Pro platforms
    const license = await checkLicense(locals);
    if (PRO_PLATFORMS.has(format) && license.tier !== "pro") {
      return fail(402, {
        error: `${format} import requires a Pro license. Activate at marketplace.sveltycms.com`,
        licenseRequired: true,
      });
    }

    try {
      const engine = await getUCPEngine();
      const txnToken = crypto.randomUUID?.() || `txn_${Date.now()}`;
      const envelope = engine.parseFileToSNC(await file.text(), format as any, txnToken);
      if (!envelope || envelope.entries.length === 0)
        return fail(400, { error: "No entries found" });

      const result = await engine.executeUCPIngestion(dbAdapter, envelope, [], targetCollection, {
        importMedia: false,
        overwrite: false,
        batchSize: 100,
      });
      return {
        success: true,
        ...result,
        transactionToken: txnToken,
        timestamp: nowISODateString(),
      };
    } catch (err) {
      logger.error("[Migration] Import failed:", err);
      return fail(500, {
        error: err instanceof Error ? err.message : "Import failed",
      });
    }
  },

  /**
   * Step 5: Rollback — Pro only
   */
  rollback: async ({ request, locals }) => {
    const data = await request.formData();
    const transactionToken = data.get("transactionToken") as string;
    const dbAdapter = (locals as any)?.dbAdapter;
    if (!transactionToken) return fail(400, { error: "transactionToken required" });

    // Rollback is a Pro feature
    const license = await checkLicense(locals);
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
