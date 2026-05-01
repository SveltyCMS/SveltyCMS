/**
 * @file src/routes/api/seo/link-suggestions/+server.ts
 * @description Provides internal link suggestions based on keyword analysis of the current content.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

export const POST: RequestHandler = async ({ request, locals }) => {
  const { user, tenantId, cms } = locals;
  if (!user) throw new AppError("Unauthorized", 401);
  if (!cms?.db) throw new AppError("Database adapter not initialized", 500);

  const dbAdapter = cms.db;

  try {
    const { content, currentId, collectionId } = await request.json();
    if (!content) return json({ suggestions: [] });

    // 1. Extract keywords from content (simple version)
    const words =
      content
        .toLowerCase()
        .replace(/<[^>]*>/g, " ")
        .match(/\b\w{4,}\b/g) || [];

    // Count frequency
    const freq: Record<string, number> = {};
    for (const word of words) {
      freq[word] = (freq[word] || 0) + 1;
    }

    // Top 5 keywords
    const topKeywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    if (topKeywords.length === 0) return json({ suggestions: [] });

    // 2. Search for other entries containing these keywords

    // Simple implementation: Search across all collections for these keywords
    // In a real system, we might use an actual search index (Elastic/Algolia/Meilisearch)
    const suggestions: Array<{ title: string; url: string; score: number }> = [];

    // For now, let's just search in the current collection or 'posts'/'pages'
    const searchCollections = ["posts", "pages", "articles", collectionId].filter(Boolean);
    const uniqueCollections = [...new Set(searchCollections)];

    for (const col of uniqueCollections) {
      try {
        // Find entries that contain any of the top keywords
        // This is a naive implementation; production would use $text or similar
        const query = {
          $or: topKeywords.map((k) => ({
            $or: [
              { title: { $regex: k, $options: "i" } },
              { content: { $regex: k, $options: "i" } },
            ],
          })),
          _id: { $ne: currentId },
          tenantId: tenantId || "default",
        };

        const result = await dbAdapter.crud.findMany(col, query as any, { limit: 5 });
        if (result.success && Array.isArray(result.data)) {
          for (const entry of result.data as any[]) {
            suggestions.push({
              title: entry.title || entry.name || entry.slug,
              url: `/${col}/${entry.slug}`,
              score: 1.0, // Simple score
            });
          }
        }
      } catch {
        // Collection might not exist
      }
    }

    // Unique suggestions
    const uniqueSuggestions = Array.from(
      new Map(suggestions.map((s) => [s.url, s])).values(),
    ).slice(0, 5);

    return json({ suggestions: uniqueSuggestions });
  } catch (err) {
    logger.error("Error fetching link suggestions:", err);
    return json({ suggestions: [], error: (err as Error).message }, { status: 500 });
  }
};
