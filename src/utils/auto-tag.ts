/**
 * @file src/utils/auto-tag.ts
 * @description Auto-tagging integration — generates tag suggestions on content save.
 *
 * Wraps entry save operations to optionally auto-generate tags before persisting.
 * Uses the content-insights service (Ollama NPU or keyword extraction fallback).
 *
 * ### Usage in entry editor:
 * ```typescript
 * import { autoTagOnSave } from '@utils/auto-tag';
 *
 * // Before save, enrich payload with auto-generated tags
 * const payload = { title: "...", body: "..." };
 * const enriched = await autoTagOnSave(payload);
 * await updateEntry(collectionId, entryId, enriched);
 * ```
 */

import { generateTags } from "@src/services/intelligence/content-insights";

/**
 * Auto-generate tags for content before saving.
 * Merges with existing tags — never removes manually-added tags.
 */
export async function autoTagOnSave(
  payload: Record<string, unknown>,
  existingTags: string[] = [],
): Promise<Record<string, unknown>> {
  // Build text for analysis
  const text = [payload.title, payload.body, payload.content, payload.description, payload.excerpt]
    .filter(Boolean)
    .join(" ");

  if (!text || text.length < 20) return payload;

  try {
    const suggestions = await generateTags(text, existingTags, 5);
    const newTags = suggestions.filter((s) => s.confidence > 0.4).map((s) => s.tag);

    if (newTags.length === 0) return payload;

    // Merge with existing tags, deduplicate
    const merged = [...new Set([...existingTags, ...newTags])];

    return {
      ...payload,
      tags: merged,
      _autoTagged: true,
      _autoTagSource: suggestions[0]?.source || "keyword",
    };
  } catch {
    return payload; // Fail silently — tags are optional
  }
}
