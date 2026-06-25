/**
 * @file src/plugins/smart-importer/ai-co-pilot.ts
 * @description Highly optimized, defensively guarded AI Migration Co-Pilot guidance engine.
 */

import type { SNCEntry, FieldMapping } from "./types";
import { inferTargetCollectionFromMigration } from "./infer-collection";

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
  action?: string;
  autoFix?: boolean;
  affectedFields?: string[];
  impact: "high" | "medium" | "low";
}

export interface MigrationHealthReport {
  score: number;
  status: "excellent" | "good" | "fair" | "poor" | "critical";
  recommendations: AIRecommendation[];
  summary: string;
  checks: { total: number; passed: number; warnings: number; failed: number };
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

export function calculateMigrationHealth(
  entries: SNCEntry[],
  mappings: FieldMapping[],
  targetCollection: string,
  options: {
    hasLicense?: boolean;
    importMedia?: boolean;
    selectedContentTypes?: string[];
  } = {},
): MigrationHealthReport {
  const recommendations: AIRecommendation[] = [];
  let passed = 0,
    warnings = 0,
    failed = 0;
  const total = 10;

  // O(1) single-pass lookup map instead of repeated .some() scans
  const mappedTargetsMap = new Map<string, FieldMapping["confidence"]>();
  const lowConfidenceFields: string[] = [];

  for (let i = 0; i < mappings.length; i++) {
    const m = mappings[i];
    const targetLower = m.targetField.toLowerCase();
    mappedTargetsMap.set(targetLower, m.confidence);
    if (m.confidence === "low") lowConfidenceFields.push(m.sourceField);
  }

  // 1. Has entries
  if (entries.length === 0) {
    recommendations.push({
      id: "no_entries",
      level: "critical",
      category: "field_mapping",
      title: "No entries found",
      description: "The source file contains no importable content.",
      action: "Try a different file or format",
      impact: "high",
    });
    failed++;
  } else {
    passed++;
  }

  // 2. Has mappings
  if (mappings.length === 0) {
    recommendations.push({
      id: "no_mappings",
      level: "critical",
      category: "field_mapping",
      title: "No field mappings configured",
      description: "AI can auto-suggest mappings.",
      action: 'Click "AI Auto-Map"',
      autoFix: true,
      impact: "high",
    });
    failed++;
  } else {
    passed++;
  }

  // 3. Has target collection
  if (!targetCollection || !targetCollection.trim()) {
    recommendations.push({
      id: "no_target",
      level: "critical",
      category: "field_mapping",
      title: "No target collection",
      description: "Choose where to import the content.",
      action: "Enter a collection name",
      autoFix: true,
      impact: "high",
    });
    failed++;
  } else {
    passed++;
  }

  // 4. Title mapped (O(1) lookup)
  const titleConfidence = mappedTargetsMap.get("title");
  const hasTitleMapping = titleConfidence !== undefined && titleConfidence !== "low";
  if (!hasTitleMapping && entries.length > 0) {
    recommendations.push({
      id: "missing_title",
      level: "warning",
      category: "field_mapping",
      title: "Title field may not be mapped",
      description: "No high-confidence title mapping found.",
      action: 'Map a source field to "title"',
      affectedFields: ["title"],
      impact: "high",
    });
    warnings++;
  } else {
    passed++;
  }

  // 5. Content mapped (O(1) lookup)
  const hasContentMapping = ["content", "body", "richtext"].some((key) =>
    mappedTargetsMap.has(key),
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

  // 6. Low-confidence mappings
  if (lowConfidenceFields.length > 3) {
    recommendations.push({
      id: "low_confidence",
      level: "warning",
      category: "field_mapping",
      title: `${lowConfidenceFields.length} low-confidence mappings`,
      description: "Review before importing.",
      action: "Review and adjust low-confidence mappings",
      affectedFields: lowConfidenceFields,
      impact: "medium",
    });
    warnings++;
  } else {
    passed++;
  }

  // 7. Media handling
  const hasMedia = entries.some((e) => e.assetsToMirror && e.assetsToMirror.length > 0);
  if (hasMedia && !options.importMedia) {
    recommendations.push({
      id: "media_not_importing",
      level: "info",
      category: "media_handling",
      title: "Media detected but not importing",
      description: "Entries have media assets. Enable media import.",
      action: 'Enable "Import Media"',
      impact: "medium",
    });
    warnings++;
  } else {
    passed++;
  }

  // 8. Large import
  if (entries.length > 10000) {
    recommendations.push({
      id: "large_import",
      level: "info",
      category: "performance",
      title: "Large import detected",
      description: `${entries.length.toLocaleString()} entries — consider CLI.`,
      action: "Use CLI for large imports",
      impact: "low",
    });
  }
  passed++;

  // 9. Pro features
  if (
    !options.hasLicense &&
    entries.some(
      (e) =>
        e.rawCustomFields && (e.rawCustomFields._astContent || e.rawCustomFields._portableText),
    )
  ) {
    recommendations.push({
      id: "pro_recommended",
      level: "info",
      category: "quality",
      title: "Rich text AST detected — Pro recommended",
      description: "Structured rich text benefits from Pro compilers.",
      action: "Activate Pro license",
      impact: "medium",
    });
  }
  passed++;

  // 10. Taxonomy completeness (safe optional chaining)
  const hasTaxonomy = entries.some(
    (e) => e.taxonomies?.terms && Object.keys(e.taxonomies.terms || {}).length > 0,
  );
  if (hasTaxonomy) {
    const hasTaxonomyMapping = mappedTargetsMap.has("tags") || mappedTargetsMap.has("categories");
    if (!hasTaxonomyMapping) {
      recommendations.push({
        id: "taxonomy_unmapped",
        level: "warning",
        category: "taxonomy",
        title: "Taxonomy data found but not mapped",
        description: "Source has tags/categories but no taxonomy fields are mapped.",
        action: 'Map source to "tags" or "categories"',
        impact: "medium",
      });
      warnings++;
    } else {
      passed++;
    }
  } else {
    passed++;
  }

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

  return {
    score,
    status,
    recommendations,
    summary: generateHealthSummary(
      status,
      passed,
      warnings,
      failed,
      entries.length,
      mappings.length,
    ),
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
      return base + `Significant issues found. Fix ${failed} problems first.`;
    case "critical":
      return base + "Critical configuration gaps. Cannot proceed without fixes.";
    default:
      return base;
  }
}

// ============================================================================
// Smart Defaults Engine
// ============================================================================

export function generateSmartDefaults(
  entries: SNCEntry[],
  sourcePlatform: string,
  sampleSize: number = 100,
): SmartDefaults {
  const samples = entries.slice(0, sampleSize);
  const allFields = collectAllFields(samples);

  return {
    targetCollection: inferTargetCollectionFromMigration({
      format: sourcePlatform,
      entries: samples,
    }),
    suggestedMappings: inferMappings(allFields, sourcePlatform),
    contentTypeGrouping: groupByContentType(samples),
    autoDetectedTaxonomies: detectTaxonomies(samples),
    mediaHandlingStrategy: inferMediaStrategy(samples),
    batchSize:
      samples.reduce((sum, e) => sum + JSON.stringify(e).length, 0) / (samples.length || 1) > 10000
        ? 50
        : 500,
    conflictStrategy: "skip",
  };
}

function collectAllFields(entries: SNCEntry[]): string[] {
  const fields = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const customFields = entries[i].rawCustomFields || {};
    for (const key of Object.keys(customFields)) {
      if (!key.startsWith("_")) fields.add(key);
    }
  }
  return [...fields];
}

function inferMappings(fields: string[], _platform: string): FieldMapping[] {
  const mappings: FieldMapping[] = [];

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const lower = field.toLowerCase();
    let target = "";
    let confidence: FieldMapping["confidence"] = "low";
    let widgetType = "text";

    if (lower === "title" || lower === "post_title" || lower === "name") {
      target = "title";
      confidence = "high";
    } else if (["content", "body", "post_content", "content:encoded"].includes(lower)) {
      target = "content";
      confidence = "high";
      widgetType = "richtext";
    } else if (["excerpt", "summary", "post_excerpt", "description"].includes(lower)) {
      target = "excerpt";
      confidence = "high";
    } else if (["slug", "post_name", "handle", "path"].includes(lower)) {
      target = "slug";
      confidence = "high";
    } else if (lower === "status" || lower === "post_status") {
      target = "status";
      confidence = "high";
      widgetType = "select";
    } else if (
      lower.includes("date") ||
      lower.includes("created_at") ||
      lower.includes("updated_at")
    ) {
      target = lower.includes("update") || lower.includes("modified") ? "updatedAt" : "createdAt";
      confidence = "high";
      widgetType = "date";
    } else if (lower.includes("author") || lower.includes("creator") || lower === "dc:creator") {
      target = "author";
      confidence = "medium";
    } else if (lower.includes("image") || lower.includes("thumbnail") || lower.includes("cover")) {
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
    } else if (lower.includes("price") || lower.includes("cost")) {
      target = "price";
      confidence = "high";
      widgetType = "number";
    } else {
      target = field;
      confidence = "low";
    }

    mappings.push({
      sourceField: field,
      targetField: target,
      widgetType,
      confidence,
      action: "map",
      reason: `AI-suggested: "${field}" → "${target}"`,
    });
  }

  // Non-mutating sort (preserve original array order for consumers)
  return [...mappings].sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return priority[a.confidence] - priority[b.confidence];
  });
}

function groupByContentType(entries: SNCEntry[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const type =
      (entry.rawCustomFields as any)?.type ||
      (entry.rawCustomFields as any)?._drupalType ||
      "default";
    if (!groups[type]) groups[type] = [];
    groups[type].push(entry.externalId);
  }
  return groups;
}

function detectTaxonomies(entries: SNCEntry[]): string[] {
  const taxonomies = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const vocabularies = entry.taxonomies?.vocabularies || [];
    const terms = entry.taxonomies?.terms || {};

    vocabularies.forEach((vocab: string) => taxonomies.add(vocab));
    Object.keys(terms).forEach((key: string) => taxonomies.add(key));
  }
  return [...taxonomies];
}

function inferMediaStrategy(entries: SNCEntry[]): "download" | "reference" | "skip" {
  let totalAssets = 0;
  for (let i = 0; i < entries.length; i++) {
    totalAssets += entries[i].assetsToMirror?.length || 0;
  }
  return totalAssets === 0 ? "skip" : totalAssets > 100 ? "reference" : "download";
}

export function getPlatformGuidance(platform: string, contentType: string): string[] {
  const tips: string[] = [];
  switch (platform.toLowerCase()) {
    case "wordpress":
      tips.push(
        "💡 WordPress WXR includes posts, pages, media, and comments.",
        "💡 ACF custom fields are preserved in rawCustomFields.",
      );
      if (contentType === "page") tips.push("💡 Page hierarchy is preserved via parentExternalId.");
      break;
    case "drupal":
      tips.push(
        "💡 Drupal taxonomy terms are resolved from JSON:API data automatically.",
        "💡 Paragraphs appear as nested rawCustomFields.",
      );
      break;
    case "contentful":
      tips.push("💡 Rich text is compiled from Contentful AST nodes to HTML (Pro feature).");
      break;
    case "csv":
      tips.push(
        "💡 CSV imports map column headers to target fields automatically.",
        "💡 Use Dry Run mode first to verify column-to-field mappings.",
      );
      break;
    default:
      tips.push("💡 Use Dry Run mode first to validate without writing data.");
  }
  return tips;
}

export function generatePreview(
  entry: SNCEntry,
  mappings: FieldMapping[],
): {
  source: Record<string, any>;
  target: Record<string, any>;
  confidence: "high" | "medium" | "low";
} {
  const source: Record<string, any> = {};
  const target: Record<string, any> = {};
  const customFields = entry.rawCustomFields || {};

  for (const [key, value] of Object.entries(customFields)) {
    if (!key.startsWith("_")) {
      source[key] =
        typeof value === "string" && value.length > 100 ? value.slice(0, 100) + "..." : value;
    }
  }

  let highCount = 0;
  let totalMapped = 0;

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    if (mapping.action === "ignore") continue;

    totalMapped++;
    if (mapping.confidence === "high") highCount++;

    const rawValue = customFields[mapping.sourceField];
    if (rawValue !== undefined) {
      target[mapping.targetField] =
        typeof rawValue === "string" && rawValue.length > 100
          ? rawValue.slice(0, 100) + "..."
          : rawValue;
    }
  }

  const avgConfidence = totalMapped > 0 ? (highCount / totalMapped) * 100 : 0;
  return {
    source,
    target,
    confidence: avgConfidence >= 80 ? "high" : avgConfidence >= 50 ? "medium" : "low",
  };
}
