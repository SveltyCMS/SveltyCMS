/**
 * @file src/utils/auto-tag.ts
 * @description Hardened auto-tagging integration.
 *
 * ### Hardening (audit 2026-07):
 * - Type-safe text aggregation: typeof guard filters non-strings even if Boolean() passes
 * - Raised confidence threshold: 0.4 → 0.6 (reduces noisy/irrelevant tag suggestions)
 * - Traceability: _autoTagDate timestamp for auditing when tags were generated
 * - Defensive array check: Array.isArray guards against null/object existingTags
 * - Error logging: silent fail → logger.error for developer diagnostics
 *
 * Auto-tagging integration — generates tag suggestions on content save.
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
import { logger } from "./logger";

/**
 * Auto-generate tags for content before saving.
 * Merges with existing tags — never removes manually-added tags.
 */
export async function autoTagOnSave(
  payload: Record<string, unknown>,
  existingTags: string[] = [],
): Promise<Record<string, unknown>> {
  // 🛡️ Type-safe text aggregation — only strings pass through
  const text = [payload.title, payload.body, payload.content, payload.description, payload.excerpt]
    .filter((v): v is string => typeof v === "string")
    .join(" ");

  // 🛡️ Skip short text (noisy/uninformative for NLP tagging)
  if (text.length < 50) return payload;

  try {
    const suggestions = await generateTags(text, existingTags, 5);

    // 🛡️ Strict confidence filtering — 0.6 threshold reduces noisy suggestions
    const newTags = suggestions
      .filter((s) => s?.confidence && s.confidence > 0.6)
      .map((s) => s.tag);

    if (newTags.length === 0) return payload;

    // 🛡️ Deduplicate and maintain state (defensive Array.isArray check)
    const currentTags = Array.isArray(existingTags) ? existingTags : [];
    const merged = Array.from(new Set([...currentTags, ...newTags]));

    return {
      ...payload,
      tags: merged,
      _autoTagged: true,
      _autoTagSource: suggestions[0]?.source ?? "keyword",
      _autoTagDate: new Date().toISOString(),
    };
  } catch (err) {
    // 🛡️ Log internal error for debugging — don't block the save
    logger.error("[AutoTag] Intelligence service failed:", err);
    return payload;
  }
}
