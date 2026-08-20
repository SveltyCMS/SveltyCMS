/**
 * @file src/utils/global-search-index.svelte.ts
 * @description Svelte 5 reactive global search index and action triggers for admin navigation.
 *
 * ### Features:
 * - Svelte 5 fine-grained $state() reactivity for search catalog and action triggers
 * - Backward-compatible store contracts for legacy plugins & subscribers
 * - Semantic content search with local fallback
 * - Deduplication of registered entries
 */

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

// ─── Svelte 5 Rune State ──────────────────────────────────────────────────

class GlobalSearchState {
  entries = $state<SearchData[]>(
    STATIC_CATALOG.map((def) => ({
      title: def.titleFallback,
      description: def.descriptionFallback,
      keywords: def.keywords,
      triggers: def.triggers ?? { [`Go to ${def.titleFallback}`]: { path: def.path } },
    })),
  );
  isVisible = $state(false);
  triggerActions = $state<(() => void | Promise<void>)[]>([]);

  addEntry(newItem: SearchData): void {
    const title = newItem.title?.trim().toLowerCase();
    if (!title) return;
    if (this.entries.some((existing) => existing.title?.trim().toLowerCase() === title)) {
      return;
    }
    this.entries.push(newItem);
    logger.debug(`[SearchIndex] Plugin registered: ${newItem.title}`);
  }

  setTriggerActions(actions: (() => void | Promise<void>)[]): void {
    this.triggerActions = actions;
  }

  clearTriggerActions(): void {
    this.triggerActions = [];
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible;
  }
}

export const globalSearch = new GlobalSearchState();

// ─── Plugin Integration ────────────────────────────────────────────────────

/**
 * Register a plugin-provided search entry.
 */
export function addToGlobalSearchIndex(newItem: SearchData): void {
  globalSearch.addEntry(newItem);
}

/**
 * Convert current index (including plugins) to palette entries.
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
  for (const item of globalSearch.entries) {
    if (
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.keywords.some((k) => k.toLowerCase().includes(query))
    ) {
      results.push(item);
    }
  }

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
  for (const item of globalSearch.entries) {
    if (
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.toLowerCase().includes(q))
    ) {
      results.push(item);
    }
  }

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
