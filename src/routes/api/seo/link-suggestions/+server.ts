/**
 * @file src/routes/api/seo/link-suggestions/+server.ts
 * @description Provides internal link suggestions based on keyword analysis of the current content.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { contentSystem } from "@src/content/index.server";

export const POST: RequestHandler = async ({ request, locals }) => {
  const { user, tenantId, cms } = locals;
  if (!user) throw new AppError("Unauthorized", 401);
  if (!cms?.db) throw new AppError("Database adapter not initialized", 500);

  const dbAdapter = cms.db;

  try {
    const { content, currentId, collectionId, focusKeyword } = await request.json();
    if (!content && !focusKeyword) return json({ suggestions: [] });

    // 1. Extract keywords from content
    const text = content
      ? content
          .toLowerCase()
          .replace(/<[^>]*>/g, " ")
          .replace(/[^\w\s]/g, "")
      : "";

    const words = text.match(/\b\w{4,}\b/g) || [];

    // Count frequency
    const freq: Record<string, number> = {};
    for (const word of words) {
      freq[word] = (freq[word] || 0) + 1;
    }

    // Top 5 keywords from content
    const contentKeywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    // Combine with focusKeyword if provided
    const searchKeywords = focusKeyword
      ? [
          focusKeyword.toLowerCase(),
          ...contentKeywords.filter((k) => k !== focusKeyword.toLowerCase()),
        ].slice(0, 5)
      : contentKeywords;

    if (searchKeywords.length === 0) return json({ suggestions: [] });

    // 2. Search for other entries using QueryBuilder's search capability
    const suggestions: Array<{ title: string; url: string; score: number; collection: string }> =
      [];

    // Collections to search
    const allCollections = await contentSystem.getCollections(tenantId);
    const searchCollections = allCollections
      .filter((c) =>
        ["posts", "pages", "articles", "news", "blog", collectionId].includes(c._id as string),
      )
      .map((c) => c._id as string);

    if (searchCollections.length === 0 && collectionId) {
      searchCollections.push(collectionId);
    }

    for (const colId of searchCollections) {
      try {
        const collection = await contentSystem.getCollectionById(colId, tenantId);
        if (!collection) continue;

        // Use the native search capability of the database
        // We search for the primary keywords
        for (const keyword of searchKeywords.slice(0, 2)) {
          const qb = dbAdapter.queryBuilder(colId);
          const result = await qb
            .search(keyword, ["title", "content"] as any)
            .where({ status: "published", tenantId: tenantId || "default" } as any)
            .limit(5)
            .execute();

          if (result.success && Array.isArray(result.data)) {
            for (const entry of result.data as any[]) {
              if (entry._id === currentId) continue;

              // Calculate a simple relevancy score
              let score = 1.0;
              if (keyword === focusKeyword?.toLowerCase()) score += 0.5;
              if (entry.isCornerstone) score += 1.0;

              suggestions.push({
                title: entry.title || entry.name || entry.slug,
                url: `/${colId}/${entry.slug}`,
                score,
                collection: collection.name || colId,
              });
            }
          }
        }
      } catch (err) {
        logger.warn(`Error searching collection ${colId} for link suggestions:`, err);
      }
    }

    // Sort by score and unique by URL
    const uniqueSuggestions = Array.from(
      new Map(suggestions.sort((a, b) => b.score - a.score).map((s) => [s.url, s])).values(),
    ).slice(0, 8);

    return json({ suggestions: uniqueSuggestions });
  } catch (err) {
    logger.error("Error fetching link suggestions:", err);
    return json({ suggestions: [], error: (err as Error).message }, { status: 500 });
  }
};
