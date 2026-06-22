/**
 * @file src/utils/global-search-index.ts
 * @description Global search index for admin navigation and content discovery.
 *
 * Refactored June 2026: Now delegates to the semantic search index for intelligent
 * ranking (NPU-accelerated embeddings when Ollama is available, TF-IDF fallback).
 * The writable store remains as the reactive binding layer for the search UI component.
 *
 * ### Architecture:
 * - Client-side: writable store for reactive search UI binding
 * - Server-side: semantic-index.ts for embedding-based similarity search
 * - Fallback: substring matching on title/description/keywords when server unavailable
 *
 * ### Features:
 * - Admin page navigation (15 built-in pages)
 * - Semantic content search (collections, entries, media) via embedding vectors
 * - Keyword fallback for instant offline search
 * - Plugin-extensible: plugins can register their own search entries
 * - NPU-accelerated: embedding generation uses Intel NPU via Ollama when available
 */

import { writable } from "svelte/store";
import { logger } from "@utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────

export interface SearchTrigger {
  path: string;
  /** Lazy action import path — resolved only when the action is triggered. */
  actionImport?: string;
  /** Legacy inline action array — kept for backward compatibility. */
  action?: (() => void | Promise<void>)[];
}

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
  score: number; // 0–1 relevance
  matchType: "semantic" | "keyword" | "both";
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const isSearchVisible = writable(false);
export const triggerActionStore = writable<(() => void | Promise<void>)[]>([]);

export const globalSearchIndex = writable<SearchData[]>([
  {
    title: "Dashboard",
    description: "System overview, activity, and real-time health metrics.",
    keywords: ["home", "dashboard", "activity", "health", "metrics"],
    triggers: { "Go to Dashboard": { path: "/dashboard" } },
  },
  {
    title: "Media Gallery",
    description: "DAM Engine with AI tagging, batch editing, and transcoding.",
    keywords: ["media", "gallery", "images", "batch", "transcode", "video", "audio"],
    triggers: {
      "Go to Media Gallery": { path: "/mediagallery" },
      "Batch Image Processor": { path: "/mediagallery?mode=batch" },
      "Video Transcoding Hub": { path: "/mediagallery?mode=transcode" },
    },
  },
  {
    title: "Collection Builder",
    description: "Build schemas with visual logic, BuzzForms, and field validation.",
    keywords: ["builder", "collection", "schema", "logic", "field", "validation"],
    triggers: {
      "Go to Collection Builder": { path: "/config/collectionbuilder" },
      "Create New Collection": { path: "/config/collectionbuilder/new" },
      "Manage Field Logic": { path: "/config/collectionbuilder?tab=logic" },
    },
  },
  {
    title: "System Settings",
    description: "Database, email, cache, and security configuration.",
    keywords: ["settings", "config", "smtp", "email", "cache", "security", "database"],
    triggers: { "Go to System Settings": { path: "/config/system-settings" } },
  },
  {
    title: "System Monitor",
    description: "Health dashboard, audit log, CPU/memory telemetry, and plugin status.",
    keywords: ["monitor", "health", "audit", "status", "logs", "cpu", "memory"],
    triggers: { "Go to System Monitor": { path: "/config/monitor" } },
  },
  {
    title: "Access Management",
    description: "Users, roles, permissions, website tokens, and SAML/SCIM.",
    keywords: ["access", "users", "roles", "permissions", "tokens", "rbac", "saml", "scim"],
    triggers: {
      "Go to Access Management": { path: "/config/access-management" },
    },
  },
  {
    title: "Extensions",
    description: "Plugins, widgets, themes, and marketplace discovery.",
    keywords: ["extensions", "plugins", "widgets", "themes", "marketplace", "install"],
    triggers: { "Go to Extensions": { path: "/config/extensions" } },
  },
  {
    title: "Automations",
    description: "Event-driven workflow automations with conditional logic.",
    keywords: ["automation", "workflow", "trigger", "action", "event", "rule"],
    triggers: { "Go to Automations": { path: "/config/automations" } },
  },
  {
    title: "Background Queue",
    description: "Monitor background jobs, scheduled tasks, and retry failed operations.",
    keywords: ["queue", "jobs", "tasks", "background", "retry", "scheduled"],
    triggers: { "Go to Background Queue": { path: "/config/queue" } },
  },
  {
    title: "Data Sync & Import",
    description: "Import content from WordPress, Strapi, Directus, Drupal, or SveltyCMS exports.",
    keywords: ["sync", "import", "export", "migrate", "wordpress", "strapi", "directus"],
    triggers: {
      "Go to Data Sync": { path: "/config/sync" },
      "Smart Importer": { path: "/config?plugin=smart-importer" },
    },
  },
  {
    title: "Webhooks",
    description: "Outgoing HTTP callbacks on content events with DLQ monitoring.",
    keywords: ["webhook", "callback", "http", "event", "integration", "dlq"],
    triggers: { "Go to Webhooks": { path: "/config/webhooks" } },
  },
  {
    title: "Redirects",
    description: "301/302 redirect rules with regex pattern support and CSV import.",
    keywords: ["redirect", "seo", "301", "302", "regex", "url", "rewrite"],
    triggers: { "Go to Redirects": { path: "/config/redirects" } },
  },
  {
    title: "Trash",
    description: "Recover or permanently delete soft-deleted content with audit trail.",
    keywords: ["trash", "delete", "recover", "restore", "soft-delete", "undo"],
    triggers: { "Go to Trash": { path: "/config/trash" } },
  },
  {
    title: "User Profile",
    description: "Account settings, avatar, password, 2FA, and session management.",
    keywords: ["user", "profile", "avatar", "password", "2fa", "session", "account"],
    triggers: {
      "Go to Profile": { path: "/user" },
    },
  },
  {
    title: "Configuration",
    description: "System configuration overview and navigation hub.",
    keywords: ["config", "settings", "setup", "administration", "system"],
    triggers: { "Go to Configuration": { path: "/config" } },
  },
]);

// ─── Plugin Integration ────────────────────────────────────────────────────

/**
 * Register a plugin-provided search entry.
 * Plugins call this at init time to add themselves to the global search.
 */
export function addToGlobalSearchIndex(newItem: SearchData): void {
  globalSearchIndex.update((currentIndex) => [...currentIndex, newItem]);
  logger.debug(`[SearchIndex] Plugin registered: ${newItem.title}`);
}

// ─── Search API ────────────────────────────────────────────────────────────

/**
 * Search the global index for matching items.
 *
 * Strategy:
 * 1. Try semantic search via the server-side index (NPU-accelerated embeddings)
 * 2. Fall back to substring matching on title/description/keywords
 * 3. Merge and deduplicate results
 */
export async function searchGlobalIndex(
  query: string,
  options: { limit?: number } = {},
): Promise<SearchData[]> {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  // Try semantic search first (server-side, NPU-accelerated)
  try {
    const semanticResults = await searchSemanticFromServer(q);
    if (semanticResults.length > 0) {
      return convertSemanticResults(semanticResults, options.limit || 8);
    }
  } catch {
    // Server-side search unavailable — fall through to local
  }

  // Local substring fallback (instant, no network)
  return searchLocalFallback(q, options.limit || 8);
}

/**
 * Local substring search — instant, works offline, no server needed.
 */
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

  // Sort: exact title match first, then keyword match, then description
  results.sort((a, b) => {
    const aExact =
      a.title.toLowerCase() === query ? 3 : a.keywords.some((k) => k === query) ? 2 : 1;
    const bExact =
      b.title.toLowerCase() === query ? 3 : b.keywords.some((k) => k === query) ? 2 : 1;
    return bExact - aExact;
  });

  return results.slice(0, limit);
}

/**
 * Sync version for reactive UI binding (substring-only, instant).
 */
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

// ─── Server-Side Semantic Search Bridge ────────────────────────────────────

async function searchSemanticFromServer(query: string): Promise<SemanticSearchMatch[]> {
  // Call the semantic index via internal API (not HTTP — direct function call)
  try {
    const { semanticSearch } = await import("@src/services/intelligence/semantic-index");
    const results = await semanticSearch(query, { limit: 10, minScore: 0.15 });
    return results.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      path: r.path,
      type: r.type,
      score: r.score,
      matchType: r.matchType,
    }));
  } catch {
    // Semantic index not initialized or unavailable
    return [];
  }
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

// ─── Initialization ────────────────────────────────────────────────────────

export function initializeGlobalSearch(): void {
  logger.info("[SearchIndex] Global search initialized with semantic + keyword search");
}
