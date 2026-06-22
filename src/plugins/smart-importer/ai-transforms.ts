/**
 * @file src/plugins/smart-importer/ai-transforms.ts
 * @description AI-powered data flow optimization engine.
 *
 * Analyzes source schemas, compares with target SveltyCMS schemas,
 * and suggests optimal transformations:
 * - Split: one source field → multiple target fields
 * - Merge: multiple source fields → one target field
 * - Transform: value conversion (dates, status codes, HTML cleanup)
 * - Enrich: AI-generated metadata (word count, readability, SEO)
 * - Relink: resolve references to actual document IDs
 * - Filter: exclude data based on criteria
 *
 * The AI uses heuristic pattern matching + confidence scoring to suggest
 * the best data flow. Premium features (AST compilers, advanced parsers)
 * require a marketplace license.
 */

// ============================================================================
// Transform Types
// ============================================================================

export type TransformAction =
  | "map" // Direct 1:1 mapping
  | "split" // 1 source → N targets (e.g., fullName → firstName + lastName)
  | "merge" // N sources → 1 target (e.g., street + city + zip → address)
  | "transform" // Value conversion (e.g., date format, status code)
  | "enrich" // AI-generated data from source content
  | "relink" // Resolve reference (ID → actual related document)
  | "filter" // Conditional skip based on criteria
  | "ignore"; // Skip field entirely

export interface TransformSuggestion {
  id: string;
  action: TransformAction;
  sourceFields: string[];
  targetField: string;
  targetWidget: string;
  confidence: number; // 0-100
  reasoning: string; // AI explanation
  tier: "free" | "pro"; // License tier required
  sampleInput?: string; // Show what the source data looks like
  sampleOutput?: string; // Show what the transformed data will look like
}

export interface DataFlowNode {
  id: string;
  label: string;
  type: "source" | "transform" | "target";
  tier: "free" | "pro";
  description: string;
}

export interface DataFlowEdge {
  from: string;
  to: string;
  transform: string;
}

// ============================================================================
// AI Suggestion Engine
// ============================================================================

/**
 * Analyzes source fields and target collection schema to generate
 * optimal data flow suggestions.
 */
export function analyzeDataFlow(
  sourceFields: string[],
  sourcePlatform: string,
  targetFields: Array<{ name: string; type: string }>,
  sampleData?: Record<string, unknown>,
  isProActivated?: boolean,
): {
  suggestions: TransformSuggestion[];
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
  summary: string;
} {
  const suggestions: TransformSuggestion[] = [];
  const nodes: DataFlowNode[] = [];
  const edges: DataFlowEdge[] = [];
  const unmappedSources = new Set(sourceFields);

  // Normalize field names for comparison
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const sourceField of sourceFields) {
    const normSource = normalize(sourceField);
    let bestMatch: { target: string; confidence: number } | null = null;

    // 1. Direct name match
    for (const tf of targetFields) {
      const normTarget = normalize(tf.name);
      if (normSource === normTarget) {
        bestMatch = { target: tf.name, confidence: 95 };
        break;
      }
    }

    // 2. Known cross-platform mappings
    if (!bestMatch) {
      bestMatch = getKnownMapping(sourceField, sourcePlatform, targetFields);
    }

    // 3. Heuristic pattern matching
    if (!bestMatch) {
      bestMatch = heuristicMatch(sourceField, targetFields);
    }

    if (bestMatch) {
      unmappedSources.delete(sourceField);

      // Determine if this needs a transform
      const action = determineAction(sourceField, bestMatch.target, sourcePlatform);

      // Determine tier
      const needsAST = ["contentful", "sanity", "ghost", "typo3", "craft"].includes(sourcePlatform);
      const needsEcom = ["shopify", "magento", "prestashop", "opencart"].includes(sourcePlatform);
      const needsAdvanced = ["storyblok", "prismic", "webflow", "builder", "hygraph"].includes(
        sourcePlatform,
      );
      const tier: "free" | "pro" = needsAST || needsEcom || needsAdvanced ? "pro" : "free";

      suggestions.push({
        id: `map_${sourceField}`,
        action,
        sourceFields: [sourceField],
        targetField: bestMatch.target,
        targetWidget: inferWidget(bestMatch.target, sourceField),
        confidence: bestMatch.confidence,
        reasoning: generateReasoning(sourceField, bestMatch.target, action, bestMatch.confidence),
        tier,
        sampleInput: sampleData ? String(sampleData[sourceField] || "") : undefined,
        sampleOutput: action === "transform" ? "[Transformed value]" : undefined,
      });

      nodes.push({
        id: `src_${sourceField}`,
        label: sourceField,
        type: "source",
        tier,
        description: `Source field from ${sourcePlatform}`,
      });
      nodes.push({
        id: `tgt_${bestMatch.target}`,
        label: bestMatch.target,
        type: "target",
        tier,
        description: `Target widget: ${inferWidget(bestMatch.target, sourceField)}`,
      });
      edges.push({
        from: `src_${sourceField}`,
        to: `tgt_${bestMatch.target}`,
        transform: action,
      });
    }
  }

  // 4. Suggest AI enrichments for pro tier
  if (isProActivated) {
    suggestions.push(...generateAIEnrichments(sourceFields, targetFields, sourcePlatform));
  }

  // 5. Suggest merges for related fields
  suggestions.push(...detectMergeOpportunities(sourceFields, targetFields));

  return {
    suggestions: [...new Map(suggestions.map((s) => [s.id, s])).values()],
    nodes: [...new Map(nodes.map((n) => [n.id, n])).values()],
    edges,
    summary: `${suggestions.length} mappings suggested (${suggestions.filter((s) => s.tier === "pro").length} pro, ${suggestions.filter((s) => s.tier === "free").length} free). ${unmappedSources.size} fields unmapped.`,
  };
}

// ============================================================================
// Known Cross-Platform Mappings
// ============================================================================

function getKnownMapping(
  sourceField: string,
  platform: string,
  targetFields: Array<{ name: string; type: string }>,
): { target: string; confidence: number } | null {
  const crossMap: Record<string, string[]> = {
    // WordPress
    post_title: ["title"],
    post_content: ["content", "body"],
    "content:encoded": ["content"],
    post_excerpt: ["excerpt", "summary", "description"],
    post_name: ["slug"],
    post_status: ["status"],
    post_date: ["createdAt", "created_at", "date_created"],
    post_modified: ["updatedAt", "updated_at", "date_updated"],
    post_author: ["author", "createdBy"],
    post_parent: ["parentId", "parent"],
    menu_order: ["order", "sort", "position"],
    guid: ["externalId", "sourceId"],
    // Drupal
    body: ["content"],
    body_value: ["content"],
    field_summary: ["excerpt", "summary"],
    field_image: ["featuredImage", "image", "thumbnail"],
    field_tags: ["tags"],
    field_category: ["categories"],
    path: ["slug"],
    alias: ["slug"],
    langcode: ["language", "locale"],
    // Strapi
    created_at: ["createdAt"],
    updated_at: ["updatedAt"],
    published_at: ["publishedAt"],
    // Directus
    date_created: ["createdAt"],
    date_updated: ["updatedAt"],
    user_created: ["author", "createdBy"],
    // Shopify
    body_html: ["content", "description"],
    handle: ["slug"],
    vendor: ["brand", "vendor"],
    product_type: ["category", "productType"],
    // Generic
    name: ["title", "name", "label"],
    description: ["excerpt", "summary", "description"],
    image: ["featuredImage", "image", "thumbnail", "cover"],
    thumbnail: ["featuredImage", "thumbnail"],
    cover: ["featuredImage", "cover"],
  };

  const candidates = crossMap[sourceField] || [];
  for (const candidate of candidates) {
    const match = targetFields.find((tf) => tf.name === candidate);
    if (match)
      return {
        target: candidate,
        confidence: platform === "wordpress" && sourceField.startsWith("post_") ? 90 : 75,
      };
  }

  return null;
}

function heuristicMatch(
  sourceField: string,
  targetFields: Array<{ name: string; type: string }>,
): { target: string; confidence: number } | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const normSource = norm(sourceField);

  for (const tf of targetFields) {
    const normTarget = norm(tf.name);
    // Partial match
    if (normTarget.includes(normSource) || normSource.includes(normTarget)) {
      return { target: tf.name, confidence: 60 };
    }
  }

  // Levenshtein-like fuzzy match (simplified)
  for (const tf of targetFields) {
    const normTarget = norm(tf.name);
    const similarity = stringSimilarity(normSource, normTarget);
    if (similarity > 0.7) {
      return { target: tf.name, confidence: Math.round(similarity * 50) };
    }
  }

  return null;
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  let matches = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / Math.max(a.length, b.length);
}

// ============================================================================
// Action Detection
// ============================================================================

function determineAction(source: string, target: string, platform: string): TransformAction {
  // Date fields need transform
  if (source.includes("date") || source.includes("_at") || source.includes("timestamp")) {
    return "transform";
  }
  // Status fields need transform
  if (source.includes("status") || source.includes("state")) {
    return "transform";
  }
  // Content fields from AST platforms need compile
  if (
    ["contentful", "sanity", "ghost"].includes(platform) &&
    (source.includes("body") || source.includes("content") || source.includes("rich"))
  ) {
    return "transform";
  }
  // Reference fields need relink
  if (source.includes("_id") || source.includes("_ref") || source.includes("parent")) {
    return "relink";
  }
  return "map";
}

function inferWidget(source: string, target: string): string {
  const lower = (source + target).toLowerCase();
  if (
    lower.includes("image") ||
    lower.includes("thumbnail") ||
    lower.includes("cover") ||
    lower.includes("media")
  )
    return "MediaUpload";
  if (
    lower.includes("content") ||
    lower.includes("body") ||
    lower.includes("richtext") ||
    lower.includes("html")
  )
    return "RichText";
  if (
    lower.includes("date") ||
    lower.includes("created") ||
    lower.includes("updated") ||
    lower.includes("published")
  )
    return "DateTime";
  if (lower.includes("status") || lower.includes("state") || lower.includes("type"))
    return "Select";
  if (
    lower.includes("price") ||
    lower.includes("count") ||
    lower.includes("quantity") ||
    lower.includes("order")
  )
    return "Number";
  if (lower.includes("tag") || lower.includes("category") || lower.includes("taxonomy"))
    return "Tags";
  if (lower.includes("slug") || lower.includes("url") || lower.includes("link")) return "Slug";
  if (lower.includes("email")) return "Email";
  if (lower.includes("phone")) return "Phone";
  if (lower.includes("color") || lower.includes("colour")) return "Color";
  return "Text";
}

function generateReasoning(
  source: string,
  target: string,
  action: TransformAction,
  confidence: number,
): string {
  switch (action) {
    case "map":
      return `Direct field match: "${source}" maps to "${target}"`;
    case "transform":
      return `Value conversion needed: "${source}" format differs from SveltyCMS "${target}"`;
    case "split":
      return `AI suggests splitting "${source}" into "${target}" for better structure`;
    case "merge":
      return `AI suggests merging multiple fields into "${target}" for cleaner schema`;
    case "enrich":
      return `AI can enrich "${source}" with computed metadata for "${target}"`;
    case "relink":
      return `Reference resolution: "${source}" IDs need linking to actual "${target}" documents`;
    case "filter":
      return `Conditional logic: only import "${source}" when criteria met`;
    default:
      return `Suggested mapping: "${source}" → "${target}" (${confidence}% confidence)`;
  }
}

// ============================================================================
// AI Enrichments (Pro Tier)
// ============================================================================

function generateAIEnrichments(
  sourceFields: string[],
  _targetFields: Array<{ name: string; type: string }>,
  _platform: string,
): TransformSuggestion[] {
  const enrichments: TransformSuggestion[] = [];

  // Word count from content
  if (sourceFields.some((f) => f.includes("content") || f.includes("body"))) {
    enrichments.push({
      id: "ai_wordcount",
      action: "enrich",
      sourceFields: ["content"],
      targetField: "wordCount",
      targetWidget: "Number",
      confidence: 85,
      reasoning: "AI can compute word count from content for SEO and analytics",
      tier: "pro",
    });
  }

  // Reading time estimate
  if (sourceFields.some((f) => f.includes("content") || f.includes("body"))) {
    enrichments.push({
      id: "ai_readingtime",
      action: "enrich",
      sourceFields: ["content"],
      targetField: "readingTime",
      targetWidget: "Number",
      confidence: 80,
      reasoning: "AI estimates reading time (based on avg 200 wpm)",
      tier: "pro",
    });
  }

  // SEO title from title
  if (sourceFields.some((f) => f === "title" || f === "post_title")) {
    enrichments.push({
      id: "ai_seotitle",
      action: "enrich",
      sourceFields: ["title"],
      targetField: "seoTitle",
      targetWidget: "Text",
      confidence: 75,
      reasoning: "AI optimizes title for SEO (length, keywords)",
      tier: "pro",
    });
  }

  // Auto-tagging from content
  if (sourceFields.some((f) => f.includes("content") || f.includes("body"))) {
    enrichments.push({
      id: "ai_autotag",
      action: "enrich",
      sourceFields: ["content"],
      targetField: "autoTags",
      targetWidget: "Tags",
      confidence: 70,
      reasoning: "AI extracts keywords from content for automatic tagging",
      tier: "pro",
    });
  }

  // Media alt text generation
  if (
    sourceFields.some((f) => f.includes("image") || f.includes("media") || f.includes("thumbnail"))
  ) {
    enrichments.push({
      id: "ai_alttext",
      action: "enrich",
      sourceFields: ["featuredImage"],
      targetField: "imageAltText",
      targetWidget: "Text",
      confidence: 65,
      reasoning: "AI generates descriptive alt text for imported images",
      tier: "pro",
    });
  }

  return enrichments;
}

// ============================================================================
// Merge Detection
// ============================================================================

function detectMergeOpportunities(
  sourceFields: string[],
  targetFields: Array<{ name: string; type: string }>,
): TransformSuggestion[] {
  const merges: TransformSuggestion[] = [];

  // first_name + last_name → authorName
  if (sourceFields.includes("first_name") && sourceFields.includes("last_name")) {
    if (targetFields.some((tf) => tf.name === "authorName" || tf.name === "fullName")) {
      merges.push({
        id: "merge_fullname",
        action: "merge",
        sourceFields: ["first_name", "last_name"],
        targetField: "authorName",
        targetWidget: "Text",
        confidence: 85,
        reasoning: "Merge first_name + last_name into authorName for cleaner schema",
        tier: "free",
      });
    }
  }

  // street + city + zip + country → address
  const addressFields = ["street", "city", "zip", "postcode", "country", "state"];
  const matchingAddress = addressFields.filter((f) => sourceFields.includes(f));
  if (matchingAddress.length >= 2 && targetFields.some((tf) => tf.name === "address")) {
    merges.push({
      id: "merge_address",
      action: "merge",
      sourceFields: matchingAddress,
      targetField: "address",
      targetWidget: "Textarea",
      confidence: 80,
      reasoning: `Merge ${matchingAddress.join(" + ")} into structured address`,
      tier: "free",
    });
  }

  return merges;
}

// ============================================================================
// Mermaid Data Flow Generator
// ============================================================================

/**
 * Generates a Mermaid flowchart showing the data flow from source → transform → target.
 */
export function generateDataFlowMermaid(
  suggestions: TransformSuggestion[],
  sourcePlatform: string,
  targetCollection: string,
): string {
  const lines: string[] = ["flowchart LR"];

  // Source node
  lines.push(`    Src["📤 ${sourcePlatform}<br/>Source Export"]`);

  // Transformation nodes grouped by type
  const mapNodes = suggestions.filter((s) => s.action === "map");
  const transformNodes = suggestions.filter((s) => s.action === "transform");
  const enrichNodes = suggestions.filter((s) => s.action === "enrich");
  const mergeNodes = suggestions.filter((s) => s.action === "merge");

  if (mapNodes.length > 0) {
    lines.push(`    subgraph Direct["🟢 Direct Maps (${mapNodes.length})"]`);
    mapNodes.forEach((s) =>
      lines.push(`        ${s.id}["${s.sourceFields[0]} → ${s.targetField}"]`),
    );
    lines.push("    end");
  }

  if (transformNodes.length > 0) {
    lines.push(`    subgraph Transforms["🟡 Transforms (${transformNodes.length})"]`);
    transformNodes.forEach((s) =>
      lines.push(`        ${s.id}["${s.sourceFields[0]} → ${s.targetField}"]`),
    );
    lines.push("    end");
  }

  if (mergeNodes.length > 0) {
    lines.push(`    subgraph Merges["🔀 Merges (${mergeNodes.length})"]`);
    mergeNodes.forEach((s) =>
      lines.push(`        ${s.id}["${s.sourceFields.join("+")} → ${s.targetField}"]`),
    );
    lines.push("    end");
  }

  if (enrichNodes.length > 0) {
    lines.push(`    subgraph AI["✨ AI Enrich (${enrichNodes.length}) Pro"]`);
    enrichNodes.forEach((s) =>
      lines.push(`        ${s.id}["${s.sourceFields[0]} → ${s.targetField}"]`),
    );
    lines.push("    end");
  }

  // Target node
  lines.push(`    Tgt["📥 ${targetCollection}<br/>SveltyCMS Collection"]`);

  // Edges
  lines.push("    Src --> Direct");
  lines.push("    Src --> Transforms");
  if (mergeNodes.length > 0) lines.push("    Src --> Merges");
  if (enrichNodes.length > 0) lines.push("    Src --> AI");
  lines.push("    Direct --> Tgt");
  lines.push("    Transforms --> Tgt");
  if (mergeNodes.length > 0) lines.push("    Merges --> Tgt");
  if (enrichNodes.length > 0) lines.push("    AI --> Tgt");

  return "```mermaid\n" + lines.join("\n") + "\n```";
}
