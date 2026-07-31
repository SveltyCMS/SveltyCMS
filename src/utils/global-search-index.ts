/**
 * @file src/utils/global-search-index.ts
 * @description Global search index for admin navigation and content discovery.
 *
 * Delegates ranking to command-palette scoring. Semantic search via server when available.
 * The writable store remains as the reactive binding layer for plugins and legacy consumers.
 *
 * ### Features:
 * - Admin page navigation (static catalog + Paraglide keys)
 * - Plugin-extensible entries via addToGlobalSearchIndex
 * - Semantic content search (collections, entries, media) via embedding vectors
 * - Keyword fallback for instant offline search
 */

import { writable } from "svelte/store";
import { logger } from "@utils/logger";
import {
  STATIC_CATALOG,
  type CommandPaletteEntry,
  type SearchTrigger,
  legacySearchDataToEntry,
} from "@utils/command-palette";

// ─── Types ────────────────────────────────────────────────────────────────

export type { SearchTrigger };

export interface SearchData {
  title: string;
  description: string;
  keywords: string[];
  triggers: Record<string, SearchTrigger>;
}

export interface SemanticSearchMatch {
  id: string;
  title: string;
  description: string;
  path: string;
  type: "admin-page" | "collection" | "entry" | "media" | "user";
  score: number;
  matchType: "semantic" | "keyword" | "both";
}

// ─── Store ─────────────────────────────────────────────────────────────────

/** @deprecated Prefer ui.isCommandBarVisible — kept for trigger-action consumers. */
export const isSearchVisible = writable(false);
export const triggerActionStore = writable<(() => void | Promise<void>)[]>([]);

/** Legacy writable index — plugins still push here; palette merges at open time. */
export const globalSearchIndex = writable<SearchData[]>(
  STATIC_CATALOG.map((def) => ({
    title: def.titleFallback,
    description: def.descriptionFallback,
    keywords: def.keywords,
    triggers: def.triggers ?? { [`Go to ${def.titleFallback}`]: { path: def.path } },
  })),
);

// ─── Plugin Integration ────────────────────────────────────────────────────

/**
 * Register a plugin-provided search entry.
 * Plugins call this at init time to add themselves to the global search.
 * Dedupes by lowercased title so HMR/plugin re-registration cannot grow the
 * index unboundedly.
 */
export function addToGlobalSearchIndex(newItem: SearchData): void {
  globalSearchIndex.update((currentIndex) => {
    const title = newItem.title?.trim().toLowerCase();
    if (!title) return currentIndex;
    if (currentIndex.some((existing) => existing.title?.trim().toLowerCase() === title)) {
      return currentIndex;
    }
    return [...currentIndex, newItem];
  });
  logger.debug(`[SearchIndex] Plugin registered: ${newItem.title}`);
}

/**
 * Convert current writable index (including plugins) to palette entries.
 * Static catalog titles should be re-resolved via Paraglide in the UI.
 */
export function pluginIndexToEntries(index: SearchData[]): CommandPaletteEntry[] {
  const staticTitles = new Set(STATIC_CATALOG.map((d) => d.titleFallback.toLowerCase()));
  return index
    .filter((item) => !staticTitles.has(item.title.toLowerCase()))
    .map(legacySearchDataToEntry);
}

// ─── Search API ────────────────────────────────────────────────────────────

/**
 * Search the global index for matching items.
 *
 * Strategy:
 * 1. Try semantic search via the server-side index
 * 2. Fall back to substring matching on title/description/keywords
 */
export async function searchGlobalIndex(
  query: string,
  options: { limit?: number } = {},
): Promise<SearchData[]> {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  try {
    const semanticResults = await searchSemanticFromServer(q);
    if (semanticResults.length > 0) {
      return convertSemanticResults(semanticResults, options.limit || 8);
    }
  } catch {
    // Server-side search unavailable — fall through to local
  }

  return searchLocalFallback(q, options.limit || 8);
}

function searchLocalFallback(query: string, limit: number): SearchData[] {
  const results: SearchData[] = [];
  globalSearchIndex.subscribe((index) => {
    for (const item of index) {
      if (
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.keywords.some((k) => k.toLowerCase().includes(query))
      ) {
        results.push(item);
      }
    }
  })();

  results.sort((a, b) => {
    const aExact =
      a.title.toLowerCase() === query ? 3 : a.keywords.some((k) => k === query) ? 2 : 1;
    const bExact =
      b.title.toLowerCase() === query ? 3 : b.keywords.some((k) => k === query) ? 2 : 1;
    return bExact - aExact;
  });

  return results.slice(0, limit);
}

export function searchGlobalIndexSync(query: string): SearchData[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: SearchData[] = [];
  globalSearchIndex.subscribe((index) => {
    for (const item of index) {
      if (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
      ) {
        results.push(item);
      }
    }
  })();

  return results;
}

async function searchSemanticFromServer(query: string): Promise<SemanticSearchMatch[]> {
  try {
    const url = `/api/search?mode=semantic&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data.map((r: Record<string, unknown>) => ({
          id: String(r.id ?? ""),
          title: String(r.title ?? ""),
          description: String(r.description ?? ""),
          path: String(r.path ?? ""),
          type: (r.type as SemanticSearchMatch["type"]) ?? "entry",
          score: Number(r.score ?? 0),
          matchType: (r.matchType as SemanticSearchMatch["matchType"]) ?? "keyword",
        }));
      }
    }
  } catch {
    // Semantic index not initialized or unavailable
  }
  return [];
}

function convertSemanticResults(matches: SemanticSearchMatch[], limit: number): SearchData[] {
  return matches.slice(0, limit).map((match) => ({
    title: match.title,
    description: match.description,
    keywords: [match.type],
    triggers: {
      [`Go to ${match.title}`]: { path: match.path },
    },
  }));
}

/** Map semantic hits into palette entries for the unified UI. */
export function semanticToPaletteEntries(matches: SemanticSearchMatch[]): CommandPaletteEntry[] {
  const iconFor = (type: SemanticSearchMatch["type"]) => {
    switch (type) {
      case "media":
        return "mdi:image";
      case "user":
        return "mdi:account";
      case "collection":
        return "mdi:database";
      case "admin-page":
        return "mdi:file-document-outline";
      default:
        return "mdi:file-document-outline";
    }
  };

  return matches.map((match) => ({
    id: `semantic:${match.id || match.path}`,
    category:
      match.type === "admin-page"
        ? ("page" as const)
        : match.type === "collection"
          ? ("collection" as const)
          : match.type === "media"
            ? ("media" as const)
            : match.type === "user"
              ? ("user" as const)
              : ("entry" as const),
    title: match.title,
    description: match.description || `${match.type} · ${match.path}`,
    keywords: [match.type, match.matchType],
    icon: iconFor(match.type),
    path: match.path,
    weight: Math.round(match.score * 50),
  }));
}

export function initializeGlobalSearch(): void {
  logger.info("[SearchIndex] Global search initialized with command palette catalog");
}
