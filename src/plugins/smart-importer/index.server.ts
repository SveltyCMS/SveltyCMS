/**
 * @file src/plugins/smart-importer/index.server.ts
 * @description Universal Content Pipeline (UCP) core.
 *
 * Implements compilers and mappings for:
 * - PHP (WordPress, Joomla, Drupal, Typo3, Craft, Statamic, Magento,
 *   PrestaShop, Grav, ProcessWire)
 * - SaaS Builders (Shopify, Wix, Squarespace, Webflow, HubSpot)
 * - Headless CMS (Strapi, Payload, Directus, Sanity, Contentful, Storyblok, Prismic)
 *
 * ### Features:
 * - platform-specific AST compilation engines
 * - e-commerce variant matrix resolution
 * - marketplace license verification
 * - transactional ingestion with batch processing
 * - rollback ledger with asset cleanup
 * - dead-letter queue for failed entries
 */

import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";
import type { PluginLifecycleHooks, PluginMigration } from "../types";
import type {
  SNCEnvelope,
  SNCEntry,
  FieldMapping,
  LedgerRecord,
  ProductVariant,
  MigrationProgress,
} from "./types";

// ============================================================================
// Server Actions (re-exported so the plugin API dispatcher resolves `actions`
// regardless of which `.server.ts` glob match it picks)
// ============================================================================

export { actions } from "./migration-page.server";

// ============================================================================
// Migrations
// ============================================================================

export const migrations: PluginMigration[] = [
  {
    id: "create_importer_ledger",
    pluginId: "smart-importer",
    version: 1,
    description: "Creates the plugin_importer_ledger collection",
    up: async (dbAdapter) => {
      try {
        await dbAdapter.collection.createModel({
          _id: "plugin_importer_ledger",
          name: "plugin_importer_ledger",
          slug: "plugin_importer_ledger",
          fields: [
            {
              label: "Transaction Token",
              name: "transactionToken",
              type: "text",
              required: true,
            },
            { label: "Source Platform", name: "sourcePlatform", type: "text" },
            {
              label: "Target Collection",
              name: "targetCollection",
              type: "text",
            },
            { label: "Timestamp", name: "timestamp", type: "text" },
            {
              label: "Imported Count",
              name: "importedCount",
              type: "number",
              defaultValue: 0,
            },
            {
              label: "Mirrored Asset Paths",
              name: "mirroredAssetPaths",
              type: "text",
            },
          ],
          status: "publish",
        } as any);
        logger.info("[SmartImporter] Provisioned plugin_importer_ledger collection.");
      } catch (err) {
        logger.error("[SmartImporter] Failed to provision ledger collection:", err);
      }
    },
  },
  {
    id: "create_importer_dlq",
    pluginId: "smart-importer",
    version: 2,
    description: "Creates the plugin_importer_dlq (Dead-Letter Queue) collection",
    up: async (dbAdapter) => {
      try {
        await dbAdapter.collection.createModel({
          _id: "plugin_importer_dlq",
          name: "plugin_importer_dlq",
          slug: "plugin_importer_dlq",
          fields: [
            {
              label: "Transaction Token",
              name: "transactionToken",
              type: "text",
              required: true,
            },
            { label: "External ID", name: "externalId", type: "text" },
            { label: "Raw Entry", name: "rawEntry", type: "text" },
            { label: "Error Trace", name: "errorTrace", type: "text" },
            { label: "Timestamp", name: "timestamp", type: "text" },
          ],
          status: "publish",
        } as any);
        logger.info("[SmartImporter] Provisioned plugin_importer_dlq collection.");
      } catch (err) {
        logger.error("[SmartImporter] Failed to provision DLQ collection:", err);
      }
    },
  },
];

// ============================================================================
// Lifecycle Hooks
// ============================================================================

export const hooks: PluginLifecycleHooks = {
  /**
   * Draft-by-Default Airgap: forces all migration payloads to draft status.
   */
  beforeSave: async (_context, _collection, data) => {
    if (data._isMigrationPayload) {
      data.status = "draft";
      logger.info(
        `[SmartImporter] Enforced Airgap Safety on [${data.title || data._externalId}]. State: DRAFT.`,
      );
    }
    return data;
  },
};

// ============================================================================
// Platform-Specific AST & Structure Compilation Engines
// ============================================================================

/**
 * Contentful RichText AST → HTML
 */
export function compileContentfulRichText(node: any): string {
  if (!node) return "";
  if (node.nodeType === "text") {
    let value = node.value || "";
    if (node.marks?.some((m: any) => m.type === "bold")) value = `<strong>${value}</strong>`;
    if (node.marks?.some((m: any) => m.type === "italic")) value = `<em>${value}</em>`;
    if (node.marks?.some((m: any) => m.type === "underline")) value = `<u>${value}</u>`;
    if (node.marks?.some((m: any) => m.type === "code")) value = `<code>${value}</code>`;
    return value;
  }
  const childHtml = node.content?.map(compileContentfulRichText).join("") || "";
  switch (node.nodeType) {
    case "paragraph":
      return `<p>${childHtml}</p>`;
    case "heading-1":
      return `<h1>${childHtml}</h1>`;
    case "heading-2":
      return `<h2>${childHtml}</h2>`;
    case "heading-3":
      return `<h3>${childHtml}</h3>`;
    case "unordered-list":
      return `<ul>${childHtml}</ul>`;
    case "ordered-list":
      return `<ol>${childHtml}</ol>`;
    case "list-item":
      return `<li>${childHtml}</li>`;
    case "blockquote":
      return `<blockquote>${childHtml}</blockquote>`;
    default:
      return childHtml;
  }
}

/**
 * Sanity Portable Text → HTML
 */
export function compileSanityPortableText(blocks: any[]): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((block) => {
      if (block._type !== "block") {
        if (block._type === "image") {
          return `<figure><img src="${block.asset?._ref || ""}" alt="Sanity Image" /></figure>`;
        }
        return "";
      }
      const childSpans =
        block.children
          ?.map((child: any) => {
            let text = child.text || "";
            if (block.markDefs && child.marks) {
              for (const markKey of child.marks) {
                const def = block.markDefs.find((d: any) => d._key === markKey);
                if (def?._type === "link") {
                  text = `<a href="${def.href}" target="_blank" rel="noopener">${text}</a>`;
                }
              }
            }
            return text;
          })
          .join("") || "";
      switch (block.style) {
        case "h1":
          return `<h1>${childSpans}</h1>`;
        case "h2":
          return `<h2>${childSpans}</h2>`;
        case "h3":
          return `<h3>${childSpans}</h3>`;
        case "blockquote":
          return `<blockquote>${childSpans}</blockquote>`;
        default:
          return `<p>${childSpans}</p>`;
      }
    })
    .join("\n");
}

/**
 * Ghost Lexical → HTML
 */
export function compileGhostLexical(lexicalJsonString: string): string {
  try {
    const raw = JSON.parse(lexicalJsonString);
    const root = raw.root;
    if (!root || !Array.isArray(root.children)) return "";
    return root.children
      .map((child: any) => {
        const text = child.children?.map((t: any) => t.text || "").join("") || "";
        if (child.type === "heading" && child.tag === "h1") return `<h1>${text}</h1>`;
        if (child.type === "heading" && child.tag === "h2") return `<h2>${text}</h2>`;
        if (child.type === "quote") return `<blockquote>${text}</blockquote>`;
        return `<p>${text}</p>`;
      })
      .join("\n");
  } catch {
    return lexicalJsonString;
  }
}

/**
 * TYPO3 tt_content → HTML
 */
export function compileTypo3ContentBlocks(records: any[]): string {
  if (!Array.isArray(records)) return "";
  return records
    .sort((a, b) => (a.sorting || 0) - (b.sorting || 0))
    .map((rec) => {
      const header = rec.header ? `<h2>${rec.header}</h2>` : "";
      const body = rec.bodytext || "";
      return `<div class="typo3-element" id="c${rec.uid}">${header}\n${body}</div>`;
    })
    .join("\n");
}

/**
 * Craft CMS Matrix Fields → HTML
 */
export function compileCraftMatrixFields(blocks: any[]): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((block) => {
      const type = block.type?.handle || block.type || "text";
      if (type === "richText" || type === "text") {
        return `<div class="craft-block-text">${block.fields?.text || block.text || ""}</div>`;
      }
      if (type === "image" || type === "asset") {
        return `<figure class="craft-block-asset"><img src="${block.fields?.image?.url || block.url || ""}" alt="Asset Block" /></figure>`;
      }
      return `<div class="craft-block-custom" data-type="${type}">${JSON.stringify(block.fields || block)}</div>`;
    })
    .join("\n");
}

/**
 * Modular Slices (Storyblok, Prismic, Builder.io) → HTML
 */
export function compileModularSlices(slices: any[]): string {
  if (!Array.isArray(slices)) return "";
  return slices
    .map((slice) => {
      const type = slice.slice_type || slice.component || "unknown";
      if (type === "text" || type === "rich-text") {
        return `<div class="slice-paragraph">${slice.primary?.text || slice.text || ""}</div>`;
      }
      if (type === "hero" || type === "callout") {
        const title = slice.primary?.title || slice.title || "";
        const mediaUrl = slice.primary?.image?.url || slice.image || "";
        return `<section class="slice-hero-banner" style="background-image: url('${mediaUrl}')"><h1>${title}</h1></section>`;
      }
      return `<div class="slice-component-block" data-slice-type="${type}">${JSON.stringify(slice.primary || slice)}</div>`;
    })
    .join("\n");
}

/**
 * E-Commerce Variant Matrix (Shopify, Magento, OpenCart, PrestaShop)
 */
export function processEcommerceVariants(variants: any[]): ProductVariant[] {
  if (!Array.isArray(variants)) return [];
  return variants.map((v) => ({
    id: String(
      v.id ||
        v.variant_id ||
        (typeof crypto !== "undefined"
          ? crypto.randomUUID()
          : `var_${Date.now()}_${Math.random().toString(36).slice(2)}`),
    ),
    sku: String(v.sku || ""),
    title: String(v.title || v.name || "Default Option"),
    price: parseFloat(v.price || "0"),
    inventoryQuantity: parseInt(v.inventory_quantity || v.qty || "0", 10),
    options: Array.isArray(v.options)
      ? v.options
      : [{ name: "Option", value: v.option1 || v.value || "Default" }],
  }));
}

// ============================================================================
// Core Execution & Rollback Services
// ============================================================================

/**
 * Verifies subscription/license keys against marketplace.sveltycms.com
 */
export async function verifyMarketplaceLicense(
  licenseKey: string,
  appId: string,
): Promise<boolean> {
  if (!licenseKey) return false;

  let delay = 1000;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch("https://marketplace.sveltycms.com/api/v1/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey,
          appId,
          pluginId: "smart-importer",
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return !!result.valid;
      }
    } catch {
      if (attempt === 5) {
        logger.error("[SmartImporter] License verification failed after 5 attempts.");
        return false;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  return false;
}

/**
 * Executable Core: normalizes, downloads assets, resolves relations,
 * and writes records in non-blocking batches.
 */
const BULK_INSERT_THRESHOLD = 10;

export interface IngestionOptions {
  importMedia: boolean;
  overwrite: boolean;
  batchSize?: number;
  /** Use database-native bulk insert when batch is large enough (default: true) */
  useBulk?: boolean;
  /** Forward-reference stub resolution for parent/child relations (default: true) */
  resolveStubs?: boolean;
  /** Optimize downloaded media via sharp (default: true when importMedia is on) */
  optimizeMedia?: boolean;
  /** Scrub PII from entry payloads before insert (Pro feature) */
  scrubPii?: boolean;
}

/** Build parent→child dependency graph from entries in the same import batch */
export function buildEntryDependencyGraph(entries: SNCEntry[]): Record<string, string[]> {
  const ids = new Set(entries.map((e) => e.externalId));
  const graph: Record<string, string[]> = {};

  for (const entry of entries) {
    graph[entry.externalId] = [];
    if (entry.parentExternalId && ids.has(entry.parentExternalId)) {
      graph[entry.externalId].push(entry.parentExternalId);
    }
  }

  return graph;
}

async function prepareEntryPayload(
  dbAdapter: unknown,
  entry: SNCEntry,
  mappings: FieldMapping[],
  platform: string,
  transactionToken: string,
  targetCollection: string,
  options: IngestionOptions,
  mirroredPaths: string[],
  resolveStubs: boolean,
): Promise<Record<string, unknown>> {
  let processedPayload = applyPlatformTransformations(entry, mappings, platform);

  if (options.scrubPii) {
    const { scrubPII } = await import("./enterprise");
    const { cleaned } = scrubPII(processedPayload);
    processedPayload = cleaned;
  }

  if (options.importMedia && entry.assetsToMirror.length > 0) {
    const localMediaIds = await mirrorAssetsLocally(
      dbAdapter,
      entry.assetsToMirror,
      mirroredPaths,
      options.optimizeMedia !== false,
    );
    if (localMediaIds.length > 0) {
      processedPayload.featuredImage = localMediaIds[0];
    }
  }

  if (entry.ecommerce) {
    processedPayload.ecommerce = {
      sku: entry.ecommerce.sku || "",
      price: entry.ecommerce.price || 0,
      compareAtPrice: entry.ecommerce.compareAtPrice || null,
      inventoryQuantity: entry.ecommerce.inventoryQuantity || 0,
      variants: processEcommerceVariants(entry.ecommerce.variants),
    };
  }

  processedPayload._isMigrationPayload = true;
  processedPayload._externalId = entry.externalId;
  processedPayload._transactionToken = transactionToken;
  processedPayload.status = "draft";

  if (resolveStubs && entry.parentExternalId) {
    const { ensureRelationStub } = await import("./advanced-features");
    const stub = await ensureRelationStub(
      { dbAdapter },
      targetCollection,
      entry.parentExternalId,
      transactionToken,
    );
    processedPayload.parentId = stub.id;
  }

  return processedPayload;
}

async function persistEntry(
  dbAdapter: unknown,
  targetCollection: string,
  entry: SNCEntry,
  payload: Record<string, unknown>,
  options: IngestionOptions,
  resolveStubs: boolean,
): Promise<void> {
  if (resolveStubs && !options.overwrite) {
    const { resolveRelationStub } = await import("./advanced-features");
    await resolveRelationStub({ dbAdapter }, targetCollection, entry.externalId, payload);
    return;
  }

  if (options.overwrite) {
    const existingResult = await (dbAdapter as any).crud.findOne(targetCollection, {
      _externalId: entry.externalId,
    });
    const existing = existingResult?.success ? existingResult.data : null;
    if (existing) {
      await (dbAdapter as any).crud.updateOne(targetCollection, { _id: existing._id }, payload);
    } else {
      await (dbAdapter as any).crud.insert(targetCollection, payload);
    }
    return;
  }

  await (dbAdapter as any).crud.insert(targetCollection, payload);
}

async function pushToDlq(
  dbAdapter: unknown,
  transactionToken: string,
  entry: SNCEntry,
  err: unknown,
): Promise<void> {
  try {
    await (dbAdapter as any).crud.insert("plugin_importer_dlq", {
      transactionToken,
      externalId: entry.externalId,
      rawEntry: JSON.stringify(entry),
      errorTrace: err instanceof Error ? err.message : String(err),
      timestamp: nowISODateString(),
    });
  } catch {
    /* DLQ insert failure is non-fatal */
  }
}

export async function orderEntriesForIngestion(entries: SNCEntry[]): Promise<{
  ordered: SNCEntry[];
  cycles: string[][];
}> {
  const graph = buildEntryDependencyGraph(entries);
  const { resolveCyclicDependencies } = await import("./advanced-features");
  const { orderedCollections, cyclesDetected } = resolveCyclicDependencies(graph);
  const rank = new Map(orderedCollections.map((id, index) => [id, index]));

  const ordered = [...entries].sort(
    (a, b) => (rank.get(a.externalId) ?? 0) - (rank.get(b.externalId) ?? 0),
  );

  return { ordered, cycles: cyclesDetected };
}

export async function executeUCPIngestion(
  dbAdapter: any,
  envelope: SNCEnvelope,
  mappings: FieldMapping[],
  targetCollection: string,
  options: IngestionOptions,
  onProgress?: (progress: MigrationProgress) => void,
): Promise<{ success: boolean; imported: number; failed: number }> {
  const batchSize = options.batchSize || 100;
  const useBulk = options.useBulk !== false;
  const resolveStubs = options.resolveStubs !== false;

  const { ordered, cycles } = await orderEntriesForIngestion(envelope.entries);
  if (cycles.length > 0) {
    logger.warn(
      `[SmartImporter] ${cycles.length} dependency cycle(s) detected — using best-effort order`,
    );
  }

  const totalEntries = ordered.length;
  let imported = 0;
  let failed = 0;
  const mirroredPaths: string[] = [];

  const emitProgress = (currentItem: string, phase: MigrationProgress["phase"] = "processing") => {
    onProgress?.({
      current: imported + failed,
      total: totalEntries,
      currentItem,
      phase,
    });
  };

  for (let i = 0; i < totalEntries; i += batchSize) {
    const chunk = ordered.slice(i, i + batchSize);
    const prepared: Array<{
      entry: SNCEntry;
      payload: Record<string, unknown>;
    }> = [];

    for (const entry of chunk) {
      try {
        const payload = await prepareEntryPayload(
          dbAdapter,
          entry,
          mappings,
          envelope.sourcePlatform,
          envelope.transactionToken,
          targetCollection,
          options,
          mirroredPaths,
          resolveStubs,
        );
        prepared.push({ entry, payload });
      } catch (err) {
        failed++;
        await pushToDlq(dbAdapter, envelope.transactionToken, entry, err);
        emitProgress(entry.title);
      }
    }

    const canBulk =
      useBulk &&
      !options.overwrite &&
      prepared.length >= BULK_INSERT_THRESHOLD &&
      prepared.every(({ entry }) => !entry.parentExternalId);

    if (canBulk) {
      const { bulkInsert } = await import("./performance");
      const payloads = prepared.map((p) => p.payload);
      const { count } = await bulkInsert(dbAdapter, targetCollection, payloads, {});
      imported += count;
      const bulkFailed = payloads.length - count;
      failed += bulkFailed;

      if (bulkFailed > 0) {
        for (const item of prepared.slice(count)) {
          await pushToDlq(
            dbAdapter,
            envelope.transactionToken,
            item.entry,
            new Error("Bulk insert skipped or failed"),
          );
        }
      }

      emitProgress(prepared.at(-1)?.entry.title ?? "Batch complete");
    } else {
      for (const { entry, payload } of prepared) {
        try {
          await persistEntry(dbAdapter, targetCollection, entry, payload, options, resolveStubs);
          imported++;
        } catch (err) {
          failed++;
          await pushToDlq(dbAdapter, envelope.transactionToken, entry, err);
        }
        emitProgress(entry.title);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // Create ledger record
  try {
    await dbAdapter.crud.insert("plugin_importer_ledger", {
      transactionToken: envelope.transactionToken,
      sourcePlatform: envelope.sourcePlatform,
      targetCollection,
      timestamp: nowISODateString(),
      importedCount: imported,
      mirroredAssetPaths: mirroredPaths,
    });
  } catch (err) {
    logger.error("[SmartImporter] Failed to write ledger record:", err);
  }

  if (onProgress) {
    onProgress({
      current: imported + failed,
      total: totalEntries,
      currentItem: "Complete",
      phase: "completed",
    });
  }

  return { success: true, imported, failed };
}

/**
 * Rollback a transactional import: purge draft records + mirrored assets.
 */
export async function rollbackTransaction(
  dbAdapter: any,
  transactionToken: string,
): Promise<boolean> {
  const ledgerResult = await dbAdapter.crud.findOne("plugin_importer_ledger", {
    transactionToken,
  });
  const ledger: LedgerRecord | null = ledgerResult.success ? ledgerResult.data : null;

  if (!ledger) {
    logger.warn(`[SmartImporter] Transaction [${transactionToken}] not found for rollback.`);
    return false;
  }

  // 1. Purge draft documents
  await dbAdapter.crud.deleteMany(ledger.targetCollection, {
    _transactionToken: transactionToken,
  });

  // 2. Remove mirrored assets (best-effort via media adapter delete)
  if (ledger.mirroredAssetPaths.length > 0) {
    for (const path of ledger.mirroredAssetPaths) {
      try {
        await dbAdapter.crud.deleteMany("media", { absolutePath: path } as any);
      } catch (err) {
        logger.error(`[SmartImporter] Failed to prune media asset: ${path}`, err);
      }
    }
  }

  // 3. Clear DLQ entries
  await dbAdapter.crud.deleteMany("plugin_importer_dlq", { transactionToken });

  // 4. Remove ledger record
  await dbAdapter.crud.deleteOne("plugin_importer_ledger", { _id: ledger._id });

  logger.info(`[SmartImporter] Transaction [${transactionToken}] rolled back successfully.`);
  return true;
}

// ============================================================================
// Wizard → Pipeline Mapping Bridge
// ============================================================================

/** Field mapping row from the migration wizard UI */
export interface WizardMappingRow {
  source: string;
  target: string;
  confidence: number;
  type: string;
  action?: string;
}

/** Converts wizard mapping rows into pipeline FieldMapping descriptors */
export function wizardMappingsToFieldMappings(rows: WizardMappingRow[]): FieldMapping[] {
  return rows.map((m) => ({
    sourceField: m.source,
    targetField: m.target,
    widgetType: m.type,
    confidence: m.confidence >= 80 ? "high" : m.confidence >= 50 ? "medium" : "low",
    action: m.action === "ignore" ? "ignore" : "map",
  }));
}

const KNOWN_SOURCE_ALIASES: Record<string, (entry: SNCEntry) => unknown> = {
  post_title: (e) => e.title,
  title: (e) => e.title,
  "content:encoded": (e) => e.content,
  content: (e) => e.content,
  "excerpt:encoded": (e) => e.excerpt,
  excerpt: (e) => e.excerpt,
  "wp:post_name": (e) => e.slug,
  slug: (e) => e.slug,
  "wp:status": (e) => e.status,
  status: (e) => e.status,
  "wp:post_date": (e) => e.createdAt,
  createdAt: (e) => e.createdAt,
  "wp:post_modified": (e) => e.updatedAt,
  updatedAt: (e) => e.updatedAt,
  "dc:creator": (e) => e.authorName,
  author: (e) => e.authorName,
  "wp:post_parent": (e) => e.parentExternalId,
  parentId: (e) => e.parentExternalId,
  "wp:menu_order": (e) => e.menuOrder,
  order: (e) => e.menuOrder,
};

function resolveMappingSourceValue(entry: SNCEntry, sourceField: string): unknown {
  const resolver = KNOWN_SOURCE_ALIASES[sourceField];
  if (resolver) return resolver(entry);
  return entry.rawCustomFields[sourceField];
}

// ============================================================================
// Internal Routing & Sanitization Filters
// ============================================================================

function applyPlatformTransformations(
  entry: SNCEntry,
  mappings: FieldMapping[],
  platform: string,
): Record<string, any> {
  const output: Record<string, any> = {
    title: entry.title,
    slug: entry.slug,
    createdAt: entry.createdAt || nowISODateString(),
    updatedAt: entry.updatedAt || nowISODateString(),
  };

  let compiledContent = entry.content || "";
  const rawFields = entry.rawCustomFields;

  // Dynamic AST routing
  if (platform === "contentful" && rawFields._astContent) {
    compiledContent = compileContentfulRichText(rawFields._astContent);
  } else if (platform === "sanity" && Array.isArray(rawFields._portableText)) {
    compiledContent = compileSanityPortableText(rawFields._portableText as any[]);
  } else if (platform === "ghost" && rawFields._lexicalData) {
    compiledContent = compileGhostLexical(rawFields._lexicalData as string);
  } else if (platform === "typo3" && Array.isArray(rawFields._ttContent)) {
    compiledContent = compileTypo3ContentBlocks(rawFields._ttContent as any[]);
  } else if (platform === "craft" && Array.isArray(rawFields._matrixFields)) {
    compiledContent = compileCraftMatrixFields(rawFields._matrixFields as any[]);
  } else if (
    ["storyblok", "prismic", "builder"].includes(platform) &&
    Array.isArray(rawFields._slices)
  ) {
    compiledContent = compileModularSlices(rawFields._slices as any[]);
  }

  output.content = compiledContent;

  // Apply field mappings (wizard aliases + raw custom fields)
  for (const map of mappings) {
    if (map.action === "ignore") continue;
    const value = resolveMappingSourceValue(entry, map.sourceField);
    if (value !== undefined) {
      output[map.targetField] = value;
    }
  }

  return output;
}

async function mirrorAssetsLocally(
  dbAdapter: any,
  assets: SNCEntry["assetsToMirror"],
  mirroredPaths: string[],
  _optimize = true,
): Promise<string[]> {
  const localIds: string[] = [];
  const { validateEgressUrl } = await import("@src/utils/egress-guard");
  const { persistMigratedAsset } = await import("./utils/migrated-media.server");
  const { getMimeType } = await import("@src/utils/media/media-utils");

  for (const asset of assets) {
    try {
      validateEgressUrl(asset.externalUrl, {
        allowHttp: process.env.NODE_ENV === "development",
      });

      const response = await fetch(asset.externalUrl, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`Asset download failed: ${asset.externalUrl} (HTTP ${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > 100 * 1024 * 1024) {
        throw new Error(`Asset too large: ${asset.externalUrl}`);
      }

      const filename =
        asset.externalUrl.split("/").pop()?.split("?")[0] || `migrated_${asset.originalId}.png`;
      const mimeType =
        response.headers.get("Content-Type")?.split(";")[0]?.trim() ||
        getMimeType(filename) ||
        "application/octet-stream";

      const mediaId = await persistMigratedAsset(dbAdapter, {
        buffer: Buffer.from(arrayBuffer),
        filename,
        mimeType,
        altText: asset.altText,
        userId: "migration",
      });

      if (mediaId) {
        localIds.push(mediaId);
        mirroredPaths.push(`/media/migrated/${filename}`);
      }
    } catch (err) {
      logger.error(`[SmartImporter] Media download failed for [${asset.externalUrl}]`, err);
    }
  }
  return localIds;
}

// ============================================================================
// Platform-Specific Format Parsers (Raw File → SNC Envelope)
// ============================================================================

/**
 * Contentful Space Export JSON → SNC Envelope
 * Parses Contentful's contentful-export JSON format with entries, assets, and locales.
 */
export function parseContentfulExport(
  jsonText: string,
  transactionToken: string,
): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const entries: SNCEntry[] = [];

    // Contentful export has .entries array with sys + fields
    const rawEntries = raw.entries || [];
    for (const item of rawEntries) {
      const sys = item.sys || {};
      const fields = item.fields || {};

      entries.push({
        externalId: String(sys.id || ""),
        title: String(
          fields.title?.["en-US"] ||
            fields.title ||
            Object.values(fields.title || {})[0] ||
            "Untitled",
        ),
        slug: String(fields.slug?.["en-US"] || fields.slug || ""),
        status: sys.publishedAt ? "published" : "draft",
        content: "", // Rich text handled by AST compiler
        createdAt: sys.createdAt || nowISODateString(),
        updatedAt: sys.updatedAt || nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: {
          ...fields,
          _astContent: fields.body?.["en-US"] || fields.richText?.["en-US"],
        },
        assetsToMirror: extractContentfulAssets(fields),
      });
    }

    return {
      sourcePlatform: "contentful",
      version: raw.version || "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

/**
 * Sanity NDJSON Export → SNC Envelope
 * Sanity exports as newline-delimited JSON with _id, _type, and field data.
 */
export function parseSanityExport(
  ndjsonText: string,
  transactionToken: string,
): SNCEnvelope | null {
  try {
    const lines = ndjsonText.trim().split("\n");
    const entries: SNCEntry[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const doc = JSON.parse(line);
        if (!doc._id || doc._type === "system.metadata") continue;

        entries.push({
          externalId: String(doc._id),
          title: String(doc.title || doc.name || doc._id),
          slug: String(doc.slug?.current || doc.slug || ""),
          status: doc._id?.startsWith("drafts.") ? "draft" : "published",
          content: "",
          createdAt: doc._createdAt || nowISODateString(),
          updatedAt: doc._updatedAt || nowISODateString(),
          taxonomies: { vocabularies: [], terms: {} },
          rawCustomFields: { ...doc, _portableText: doc.body || doc.content },
          assetsToMirror: extractSanityAssets(doc),
        });
      } catch {
        // Skip malformed lines
      }
    }

    return {
      sourcePlatform: "sanity",
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

/**
 * Ghost JSON Export → SNC Envelope
 * Ghost exports as JSON with db[0].data.posts array.
 */
export function parseGhostExport(jsonText: string, transactionToken: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const posts = raw.db?.[0]?.data?.posts || raw.posts || [];
    const entries: SNCEntry[] = [];

    for (const post of posts) {
      entries.push({
        externalId: String(post.id || post.uuid || ""),
        title: String(post.title || "Untitled"),
        slug: String(post.slug || ""),
        status: post.status === "published" ? "published" : "draft",
        content: "",
        excerpt: String(post.custom_excerpt || post.excerpt || ""),
        createdAt: post.created_at || nowISODateString(),
        updatedAt: post.updated_at || nowISODateString(),
        authorName: String(post.author || ""),
        taxonomies: {
          vocabularies: ["tags"],
          terms: {
            tags: Array.isArray(post.tags) ? post.tags.map((t: any) => String(t.name || t)) : [],
          },
        },
        rawCustomFields: {
          ...post,
          _lexicalData: post.mobiledoc || post.lexical,
        },
        assetsToMirror: post.feature_image
          ? [
              {
                externalUrl: post.feature_image,
                originalId: String(post.id),
                fieldTarget: "featuredImage",
                altText: post.feature_image_alt || "",
              },
            ]
          : [],
      });
    }

    return {
      sourcePlatform: "ghost",
      version: raw.version || "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

/**
 * Webflow CMS Collections CSV → SNC Envelope
 * Parses CSV exports with "Item" columns and multi-reference fields.
 */
export function parseWebflowExport(csvText: string, transactionToken: string): SNCEnvelope | null {
  try {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return null;

    const headers = parseCSVLine(lines[0]);
    const entries: SNCEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      const entry: any = {
        externalId: values[headers.indexOf("_id")] || values[0] || `wf_${i}`,
        title: values[headers.indexOf("Name")] || values[headers.indexOf("name")] || "Untitled",
        slug: values[headers.indexOf("Slug")] || values[headers.indexOf("slug")] || "",
        status:
          values[headers.indexOf("_archived")] === "true"
            ? "archived"
            : values[headers.indexOf("_draft")] === "true"
              ? "draft"
              : "published",
        content: "",
        createdAt: values[headers.indexOf("Created On")] || nowISODateString(),
        updatedAt: values[headers.indexOf("Updated On")] || nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: {} as Record<string, unknown>,
        assetsToMirror: [] as any[],
      };

      // Map all columns to rawCustomFields
      for (let j = 0; j < headers.length; j++) {
        entry.rawCustomFields[headers[j]] = values[j] || "";
        // Detect image columns
        if (headers[j].toLowerCase().includes("image") && values[j]?.startsWith("http")) {
          entry.assetsToMirror.push({
            externalUrl: values[j],
            originalId: `${entry.externalId}_${headers[j]}`,
            fieldTarget: headers[j],
          });
        }
      }

      entries.push(entry);
    }

    return {
      sourcePlatform: "webflow",
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

/**
 * Shopify Products JSON/CSV → SNC Envelope
 * Parses product data with variants, prices, and inventory.
 */
export function parseShopifyExport(jsonText: string, transactionToken: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const products = raw.products || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const product of products) {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const firstVariant = variants[0] || {};

      entries.push({
        externalId: String(product.id || ""),
        title: String(product.title || "Untitled Product"),
        slug: String(product.handle || ""),
        status: product.status === "active" ? "published" : "draft",
        content: String(product.body_html || product.description || ""),
        createdAt: product.created_at || nowISODateString(),
        updatedAt: product.updated_at || nowISODateString(),
        taxonomies: {
          vocabularies: ["product_type", "tags", "vendor"],
          terms: {
            product_type: [String(product.product_type || "")],
            tags:
              typeof product.tags === "string"
                ? product.tags.split(",").map((t: string) => t.trim())
                : [],
            vendor: [String(product.vendor || "")],
          },
        },
        rawCustomFields: product,
        ecommerce: {
          sku: String(firstVariant.sku || ""),
          price: parseFloat(firstVariant.price || "0"),
          compareAtPrice: firstVariant.compare_at_price
            ? parseFloat(firstVariant.compare_at_price)
            : undefined,
          inventoryQuantity: variants.reduce(
            (sum: number, v: any) => sum + (parseInt(v.inventory_quantity) || 0),
            0,
          ),
          variants: processEcommerceVariants(
            variants.map((v: any) => ({
              id: v.id,
              sku: v.sku,
              title: v.title,
              price: parseFloat(v.price || "0"),
              inventory_quantity: parseInt(v.inventory_quantity || "0"),
              options: [
                { name: "Size", value: v.option1 || "" },
                { name: "Color", value: v.option2 || "" },
                { name: "Material", value: v.option3 || "" },
              ].filter((o: any) => o.value),
            })),
          ),
        },
        assetsToMirror: product.image?.src
          ? [
              {
                externalUrl: product.image.src,
                originalId: String(product.id),
                fieldTarget: "featuredImage",
                altText: product.image.alt || "",
              },
            ]
          : [],
      });
    }

    return {
      sourcePlatform: "shopify",
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

/**
 * Storyblok Stories JSON → SNC Envelope
 */
export function parseStoryblokExport(
  jsonText: string,
  transactionToken: string,
): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const stories = raw.stories || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const story of stories) {
      const content = story.content || {};
      entries.push({
        externalId: String(story.uuid || story.id || ""),
        title: String(story.name || "Untitled"),
        slug: String(story.full_slug || story.slug || ""),
        status: story.published ? "published" : "draft",
        content: "",
        createdAt: story.created_at || nowISODateString(),
        updatedAt: story.published_at || story.updated_at || nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: { ...content, _slices: content.body || [] },
        assetsToMirror: extractStoryblokAssets(content),
      });
    }

    return {
      sourcePlatform: "storyblok",
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

/**
 * Prismic Documents JSON → SNC Envelope
 */
export function parsePrismicExport(jsonText: string, transactionToken: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const docs = raw.results || raw.documents || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const doc of docs) {
      const data = doc.data || {};
      entries.push({
        externalId: String(doc.id || doc.uid || ""),
        title: String(
          (data.title && (typeof data.title === "object" ? data.title[0]?.text : data.title)) ||
            doc.uid ||
            "Untitled",
        ),
        slug: String(doc.uid || doc.slugs?.[0] || ""),
        status: doc.first_publication_date ? "published" : "draft",
        content: "",
        createdAt: doc.first_publication_date || nowISODateString(),
        updatedAt: doc.last_publication_date || nowISODateString(),
        languageCode: String(doc.lang || ""),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: { ...data, _slices: data.body || data.slices || [] },
        assetsToMirror: extractPrismicAssets(data),
      });
    }

    return {
      sourcePlatform: "prismic",
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

/**
 * Generic JSON parser for Directus, Strapi, Payload, DatoCMS, and custom formats.
 * Uses heuristic field detection to build SNC entries from any JSON structure.
 */
export function parseGenericJSON(
  jsonText: string,
  platform: SNCEnvelope["sourcePlatform"],
  transactionToken: string,
): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const items: any[] =
      raw.data ||
      raw.entries ||
      raw.items ||
      raw.docs ||
      raw.rows ||
      (Array.isArray(raw) ? raw : [raw]);

    const entries: SNCEntry[] = items.map((item: any, idx: number) => {
      const attrs = item.attributes || item.fields || item.properties || item;

      return {
        externalId: String(item.id || item._id || item.uuid || item.slug || `entry_${idx}`),
        title: String(
          attrs.title || attrs.name || attrs.label || item.title || item.name || `Entry ${idx + 1}`,
        ),
        slug: String(attrs.slug || item.slug || item.handle || ""),
        status: mapStatus(attrs.status || item.status || "draft"),
        content: String(attrs.content || attrs.body || attrs.text || attrs.description || ""),
        excerpt: String(attrs.excerpt || attrs.summary || attrs.description || ""),
        createdAt:
          attrs.createdAt ||
          attrs.created_at ||
          attrs.publishedAt ||
          item.date_created ||
          nowISODateString(),
        updatedAt: attrs.updatedAt || attrs.updated_at || item.date_updated || nowISODateString(),
        authorName: String(attrs.author || item.author || attrs.createdBy || ""),
        languageCode: String(attrs.lang || item.lang || attrs.locale || ""),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: { ...item, ...attrs },
        assetsToMirror: extractAssetsHeuristically(attrs),
      };
    });

    return {
      sourcePlatform: platform,
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Unified Parser Dispatcher
// ============================================================================

/**
 * Master parser: delegates to parsers/index.ts for full platform coverage
 * (WordPress, Drupal, 36+ CMS platforms, universal formats).
 */
export async function parseFileToSNC(
  rawText: string,
  platform: SNCEnvelope["sourcePlatform"] | string,
  transactionToken: string,
): Promise<SNCEnvelope | null> {
  const { parseFileToSNC: dispatchParse } = await import("./parsers/index");
  return dispatchParse(rawText, platform, transactionToken);
}

// ============================================================================
// Asset Extraction Helpers
// ============================================================================

function extractContentfulAssets(fields: Record<string, any>): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  for (const [key, value] of Object.entries(fields)) {
    const localized = value?.["en-US"] || value;
    if (localized?.sys?.type === "Asset" && localized?.fields?.file?.url) {
      const url = localized.fields.file.url.startsWith("//")
        ? `https:${localized.fields.file.url}`
        : localized.fields.file.url;
      assets.push({
        externalUrl: url,
        originalId: String(localized.sys.id),
        fieldTarget: key,
        altText: localized.fields.title?.["en-US"] || "",
      });
    }
  }
  return assets;
}

function extractSanityAssets(doc: Record<string, any>): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  // Sanity image references: { _type: 'image', asset: { _ref: 'image-...' } }
  for (const [key, value] of Object.entries(doc)) {
    if (value?._type === "image" && value?.asset?._ref) {
      assets.push({
        externalUrl: `https://cdn.sanity.io/images/${value.asset._ref}`,
        originalId: value.asset._ref,
        fieldTarget: key,
        altText: value.alt || "",
      });
    }
  }
  return assets;
}

function extractStoryblokAssets(content: Record<string, any>): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  if (content.image?.filename) {
    assets.push({
      externalUrl: content.image.filename,
      originalId: String(content.image.id || ""),
      fieldTarget: "image",
      altText: content.image.alt || "",
    });
  }
  return assets;
}

function extractPrismicAssets(data: Record<string, any>): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  for (const [key, value] of Object.entries(data)) {
    if (
      value?.url &&
      (key.includes("image") || key.includes("thumbnail") || key.includes("avatar"))
    ) {
      assets.push({
        externalUrl: value.url,
        originalId: key,
        fieldTarget: key,
        altText: value.alt || "",
      });
    }
  }
  return assets;
}

function extractAssetsHeuristically(attrs: Record<string, any>): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  const imageUrlKeys = [
    "image",
    "thumbnail",
    "cover",
    "featuredImage",
    "avatar",
    "logo",
    "photo",
    "banner",
    "picture",
  ];
  for (const key of imageUrlKeys) {
    const val = attrs[key];
    if (typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"))) {
      assets.push({ externalUrl: val, originalId: key, fieldTarget: key });
    } else if (val?.url && typeof val.url === "string") {
      assets.push({
        externalUrl: val.url,
        originalId: key,
        fieldTarget: key,
        altText: val.alt || "",
      });
    }
  }
  return assets;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function mapStatus(status: string | undefined): "published" | "draft" | "pending" | "archived" {
  if (!status) return "draft";
  const s = status.toLowerCase();
  if (s === "published" || s === "publish" || s === "active" || s === "1" || s === "true")
    return "published";
  if (s === "pending") return "pending";
  if (s === "archived" || s === "deleted" || s === "trash" || s === "trashed") return "archived";
  return "draft";
}
