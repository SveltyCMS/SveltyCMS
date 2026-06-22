/**
 * @file src/plugins/smart-importer/ai-co-pilot.ts
 * @description AI Migration Co-Pilot — proactive guidance engine for 2026.
 *
 * Watches every user action during migration setup and provides:
 * - Real-time recommendations based on field analysis
 * - Migration health score (0-100) with improvement suggestions
 * - Smart defaults that eliminate manual configuration
 * - Anomaly detection for common migration pitfalls
 * - Progressive disclosure: simple first, advanced on demand
 * - Contextual tips based on source platform and content type
 */

import type { SNCEntry } from "./types";

// ============================================================================
// Types
// ============================================================================

export type RecommendationLevel = "critical" | "warning" | "info" | "success";
export type RecommendationCategory =
  | "field_mapping"
  | "content_type"
  | "media_handling"
  | "taxonomy"
  | "seo"
  | "performance"
  | "security"
  | "quality";

export interface AIRecommendation {
  id: string;
  level: RecommendationLevel;
  category: RecommendationCategory;
  title: string;
  description: string;
  action?: string; // What the user should do
  autoFix?: boolean; // Can the system fix this automatically?
  affectedFields?: string[];
  impact: "high" | "medium" | "low";
}

export interface MigrationHealthReport {
  score: number; // 0-100
  status: "excellent" | "good" | "fair" | "poor" | "critical";
  recommendations: AIRecommendation[];
  summary: string;
  checks: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
  };
}

export interface SmartDefaults {
  targetCollection: string;
  suggestedMappings: FieldMapping[];
  contentTypeGrouping: Record<string, string[]>;
  autoDetectedTaxonomies: string[];
  mediaHandlingStrategy: "download" | "reference" | "skip";
  batchSize: number;
  conflictStrategy: "skip" | "overwrite" | "merge" | "keep_both";
}

// ============================================================================
// Health Score Engine
// ============================================================================

/**
 * Calculates a migration health score (0-100) based on configuration quality.
 * 90-100: Excellent — ready to import
 * 75-89:  Good — minor improvements suggested
 * 50-74:  Fair — several issues to address
 * 25-49:  Poor — significant gaps
 * 0-24:   Critical — major problems
 */
export function calculateMigrationHealth(
  entries: SNCEntry[],
  mappings: FieldMapping[],
  targetCollection: string,
  options: {
    hasLicense?: boolean;
    importMedia?: boolean;
    selectedContentTypes?: string[];
  },
): MigrationHealthReport {
  const recommendations: AIRecommendation[] = [];
  let passed = 0;
  let warnings = 0;
  let failed = 0;
  const total = 10;

  // 1. Check: Has entries to import
  if (entries.length === 0) {
    recommendations.push({
      id: "no_entries",
      level: "critical",
      category: "field_mapping",
      title: "No entries found",
      description:
        "The source file contains no importable content. Check the file format or content type selection.",
      action: "Try a different file or format",
      impact: "high",
    });
    failed++;
  } else {
    passed++;
  }

  // 2. Check: Has field mappings
  if (mappings.length === 0) {
    recommendations.push({
      id: "no_mappings",
      level: "critical",
      category: "field_mapping",
      title: "No field mappings configured",
      description:
        "No source fields are mapped to target fields. The AI can auto-suggest mappings.",
      action: 'Click "AI Auto-Map" to generate suggestions',
      autoFix: true,
      impact: "high",
    });
    failed++;
  } else {
    passed++;
  }

  // 3. Check: Has target collection
  if (!targetCollection || targetCollection.trim() === "") {
    recommendations.push({
      id: "no_target",
      level: "critical",
      category: "field_mapping",
      title: "No target collection specified",
      description: "Choose where to import the content.",
      action: "Enter a collection name or let AI scaffold one",
      autoFix: true,
      impact: "high",
    });
    failed++;
  } else {
    passed++;
  }

  // 4. Check: Title field mapped
  const hasTitleMapping = mappings.some(
    (m) => m.targetField.toLowerCase() === "title" && m.confidence !== "low",
  );
  if (!hasTitleMapping && entries.length > 0) {
    recommendations.push({
      id: "missing_title",
      level: "warning",
      category: "field_mapping",
      title: "Title field may not be mapped",
      description: 'No high-confidence title mapping found. Entries may import as "Untitled".',
      action: 'Map a source field to "title"',
      affectedFields: ["title"],
      impact: "high",
    });
    warnings++;
  } else {
    passed++;
  }

  // 5. Check: Content field mapped
  const hasContentMapping = mappings.some((m) =>
    ["content", "body", "richtext"].includes(m.targetField.toLowerCase()),
  );
  if (!hasContentMapping && entries.some((e) => (e.content || "").length > 100)) {
    recommendations.push({
      id: "missing_content",
      level: "warning",
      category: "field_mapping",
      title: "Content field may not be mapped",
      description: "Entries have substantial content but no content field is mapped.",
      action: 'Map a source field to "content"',
      affectedFields: ["content"],
      impact: "medium",
    });
    warnings++;
  } else {
    passed++;
  }

  // 6. Check: Low-confidence mappings
  const lowConfidenceCount = mappings.filter((m) => m.confidence === "low").length;
  if (lowConfidenceCount > 3) {
    recommendations.push({
      id: "low_confidence",
      level: "warning",
      category: "field_mapping",
      title: `${lowConfidenceCount} low-confidence mappings`,
      description: "These mappings are guesses. Review them before importing.",
      action: "Review and adjust low-confidence mappings",
      affectedFields: mappings.filter((m) => m.confidence === "low").map((m) => m.sourceField),
      impact: "medium",
    });
    warnings++;
  } else {
    passed++;
  }

  // 7. Check: Media handling
  const hasMedia = entries.some((e) => e.assetsToMirror && e.assetsToMirror.length > 0);
  if (hasMedia && !options.importMedia) {
    recommendations.push({
      id: "media_not_importing",
      level: "info",
      category: "media_handling",
      title: "Media assets detected but not importing",
      description: `${entries.filter((e) => e.assetsToMirror?.length > 0).length} entries have media. Enable media import to download them.`,
      action: 'Enable "Import Media" option',
      impact: "medium",
    });
    warnings++;
  } else {
    passed++;
  }

  // 8. Check: Large import performance
  if (entries.length > 10000) {
    recommendations.push({
      id: "large_import",
      level: "info",
      category: "performance",
      title: "Large import detected",
      description: `${entries.length.toLocaleString()} entries — consider using CLI for better performance.`,
      action: "Use CLI: bun run migrate import --file=... for large imports",
      impact: "low",
    });
    passed++;
  } else {
    passed++;
  }

  // 9. Check: Pro features available
  if (
    !options.hasLicense &&
    entries.some((e) => e.rawCustomFields._astContent || e.rawCustomFields._portableText)
  ) {
    recommendations.push({
      id: "pro_recommended",
      level: "info",
      category: "quality",
      title: "Rich text AST detected — Pro recommended",
      description:
        "This export contains structured rich text that benefits from Pro AST compilers.",
      action: "Activate Pro license for best results",
      impact: "medium",
    });
    passed++;
  } else {
    passed++;
  }

  // 10. Check: Taxonomy completeness
  const hasTaxonomy = entries.some(
    (e) => e.taxonomies?.terms && Object.keys(e.taxonomies.terms).length > 0,
  );
  if (hasTaxonomy) {
    const taxonomyFields = mappings.filter(
      (m) => m.widgetType === "Tags" || m.widgetType === "taxonomy",
    );
    if (taxonomyFields.length === 0) {
      recommendations.push({
        id: "taxonomy_unmapped",
        level: "warning",
        category: "taxonomy",
        title: "Taxonomy data found but not mapped",
        description: "Source has tags/categories but no taxonomy fields are mapped.",
        action: 'Map taxonomy source fields to "tags" or "categories"',
        impact: "medium",
      });
      warnings++;
    } else {
      passed++;
    }
  } else {
    passed++;
  }

  // Calculate score
  const score = Math.round((passed / total) * 100);
  const status: MigrationHealthReport["status"] =
    score >= 90
      ? "excellent"
      : score >= 75
        ? "good"
        : score >= 50
          ? "fair"
          : score >= 25
            ? "poor"
            : "critical";

  // Generate summary
  const summary = generateHealthSummary(
    status,
    passed,
    warnings,
    failed,
    entries.length,
    mappings.length,
  );

  return {
    score,
    status,
    recommendations,
    summary,
    checks: { total, passed, warnings, failed },
  };
}

function generateHealthSummary(
  status: string,
  passed: number,
  warnings: number,
  failed: number,
  entryCount: number,
  mappingCount: number,
): string {
  const base = `${entryCount.toLocaleString()} entries, ${mappingCount} field mappings. `;
  switch (status) {
    case "excellent":
      return base + "Your migration is well-configured and ready to import.";
    case "good":
      return base + "Minor improvements could enhance the result.";
    case "fair":
      return (
        base + `Address ${failed} critical issue(s) and ${warnings} warning(s) before importing.`
      );
    case "poor":
      return base + `Significant issues found. AI recommends fixing ${failed} problems first.`;
    case "critical":
      return base + "Critical configuration gaps. Cannot proceed without fixes.";
    default:
      return base;
  }
}

// ============================================================================
// Smart Defaults Engine
// ============================================================================

/**
 * Analyzes source data and provides intelligent defaults for all migration settings.
 * Eliminates manual configuration — users only adjust what the AI gets wrong.
 */
export function generateSmartDefaults(
  entries: SNCEntry[],
  sourcePlatform: string,
  sampleSize: number = 100,
): SmartDefaults {
  const samples = entries.slice(0, sampleSize);

  // 1. Suggest target collection name
  const targetCollection = inferCollectionName(entries, sourcePlatform);

  // 2. Analyze all available fields and suggest mappings
  const allFields = collectAllFields(samples);
  const suggestedMappings = inferMappings(allFields, sourcePlatform);

  // 3. Group entries by detected content type
  const contentTypeGrouping = groupByContentType(samples);

  // 4. Auto-detect taxonomies
  const autoDetectedTaxonomies = detectTaxonomies(samples);

  // 5. Smart media strategy
  const mediaHandlingStrategy = inferMediaStrategy(samples);

  // 6. Adaptive batch size
  const avgSize = estimateAvgEntrySize(samples);
  const batchSize = avgSize > 10000 ? 50 : avgSize > 1000 ? 500 : 2000;

  // 7. Safe conflict strategy
  const conflictStrategy = "skip" as const; // Safest default — never overwrite

  return {
    targetCollection,
    suggestedMappings,
    contentTypeGrouping,
    autoDetectedTaxonomies,
    mediaHandlingStrategy,
    batchSize,
    conflictStrategy,
  };
}

function inferCollectionName(entries: SNCEntry[], platform: string): string {
  // Check for common patterns
  const firstType =
    (entries[0]?.rawCustomFields as any)?._sourceTable ||
    (entries[0]?.rawCustomFields as any)?._drupalType ||
    "";
  if (firstType) return firstType;

  switch (platform) {
    case "wordpress":
      return entries.some((e) => e.parentExternalId) ? "pages" : "posts";
    case "drupal":
      return "nodes";
    case "shopify":
      return "products";
    case "markdown":
      return "pages";
    case "csv":
      return "imported_data";
    default:
      return `imported_${platform}`;
  }
}

function collectAllFields(entries: SNCEntry[]): string[] {
  const fields = new Set<string>();
  for (const entry of entries) {
    for (const key of Object.keys(entry.rawCustomFields)) {
      if (!key.startsWith("_")) fields.add(key);
    }
  }
  return [...fields];
}

function inferMappings(fields: string[], platform: string): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const _knownTargets = [
    "title",
    "content",
    "excerpt",
    "slug",
    "status",
    "createdAt",
    "updatedAt",
    "author",
    "featuredImage",
    "tags",
    "categories",
    "language",
    "seoTitle",
    "seoDescription",
  ];

  for (const field of fields) {
    const lower = field.toLowerCase();
    let target = "";
    let confidence: FieldMapping["confidence"] = "low";
    let widgetType = "text";
    let action: FieldMapping["action"] = "map";

    // Direct matches
    if (lower === "title" || lower === "post_title" || lower === "name") {
      target = "title";
      confidence = "high";
    } else if (
      lower === "content" ||
      lower === "body" ||
      lower === "post_content" ||
      lower === "content:encoded"
    ) {
      target = "content";
      confidence = "high";
      widgetType = "richtext";
    } else if (
      lower === "excerpt" ||
      lower === "summary" ||
      lower === "post_excerpt" ||
      lower === "description"
    ) {
      target = "excerpt";
      confidence = "high";
    } else if (
      lower === "slug" ||
      lower === "post_name" ||
      lower === "handle" ||
      lower === "path"
    ) {
      target = "slug";
      confidence = "high";
    } else if (lower === "status" || lower === "post_status") {
      target = "status";
      confidence = "high";
      widgetType = "select";
    } else if (
      lower.includes("date") ||
      lower.includes("created_at") ||
      lower.includes("updated_at") ||
      lower.includes("published_at")
    ) {
      target =
        lower.includes("update") || lower.includes("change") || lower.includes("modified")
          ? "updatedAt"
          : "createdAt";
      confidence = "high";
      widgetType = "date";
    } else if (
      lower.includes("author") ||
      lower.includes("creator") ||
      lower === "dc:creator" ||
      lower === "uid"
    ) {
      target = "author";
      confidence = "medium";
    } else if (
      lower.includes("image") ||
      lower.includes("thumbnail") ||
      lower.includes("cover") ||
      lower.includes("media") ||
      lower.includes("photo")
    ) {
      target = "featuredImage";
      confidence = "medium";
      widgetType = "media";
    } else if (lower.includes("tag") || lower === "post_tag") {
      target = "tags";
      confidence = "high";
      widgetType = "tags";
    } else if (lower.includes("categor")) {
      target = "categories";
      confidence = "high";
      widgetType = "tags";
    } else if (lower.includes("lang") || lower.includes("locale")) {
      target = "language";
      confidence = "medium";
    } else if (
      lower.includes("seo") ||
      lower.includes("meta_title") ||
      lower.includes("meta_description")
    ) {
      target = lower.includes("desc") ? "seoDescription" : "seoTitle";
      confidence = "medium";
    } else if (lower.includes("price") || lower.includes("cost") || lower.includes("amount")) {
      target = "price";
      confidence = "high";
      widgetType = "number";
    } else if (lower.includes("sku")) {
      target = "sku";
      confidence = "high";
    } else if (lower.includes("email")) {
      target = "email";
      confidence = "high";
      widgetType = "text";
    } else if (lower.includes("phone") || lower.includes("tel")) {
      target = "phone";
      confidence = "medium";
    } else if (lower.includes("url") || lower.includes("link") || lower.includes("href")) {
      target = lower;
      widgetType = "text";
    } else {
      // No clear match — keep as-is with low confidence
      target = field;
      confidence = "low";
    }

    if (target) {
      mappings.push({
        sourceField: field,
        targetField: target,
        widgetType,
        confidence,
        action,
        reason: `AI-suggested: "${field}" → "${target}"`,
      });
    }
  }

  // Sort by confidence
  return mappings.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });
}

function groupByContentType(entries: SNCEntry[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const entry of entries) {
    const type =
      (entry.rawCustomFields as any)?.type ||
      (entry.rawCustomFields as any)?._drupalType ||
      (entry.rawCustomFields as any)?._sourceTable ||
      "default";
    if (!groups[type]) groups[type] = [];
    groups[type].push(entry.externalId);
  }
  return groups;
}

function detectTaxonomies(entries: SNCEntry[]): string[] {
  const taxonomies = new Set<string>();
  for (const entry of entries) {
    for (const vocab of entry.taxonomies?.vocabularies || []) {
      taxonomies.add(vocab);
    }
    for (const key of Object.keys(entry.taxonomies?.terms || {})) {
      taxonomies.add(key);
    }
  }
  return [...taxonomies];
}

function inferMediaStrategy(entries: SNCEntry[]): "download" | "reference" | "skip" {
  const totalAssets = entries.reduce((sum, e) => sum + (e.assetsToMirror?.length || 0), 0);
  if (totalAssets === 0) return "skip";
  if (totalAssets > 100) return "reference"; // Too many to download — reference externally
  return "download";
}

function estimateAvgEntrySize(entries: SNCEntry[]): number {
  if (entries.length === 0) return 2048;
  const total = entries.reduce((sum, e) => sum + JSON.stringify(e).length, 0);
  return Math.round(total / entries.length);
}

// ============================================================================
// Platform-Specific Guidance
// ============================================================================

/**
 * Returns contextual tips based on the source platform and detected content type.
 * These appear as helpful banners during the migration wizard.
 */
export function getPlatformGuidance(platform: string, contentType: string): string[] {
  const tips: string[] = [];

  switch (platform) {
    case "wordpress":
      tips.push(
        "💡 WordPress WXR includes posts, pages, media, and comments. Select content types to import individually.",
      );
      tips.push(
        "💡 ACF custom fields are preserved in rawCustomFields. Map them manually after import.",
      );
      tips.push(
        "💡 Featured images (_thumbnail_id) are automatically detected and queued for download.",
      );
      if (contentType === "page")
        tips.push("💡 Page hierarchy (parent/child) is preserved via parentExternalId.");
      break;

    case "drupal":
      tips.push("💡 Drupal taxonomy terms are resolved from JSON:API included data automatically.");
      tips.push(
        "💡 Entity references are collected for post-import resolution. Check relatedContent after import.",
      );
      tips.push(
        "💡 Revision history (vid, revision_log) is preserved in rawCustomFields._revisions.",
      );
      tips.push(
        "💡 Field Collections and Paragraphs appear as nested rawCustomFields. Consider restructuring after import.",
      );
      break;

    case "shopify":
      tips.push("💡 Product variants are automatically processed into nested variant arrays.");
      tips.push("💡 SKU, price, and inventory are mapped to ecommerce fields.");
      tips.push("💡 Product images are queued for download from Shopify CDN.");
      break;

    case "contentful":
      tips.push(
        "💡 Rich text is compiled from Contentful AST nodes to HTML automatically (Pro feature).",
      );
      tips.push("💡 Embedded assets and entry blocks are resolved to local media links.");
      tips.push("💡 Locale-aware fields are flattened to the default locale during import.");
      break;

    case "sanity":
      tips.push("💡 Portable Text blocks are compiled to semantic HTML (Pro feature).");
      tips.push("💡 Image references are resolved via Sanity CDN and downloaded locally.");
      tips.push('💡 Draft documents (_id starting with "drafts.") are imported as draft status.');
      break;

    case "csv":
    case "spreadsheet":
      tips.push("💡 Column headers become field names. Row 1 is treated as headers by default.");
      tips.push("💡 Column types are auto-detected (number, date, url, email, boolean).");
      tips.push(
        "💡 The first text column becomes the title. URLs in image columns are queued for download.",
      );
      break;

    case "markdown":
      tips.push("💡 YAML frontmatter becomes structured fields (title, date, tags, categories).");
      tips.push("💡 The Markdown body becomes the content field.");
      tips.push("💡 Files in subdirectories preserve their path structure.");
      break;

    case "sql":
      tips.push("💡 INSERT statements are parsed for table structure and data.");
      tips.push("💡 Column types are inferred from CREATE TABLE definitions.");
      tips.push("💡 Primary keys become externalId for deduplication.");
      break;

    default:
      tips.push("💡 The AI will analyze your data and suggest the best field mappings.");
      tips.push("💡 Review low-confidence mappings (marked in red) before importing.");
      tips.push("💡 Use Dry Run mode first to validate without writing data.");
  }

  return tips;
}

// ============================================================================
// Real-Time Preview Generator
// ============================================================================

/**
 * Generates a preview of what transformed entries will look like after import.
 * Shows side-by-side: source field → transformed value.
 */
export function generatePreview(
  entry: SNCEntry,
  mappings: FieldMapping[],
): { source: Record<string, any>; target: Record<string, any>; confidence: string } {
  const source: Record<string, any> = {};
  const target: Record<string, any> = {};

  // Show raw source values
  for (const [key, value] of Object.entries(entry.rawCustomFields)) {
    if (!key.startsWith("_")) {
      source[key] =
        typeof value === "string" && value.length > 100 ? value.slice(0, 100) + "..." : value;
    }
  }

  // Show mapped target values
  for (const mapping of mappings) {
    const rawValue = entry.rawCustomFields[mapping.sourceField];
    if (rawValue !== undefined) {
      target[mapping.targetField] =
        typeof rawValue === "string" && rawValue.length > 100
          ? rawValue.slice(0, 100) + "..."
          : rawValue;
    }
  }

  // Calculate overall confidence
  const highCount = mappings.filter((m) => m.confidence === "high").length;
  const totalMapped = mappings.filter((m) => m.action !== "ignore").length;
  const avgConfidence = totalMapped > 0 ? (highCount / totalMapped) * 100 : 0;

  return {
    source,
    target,
    confidence: avgConfidence >= 80 ? "high" : avgConfidence >= 50 ? "medium" : "low",
  };
}
