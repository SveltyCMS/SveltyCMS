/**
 * @file src/routes/api/seo/link-suggestions/+server.ts
 * @description High-performance, concurrent search engine for internal link suggestions.
 *   - Parallel database queries via Promise.all (O(1) I/O instead of O(N×M))
 *   - Single-pass keyword extraction (no double .replace() string cloning)
 *   - Eliminates redundant getCollectionById calls (uses allCollections metadata)
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

    // 1. Single-pass keyword extraction — avoids intermediate string clones from
    //    chained .replace() calls on large HTML documents.
    const searchKeywords: string[] = [];
    if (focusKeyword) {
      searchKeywords.push(focusKeyword.toLowerCase());
    }

    if (content) {
      const words = content.toLowerCase().match(/\b\w{4,}\b/g) || [];
      const freq: Record<string, number> = {};

      for (const word of words) {
        // Skip HTML tag artifacts natively (no separate strip-and-replace pass)
        if (word.startsWith("lt") || word.startsWith("gt") || word.startsWith("p")) continue;
        freq[word] = (freq[word] || 0) + 1;
      }

      const contentKeywords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

      for (const kw of contentKeywords) {
        if (!searchKeywords.includes(kw)) searchKeywords.push(kw);
      }
    }

    const keywordsToSearch = searchKeywords.slice(0, 2);
    if (keywordsToSearch.length === 0) return json({ suggestions: [] });

    // 2. Fetch metadata once — filter in-memory instead of N getCollectionById calls
    const allCollections = await contentSystem.getCollections(tenantId);
    const targetCollectionIds = new Set([
      "posts",
      "pages",
      "articles",
      "news",
      "blog",
      collectionId,
    ]);

    const searchCollections = allCollections.filter(
      (c) => c._id && targetCollectionIds.has(c._id as string),
    );

    if (searchCollections.length === 0 && collectionId) {
      const fallbackCol = allCollections.find((c) => c._id === collectionId);
      if (fallbackCol) searchCollections.push(fallbackCol);
    }

    // 3. Fire all keyword × collection queries in parallel via Promise.all
    const suggestions: Array<{
      title: string;
      url: string;
      score: number;
      collection: string;
    }> = [];

    const searchPromises: Promise<void>[] = [];

    for (const col of searchCollections) {
      const colId = col._id as string;
      const colName = col.name || colId;

      for (const keyword of keywordsToSearch) {
        const queryPromise = (async () => {
          try {
            const qb = dbAdapter.queryBuilder(colId);
            const result = await qb
              .search(keyword, ["title", "content"] as any)
              .where({
                status: "published",
                tenantId: tenantId || "default",
              } as any)
              .limit(5)
              .execute();

            if (result.success && Array.isArray(result.data)) {
              for (const entry of result.data as any[]) {
                if (entry._id === currentId) continue;

                let score = 1.0;
                if (keyword === focusKeyword?.toLowerCase()) score += 0.5;
                if (entry.isCornerstone) score += 1.0;

                suggestions.push({
                  title: entry.title || entry.name || entry.slug,
                  url: `/${colId}/${entry.slug}`,
                  score,
                  collection: colName,
                });
              }
            }
          } catch (err) {
            logger.warn(`Error searching collection ${colId} for keyword "${keyword}":`, err);
          }
        })();

        searchPromises.push(queryPromise);
      }
    }

    // Execute all queries concurrently
    await Promise.all(searchPromises);

    // Sort by score and deduplicate by URL
    const uniqueSuggestions = Array.from(
      new Map(suggestions.sort((a, b) => b.score - a.score).map((s) => [s.url, s])).values(),
    ).slice(0, 8);

    return json({ suggestions: uniqueSuggestions });
  } catch (err) {
    logger.error("Error fetching link suggestions:", err);
    return json({ suggestions: [], error: (err as Error).message }, { status: 500 });
  }
};
