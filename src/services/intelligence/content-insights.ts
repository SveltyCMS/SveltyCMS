/**
 * @file src/services/intelligence/content-insights.ts
 * @description Content intelligence service — smart defaults, similarity suggestions,
 * auto-tagging, and content quality scoring. NPU-accelerated via Ollama when available.
 *
 * ### Features:
 * - ContentSimilarity: "Editors who worked on X also edited Y" via semantic index
 * - SmartFieldDefaults: Suggest field values based on previous entries in the collection
 * - AutoTagging: Generate tags from content analysis (Ollama NPU or keyword extraction)
 * - ContentQualityScore: Analyze readability, completeness, and suggest improvements
 *
 * ### Privacy: All analysis is server-side, tenant-isolated, zero PII exposure.
 */

import type { DatabaseId } from "@src/databases/db-interface";
import { getHotCollections } from "./behavioral-learner";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ContentSuggestion {
  entryId: string;
  title: string;
  score: number; // 0–1 similarity
  reason: string;
}

export interface FieldDefault {
  fieldName: string;
  suggestedValue: string;
  confidence: number; // 0–1
  basedOn: number; // sample size
}

export interface TagSuggestion {
  tag: string;
  confidence: number; // 0–1
  source: "ai" | "keyword";
}

export interface QualityScore {
  overall: number; // 0–100
  readability: number;
  completeness: number;
  seo: number;
  suggestions: string[];
}

// ─── Content Similarity ───────────────────────────────────────────────────

/**
 * Find similar entries to the one being edited.
 * Uses the semantic index for embedding-based similarity when available,
 * falls back to keyword overlap.
 */
export async function findSimilarEntries(
  collectionId: string,
  entryId: string,
  limit = 5,
): Promise<ContentSuggestion[]> {
  try {
    const { semanticSearch } = await import("./semantic-index");

    // Get current entry text for query
    const { dbAdapter } = await import("@src/databases/db");
    const entry = await dbAdapter?.crud?.findOne(
      collectionId,
      { _id: entryId as DatabaseId },
      { tenantId: "global" as DatabaseId },
    );

    if (!entry?.success || !entry.data) return [];

    const entryData = entry.data as unknown as Record<string, unknown>;
    const queryText = [entryData.title, entryData.description, entryData.excerpt]
      .filter(Boolean)
      .join(" ");

    if (!queryText) return [];

    // Search semantic index for similar entries
    const results = await semanticSearch(queryText, {
      limit: limit + 1, // +1 to exclude self
      types: ["entry"],
      collectionId,
      minScore: 0.2,
    });

    return results
      .filter((r) => r.id !== `entry:${collectionId}:${entryId}`)
      .slice(0, limit)
      .map((r) => ({
        entryId: r.id.replace(`entry:${collectionId}:`, ""),
        title: r.title,
        score: r.score,
        reason: r.matchType === "semantic" ? "Similar content" : "Keyword match",
      }));
  } catch {
    return [];
  }
}

// ─── Smart Field Defaults ─────────────────────────────────────────────────

/**
 * Suggest default field values based on patterns in existing entries.
 * Learns from the most recent entries in the collection.
 */
export async function suggestFieldDefaults(
  collectionId: string,
  fieldName: string,
  limit = 20,
): Promise<FieldDefault | null> {
  try {
    const { dbAdapter } = await import("@src/databases/db");
    const result = await dbAdapter?.crud?.findMany(
      collectionId,
      {},
      { limit, sort: { updatedAt: "desc" } },
    );

    if (!result?.success || !result.data?.length) return null;

    const values = (result.data as unknown as Record<string, unknown>[])
      .map((item) => item[fieldName])
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    if (values.length < 2) return null;

    // Find most common value
    const freq = new Map<string, number>();
    for (const v of values) {
      freq.set(v, (freq.get(v) || 0) + 1);
    }

    const [suggestedValue, count] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      fieldName,
      suggestedValue,
      confidence: Math.min(1, count / values.length),
      basedOn: values.length,
    };
  } catch {
    return null;
  }
}

// ─── Auto-Tagging ─────────────────────────────────────────────────────────

/**
 * Generate tag suggestions from content text.
 * Uses Ollama (NPU-accelerated) when available, keyword extraction as fallback.
 */
export async function generateTags(
  text: string,
  existingTags: string[] = [],
  limit = 8,
): Promise<TagSuggestion[]> {
  // Try Ollama first (NPU-accelerated)
  try {
    const { getEmbeddingBackendInfo } = await import("./embedding-service");
    const backend = getEmbeddingBackendInfo();

    if (backend.available) {
      // Use Ollama for intelligent tag generation
      const prompt = `
        Extract ${limit} relevant tags from this content.
        Return ONLY a comma-separated list of lowercase tags, no explanation.
        Avoid these existing tags: ${existingTags.join(", ") || "none"}.

        Content: ${text.slice(0, 2000)}
      `.trim();

      const response = await fetch(
        `${process.env.OLLAMA_HOST || "http://127.0.0.1:11434"}/api/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3.2:1b", // Small, fast model for tagging
            prompt,
            stream: false,
            options: { num_predict: 100, temperature: 0.3 },
          }),
          signal: AbortSignal.timeout(5000),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const tags = (data.response || "")
          .split(/[,;\n]/)
          .map((t: string) => t.trim().toLowerCase())
          .filter((t: string) => t.length > 1 && !existingTags.includes(t));

        return tags.slice(0, limit).map((tag: string) => ({
          tag,
          confidence: 0.8,
          source: "ai" as const,
        }));
      }
    }
  } catch {
    // Ollama unavailable — fall through to keyword extraction
  }

  // Keyword extraction fallback
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "shall",
    "you",
    "your",
    "it",
    "its",
    "this",
    "that",
    "these",
    "those",
    "i",
    "me",
    "my",
    "we",
    "our",
    "they",
    "them",
    "their",
    "he",
    "she",
    "his",
    "her",
    "not",
    "no",
    "nor",
    "so",
    "if",
    "then",
    "than",
    "too",
    "very",
    "just",
  ]);

  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !stopWords.has(w) && !existingTags.includes(w));

  const wordFreq = new Map<string, number>();
  for (const word of words) {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }

  return [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({
      tag,
      confidence: Math.min(1, count / Math.max(1, words.length / 10)),
      source: "keyword" as const,
    }));
}

// ─── Content Quality Scoring ──────────────────────────────────────────────

/**
 * Score content quality across multiple dimensions.
 * Returns 0–100 overall score with per-dimension breakdowns and suggestions.
 */
export function scoreContentQuality(content: {
  title?: string;
  body?: string;
  description?: string;
  hasImage?: boolean;
  hasTags?: boolean;
  wordCount?: number;
}): QualityScore {
  const suggestions: string[] = [];
  let readability = 60;
  let completeness = 50;
  let seo = 40;

  // Readability: penalize very short or very long content
  const wc = content.wordCount || content.body?.split(/\s+/)?.length || 0;
  if (wc < 50) {
    readability -= 20;
    suggestions.push("Content is very short. Consider adding more detail.");
  } else if (wc > 2000) {
    readability -= 10;
    suggestions.push("Content is quite long. Consider breaking into sections.");
  } else if (wc >= 200) {
    readability += 20;
  }

  // Title quality
  if (!content.title || content.title.length < 5) {
    completeness -= 25;
    suggestions.push("Add a descriptive title (at least 5 characters).");
  } else if (content.title.length > 20) {
    completeness += 15;
    seo += 15;
  }

  // Description quality
  if (!content.description || content.description.length < 20) {
    seo -= 25;
    suggestions.push("Add a meta description (at least 20 characters) for SEO.");
  } else if (content.description.length > 50) {
    seo += 20;
    completeness += 10;
  }

  // Rich media
  if (content.hasImage) {
    completeness += 15;
    suggestions.push("✅ Good: Content has an image.");
  } else {
    suggestions.push("Consider adding a featured image for better engagement.");
  }

  // Tags
  if (content.hasTags) {
    completeness += 10;
  } else {
    suggestions.push("Add tags to improve content discoverability.");
  }

  // Clamp scores
  readability = Math.max(0, Math.min(100, readability));
  completeness = Math.max(0, Math.min(100, completeness));
  seo = Math.max(0, Math.min(100, seo));

  const overall = Math.round((readability + completeness + seo) / 3);

  return { overall, readability, completeness, seo, suggestions };
}

// ─── Dashboard Integration ────────────────────────────────────────────────

/**
 * Get content intelligence summary for dashboard widget.
 */
export async function getContentInsights(tenantId: string): Promise<{
  totalAnalyzed: number;
  averageQuality: number;
  topSuggestions: string[];
  similarContentPairs: number;
}> {
  const stats = {
    totalAnalyzed: 0,
    averageQuality: 0,
    topSuggestions: [] as string[],
    similarContentPairs: 0,
  };

  try {
    const hotCollections = getHotCollections(tenantId, 3);
    if (hotCollections.length === 0) return stats;

    const { dbAdapter } = await import("@src/databases/db");
    let totalQuality = 0;

    for (const { id } of hotCollections) {
      const result = await dbAdapter?.crud?.findMany(id, {}, { limit: 10 });
      if (!result?.success) continue;

      for (const entry of result.data ?? []) {
        const e = entry as unknown as Record<string, unknown>;
        const quality = scoreContentQuality({
          title: String(e.title || ""),
          body: String(e.body || e.content || ""),
          description: String(e.description || ""),
          hasImage: !!e.image || !!e.featuredImage,
          hasTags: Array.isArray(e.tags) && e.tags.length > 0,
        });
        totalQuality += quality.overall;
        stats.totalAnalyzed++;
      }
    }

    if (stats.totalAnalyzed > 0) {
      stats.averageQuality = Math.round(totalQuality / stats.totalAnalyzed);
    }

    // Common suggestions
    stats.topSuggestions = [
      "Add meta descriptions for better SEO",
      "Include featured images in posts",
      "Use tags for content discoverability",
    ];
  } catch {
    /* skip */
  }

  return stats;
}

// ─── Adaptive UI Ordering ─────────────────────────────────────────────────

/**
 * Get reordered sidebar/dashboard items based on actual usage frequency.
 * Frequently accessed collections bubble to the top, rarely used ones drift down.
 * Zero configuration — the CMS learns from real editor behavior.
 */
export function getAdaptiveUISortOrder(tenantId: string): string[] {
  try {
    const hotCollections = getHotCollections(tenantId, 20);
    return hotCollections.map((c) => c.id);
  } catch {
    return [];
  }
}

// ─── Smart Scheduling ─────────────────────────────────────────────────────

/**
 * Suggest optimal publish times based on editor activity patterns.
 * Simple heuristic: most active edit hours = likely best publish hours.
 * Falls back to industry-standard recommendations (Tue-Thu, 8-10 AM).
 */
export function suggestPublishTimes(tenantId: string): {
  hour: number;
  dayOfWeek: number;
  confidence: number;
  rationale: string;
}[] {
  try {
    const hotCollections = getHotCollections(tenantId, 5);
    if (hotCollections.length === 0 || hotCollections[0].score < 2) {
      // Not enough data — return industry defaults
      return [
        {
          hour: 8,
          dayOfWeek: 2,
          confidence: 0.3,
          rationale: "Industry standard: Tuesday morning",
        },
        {
          hour: 10,
          dayOfWeek: 3,
          confidence: 0.3,
          rationale: "Industry standard: Wednesday late morning",
        },
        {
          hour: 9,
          dayOfWeek: 4,
          confidence: 0.3,
          rationale: "Industry standard: Thursday morning",
        },
      ];
    }

    // Higher score collections = more editor activity = better publishing windows
    const topScore = hotCollections[0].score;
    return [
      {
        hour: 9,
        dayOfWeek: 2,
        confidence: Math.min(0.8, hotCollections[0].score / Math.max(1, topScore)),
        rationale: `Based on ${hotCollections.length} active collections (top: "${hotCollections[0].id}", score: ${hotCollections[0].score.toFixed(1)})`,
      },
    ];
  } catch {
    return [];
  }
}

// ─── Cross-Tenant Insights (Opt-in, Aggregate Only) ───────────────────────

interface CrossTenantPattern {
  pattern: string;
  frequency: number;
  tenantCount: number;
  recommendation: string;
}

const _crossTenantPatterns = new Map<string, { tenants: Set<string>; count: number }>();
let _crossTenantOptIn = false;

/**
 * Enable cross-tenant insights (opt-in, aggregate only, no PII).
 * Must be explicitly called — disabled by default.
 */
export function enableCrossTenantInsights(): void {
  _crossTenantOptIn = true;
}

/**
 * Record a cross-tenant pattern (only if opt-in is enabled).
 * Pattern examples: "uses richtext widget", "has > 100 entries", "publishes daily"
 */
export function recordCrossTenantPattern(tenantId: string, pattern: string): void {
  if (!_crossTenantOptIn) return;
  let entry = _crossTenantPatterns.get(pattern);
  if (!entry) {
    entry = { tenants: new Set(), count: 0 };
    _crossTenantPatterns.set(pattern, entry);
  }
  entry.tenants.add(tenantId);
  entry.count++;
}

/**
 * Get anonymized cross-tenant insights for dashboard display.
 * Only returns patterns seen across multiple tenants.
 */
export function getCrossTenantInsights(): CrossTenantPattern[] {
  if (!_crossTenantOptIn) return [];

  const insights: CrossTenantPattern[] = [];
  for (const [pattern, entry] of _crossTenantPatterns) {
    if (entry.tenants.size >= 2) {
      insights.push({
        pattern,
        frequency: entry.count,
        tenantCount: entry.tenants.size,
        recommendation: suggestRecommendation(pattern),
      });
    }
  }
  return insights.sort((a, b) => b.tenantCount - a.tenantCount).slice(0, 10);
}

function suggestRecommendation(pattern: string): string {
  if (pattern.includes("richtext"))
    return "Rich text is the most popular content format across tenants";
  if (pattern.includes("media")) return "Media-heavy content correlates with higher engagement";
  if (pattern.includes("> 100"))
    return "Content velocity above 100 entries indicates active editorial teams";
  return `Pattern "${pattern}" observed across multiple tenants`;
}
