/**
 * @file src/plugins/smart-importer/index.ts
 * @description Smart AI-Driven Migration Pro v2.1 — Freemium plugin.
 *
 * ### Free Tier (no license — covers 95% of migration needs)
 * - 5 platform parsers (WordPress, Drupal, Strapi, Directus, SveltyCMS)
 * - Universal formats (CSV, Markdown, SQL, API, Airtable, Notion)
 * - AI field mapping with confidence scores
 * - 5-step visual wizard (Upload → Map → Validate → Import → Review)
 * - Dry-run validation
 * - Batch processing
 * - Content type selection
 * - Draft-by-Default Airgap
 * - Basic conflict resolution (skip, overwrite)
 * - Dead-Letter Queue
 * - Tenant isolation
 * - CLI: import, validate, scaffold
 *
 * ### Pro Tier (marketplace license — enterprise & advanced features)
 * - 31 additional platform parsers (Contentful, Sanity, Shopify, Ghost, etc.)
 * - AST compilers (RichText, PortableText, Lexical)
 * - AI enrichments (word count, reading time, SEO, auto-tagging)
 * - Delta/incremental imports (highwater marks)
 * - Transaction rollback with asset cleanup
 * - Background job queue for 100K+ imports
 * - PII scrubbing (GDPR/CCPA)
 * - Crypto-chained audit logging
 * - Webhooks (CI/CD integration)
 * - Exportable reports
 * - Custom parser plugin API (marketplace)
 * - Migration presets
 * - Advanced conflict resolution (merge, keep_both, per-field)
 * - Smart filters (date, status, content type, field value, sampling)
 * - Resumable imports (checkpoint/restore)
 * - Forward-reference auto-stubbing
 * - Deep JSONPath resolution
 * - Schema diff previews
 * - In-body media harvesting & CDN replacement
 * - Cyclic dependency resolution
 * - Direct database connection streaming
 * - Token auto-conversion during import
 * - Media optimization (resize, WebP, S3 upload)
 * - SSE streaming progress
 * - Rate-limited media downloads
 */

import type { Plugin } from "../types";
import { migrations } from "./migrations/001_ledger_and_dlq";

export const smartImporterPlugin: Plugin = {
  metadata: {
    id: "smart-importer",
    name: "Smart AI-Driven Migration Pro",
    version: "2.1.0",
    description:
      "Universal Content Pipeline: 36+ platforms, AI field mapping, visual wizard, rollback, background jobs. Free for 5 platforms + universal formats; Pro unlocks 31 more + enterprise features.",
    enabled: true,
    icon: "mdi:database-import-outline",
    category: "migration",
    author: "SveltyCMS Team",
  },
  config: {
    public: {
      enableAISuggestions: true,
      importBatchSize: 100,
      supportedFormats: {
        free: ["wordpress", "drupal", "strapi", "directus", "sveltycms"],
        universal: [
          "csv",
          "tsv",
          "markdown",
          "sql",
          "api",
          "json",
          "airtable",
          "notion",
          "firebase",
          "mongodb",
        ],
        pro: [
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
          "payload",
        ],
      },
    },
    private: {
      licenseKey: "",
      isProActivated: false,
      lastVerifiedAt: null as string | null,
    },
  },
  ui: {
    slots: [
      {
        id: "migration-config-tile",
        zone: "config_grid",
        position: 15,
        component: () => import("./ui/config-tile.svelte").then((m) => m.default as any),
        permissions: ["admin", "developer"],
        props: { pluginId: "smart-importer" },
        condition: (ctx: { pluginStates?: Record<string, boolean> }) =>
          ctx?.pluginStates?.["smart-importer"] ?? true,
      },
      {
        id: "migration-workspace",
        zone: "plugin_workspace",
        position: 0,
        component: () => import("./ui/migration-wizard.svelte").then((m) => m.default as any),
        permissions: ["admin", "developer"],
        condition: (ctx: { activePluginId?: string }) => ctx?.activePluginId === "smart-importer",
      },
    ],
  },
  migrations,
  enabledCollections: [],
};

export default smartImporterPlugin;

/**
 * Clear tier definition for UI display and feature gating.
 */
export const FEATURE_TIERS = {
  free: {
    label: "Free",
    platforms: 5,
    universalFormats: 9,
    features: [
      "5 CMS platform parsers",
      "9 universal format parsers (CSV, Markdown, SQL, API, etc.)",
      "AI field mapping with confidence scores",
      "5-step visual wizard",
      "Dry-run validation",
      "Batch processing (100/batch)",
      "Content type selection",
      "Draft-by-Default Airgap",
      "Basic conflict resolution (skip, overwrite)",
      "Dead-Letter Queue",
      "Tenant isolation",
      "CLI: import, validate, scaffold",
    ],
  },
  pro: {
    label: "Pro",
    platforms: 36,
    universalFormats: 9,
    features: [
      "All 36 CMS platform parsers",
      "All 9 universal format parsers",
      "AST compilers (RichText, PortableText, Lexical)",
      "AI enrichments (word count, SEO, auto-tagging)",
      "Delta/incremental imports",
      "Transaction rollback with asset cleanup",
      "Background job queue (100K+ items)",
      "PII scrubbing (GDPR/CCPA)",
      "Crypto-chained audit logging",
      "Webhooks + exportable reports",
      "Custom parser plugin API",
      "Migration presets",
      "Advanced conflict resolution (merge, keep_both, per-field)",
      "Smart filters + partial imports",
      "Resumable imports (checkpoint/restore)",
      "Forward-reference auto-stubbing",
      "Deep JSONPath + schema diff",
      "In-body media harvesting",
      "Cyclic dependency resolution",
      "Direct database connection",
      "Token auto-conversion",
      "Media optimization + S3 upload",
      "SSE streaming progress",
      "Rate-limited media downloads",
    ],
  },
} as const;
