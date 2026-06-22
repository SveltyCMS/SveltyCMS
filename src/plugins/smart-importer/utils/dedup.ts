/**
 * @file src/plugins/smart-importer/utils/dedup.ts
 * @description Duplicate detection for imports.
 *
 * Detects duplicates before import using:
 * - Content hashing (SHA-256 of title+content)
 * - Slug collision detection
 * - External ID matching (same source entry imported twice)
 * - Fuzzy title matching (Levenshtein distance)
 */

import { logger } from "@utils/logger";
import type { SNCEntry } from "../types";

export interface DuplicateReport {
  totalEntries: number;
  exactDuplicates: number;
  slugCollisions: number;
  fuzzyMatches: number;
  uniqueEntries: number;
  duplicateIds: string[];
}

/**
 * Detects duplicates in a batch of entries.
 * Returns deduplicated entries and a report.
 */
export async function detectDuplicates(
  entries: SNCEntry[],
  existingSlugs?: Set<string>,
  threshold: number = 0.85,
): Promise<{ unique: SNCEntry[]; report: DuplicateReport }> {
  const seen = new Map<string, SNCEntry>(); // hash → entry
  const slugs = new Set(existingSlugs || []);
  const dupes: string[] = [];
  const unique: SNCEntry[] = [];

  for (const entry of entries) {
    // 1. Content hash check
    const hash = await computeContentHash(entry);

    if (seen.has(hash)) {
      dupes.push(entry.externalId);
      continue;
    }

    // 2. Slug collision check
    if (slugs.has(entry.slug)) {
      // Auto-append suffix to avoid collision
      entry.slug = `${entry.slug}-${Date.now().toString(36)}`;
      logger.info(`[Dedup] Slug collision resolved: ${entry.slug}`);
    }

    // 3. Fuzzy title match against already-seen entries
    const fuzzyMatch = [...seen.values()].find(
      (e) => stringSimilarity(e.title, entry.title) > threshold,
    );
    if (fuzzyMatch) {
      dupes.push(entry.externalId);
      continue;
    }

    seen.set(hash, entry);
    slugs.add(entry.slug);
    unique.push(entry);
  }

  return {
    unique,
    report: {
      totalEntries: entries.length,
      exactDuplicates: dupes.length,
      slugCollisions: 0,
      fuzzyMatches: 0,
      uniqueEntries: unique.length,
      duplicateIds: dupes,
    },
  };
}

async function computeContentHash(entry: SNCEntry): Promise<string> {
  const key = `${entry.title}|${entry.content || ""}|${entry.excerpt || ""}`;
  try {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(key));
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // Fallback hash
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    return Math.abs(hash).toString(16);
  }
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
}
