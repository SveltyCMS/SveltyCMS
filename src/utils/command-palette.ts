/**
 * @file src/utils/command-palette.ts
 * @description Pure helpers for the global command palette / Gin-style admin search.
 *
 * Features:
 * - Prefix filters (c/e/m/u/p/a, `>`)
 * - Fuzzy + weighted scoring (title > keywords > description > path > matchTerms)
 * - Multi-locale matchTerms harvested from Paraglide (en + de + hi + …)
 * - EN keywords + path always match even when UI is DE/HI
 * - Context boost from current route
 * - Recent destinations (localStorage, tenant-scoped)
 * - Catalog merge: static admin pages + live collections + actions
 */

import type { ContentNode } from "@src/content/types";
import { getEditDistance } from "@utils/string";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SearchCategory =
  | "page"
  | "action"
  | "collection"
  | "entry"
  | "media"
  | "user"
  | "plugin"
  | "recent";

export interface SearchTrigger {
  path: string;
  actionImport?: string;
  action?: (() => void | Promise<void>)[];
}

/** Catalog entry — title/description may be plain strings or Paraglide keys resolved at render. */
export interface CommandPaletteEntry {
  id: string;
  category: SearchCategory;
  /** Resolved display title (current UI locale). */
  title: string;
  /** One-line help text (current UI locale). */
  description: string;
  /**
   * Stable technical / EN match tokens (always active).
   * DE/HI users typing "user" still hit profile via these + path + matchTerms.
   */
  keywords: string[];
  /**
   * Precomputed match bag: all locale titles/descriptions + keywords + path tokens.
   * Used for scoring so typing EN or localized words both work.
   */
  matchTerms?: string[];
  icon: string;
  path?: string;
  triggers?: Record<string, SearchTrigger>;
  /** Route prefixes that boost this entry when the palette opens there. */
  contextBoost?: string[];
  weight?: number;
  /** Optional Paraglide message ids (for static catalog source). */
  titleKey?: string;
  descriptionKey?: string;
}

export interface RankedPaletteItem {
  entry: CommandPaletteEntry;
  /** Flattened option key when multi-trigger (trigger label). */
  triggerKey?: string;
  triggerPath?: string;
  score: number;
  section: "recent" | "context" | "results" | "actions" | "pages" | "collections";
}

export type PrefixFilter =
  | "all"
  | "action"
  | "page"
  | "collection"
  | "entry"
  | "media"
  | "user"
  | "path";

export interface ParsedQuery {
  filter: PrefixFilter;
  query: string;
  raw: string;
}

export interface RecentItem {
  id: string;
  path: string;
  title: string;
  description?: string;
  icon?: string;
  at: number;
}

// ─── Multi-locale match terms ───────────────────────────────────────────────

/**
 * Split a label into searchable tokens (Unicode letters/numbers; min length 2).
 * Keeps Latin + non-Latin scripts (DE umlauts, HI Devanagari, …).
 */
export function tokenizeForSearch(text: string): string[] {
  if (!text?.trim()) return [];
  const normalized = text.toLowerCase().normalize("NFKC");
  const parts = normalized
    .replace(/[^\p{L}\p{N}\s/_.-]+/gu, " ")
    .split(/[\s/_.-]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return parts;
}

/**
 * Build a language-agnostic match bag for scoring.
 * Always includes EN keywords + path segments so DE/HI UI still matches "user".
 */
export function buildMatchTerms(options: {
  titleVariants?: string[];
  descriptionVariants?: string[];
  keywords?: string[];
  path?: string;
}): string[] {
  const set = new Set<string>();

  const addText = (raw: string | undefined) => {
    if (!raw?.trim()) return;
    const full = raw.toLowerCase().trim();
    if (full.length >= 2) set.add(full);
    for (const t of tokenizeForSearch(raw)) set.add(t);
  };

  for (const v of options.titleVariants ?? []) addText(v);
  for (const v of options.descriptionVariants ?? []) addText(v);
  for (const k of options.keywords ?? []) addText(k);
  if (options.path) addText(options.path);

  return [...set];
}

// ─── Prefix parsing ─────────────────────────────────────────────────────────

const PREFIX_MAP: Record<string, PrefixFilter> = {
  ">": "action",
  a: "action",
  action: "action",
  p: "page",
  page: "page",
  pages: "page",
  c: "collection",
  col: "collection",
  collection: "collection",
  collections: "collection",
  e: "entry",
  entry: "entry",
  entries: "entry",
  m: "media",
  media: "media",
  u: "user",
  user: "user",
  users: "user",
};

/**
 * Parse Coffee/Gin-style prefixes from the raw search box value.
 * Examples: `c posts`, `> settings`, `/config`, `m logo`
 */
export function parsePaletteQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { filter: "all", query: "", raw: "" };
  }

  if (trimmed.startsWith("/")) {
    return { filter: "path", query: trimmed.slice(1).trim().toLowerCase(), raw: trimmed };
  }

  if (trimmed.startsWith(">")) {
    return {
      filter: "action",
      query: trimmed.slice(1).trim().toLowerCase(),
      raw: trimmed,
    };
  }

  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx > 0) {
    const head = trimmed.slice(0, spaceIdx).toLowerCase();
    const rest = trimmed
      .slice(spaceIdx + 1)
      .trim()
      .toLowerCase();
    const mapped = PREFIX_MAP[head];
    if (mapped && rest) {
      return { filter: mapped, query: rest, raw: trimmed };
    }
  }

  // Single-token prefix with empty rest: the letter alone is searched as a normal
  // query — filter-only requires the trailing space (handled above).
  const lower = trimmed.toLowerCase();
  return { filter: "all", query: lower, raw: trimmed };
}

// ─── Scoring ────────────────────────────────────────────────────────────────

function includesScore(haystack: string, needle: string): number {
  if (!needle || !haystack) return 0;
  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 80;
  if (haystack.includes(needle)) return 55;
  return 0;
}

/**
 * Score an entry against a normalized query (0 = no match, higher = better).
 */
export function scoreEntry(
  entry: CommandPaletteEntry,
  query: string,
  options: {
    pathname?: string;
    filter?: PrefixFilter;
  } = {},
): number {
  const { pathname = "", filter = "all" } = options;

  if (filter !== "all" && filter !== "path") {
    if (filter === "action" && entry.category !== "action") return 0;
    if (filter === "page" && entry.category !== "page" && entry.category !== "plugin") return 0;
    if (filter === "collection" && entry.category !== "collection") return 0;
    if (filter === "entry" && entry.category !== "entry") return 0;
    if (filter === "media" && entry.category !== "media") return 0;
    if (filter === "user" && entry.category !== "user") return 0;
  }

  const title = entry.title.toLowerCase();
  const desc = entry.description.toLowerCase();
  const path = (entry.path ?? "").toLowerCase();
  const keywords = entry.keywords.map((k) => k.toLowerCase());
  // Prefer precomputed multi-locale bag; always fall back to EN keywords + path + display
  const matchTerms = (
    entry.matchTerms?.length
      ? entry.matchTerms
      : buildMatchTerms({
          titleVariants: [entry.title],
          descriptionVariants: [entry.description],
          keywords: entry.keywords,
          path: entry.path,
        })
  ).map((t) => t.toLowerCase());

  if (filter === "path") {
    // Note: `!query` here is implied — path.includes("") is always true, so the
    // old `!path.includes(query) && !query` guard was unreachable dead code.
    return path.includes(query) ? 70 + includesScore(path, query) * 0.1 : 0;
  }

  let score = 0;

  if (!query) {
    // Empty query: base weight + context boost only
    score = entry.weight ?? 10;
  } else {
    // Current-locale title ranks highest when it matches (what user sees)
    const titleHit = includesScore(title, query);
    if (titleHit) score += titleHit * 1.5;

    // EN technical keywords — always active for DE/HI users typing English
    const keywordHits = keywords.map((k) => includesScore(k, query));
    const bestKeyword = keywordHits.length ? Math.max(...keywordHits) : 0;
    if (bestKeyword) score += bestKeyword * 1.25;

    const descHit = includesScore(desc, query);
    if (descHit) score += descHit * 0.5;

    const pathHit = includesScore(path, query);
    if (pathHit) score += pathHit * 0.45;

    // All-locale harvested terms (Benutzer, उपयोगकर्ता, full phrases, …)
    let bestMatchTerm = 0;
    for (const term of matchTerms) {
      bestMatchTerm = Math.max(bestMatchTerm, includesScore(term, query));
    }
    if (bestMatchTerm) score += bestMatchTerm * 1.15;

    // Multi-word: all tokens must appear somewhere in the full match blob
    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      const blob = `${title} ${desc} ${keywords.join(" ")} ${path} ${matchTerms.join(" ")}`;
      const allPresent = tokens.every((t) => blob.includes(t));
      if (!allPresent) score *= 0.15;
      else score += 20;
    }

    // Fuzzy fallback when no strong substring match
    if (score < 30 && query.length >= 2) {
      const titleDist = getEditDistance(query, title);
      // getEditDistance is normalized 0–1 (lower = closer)
      if (titleDist <= 0.4) {
        score += Math.round((1 - titleDist) * 40);
      }
      for (const k of keywords) {
        const kd = getEditDistance(query, k);
        if (kd <= 0.35) score += Math.round((1 - kd) * 25);
      }
      for (const term of matchTerms.slice(0, 24)) {
        if (term.length < 3) continue;
        const td = getEditDistance(query, term);
        if (td <= 0.35) score += Math.round((1 - td) * 20);
      }
    }

    if (score <= 0) return 0;
  }

  // Context boost
  if (pathname && entry.contextBoost?.length) {
    for (const prefix of entry.contextBoost) {
      if (pathname.startsWith(prefix) || pathname.includes(prefix)) {
        score += query ? 25 : 40;
        break;
      }
    }
  } else if (pathname && entry.path) {
    if (pathname === entry.path || pathname.startsWith(entry.path + "/")) {
      score += query ? 15 : 30;
    }
  }

  score += entry.weight ?? 0;
  return score;
}

/**
 * Flatten multi-trigger entries into navigable list rows.
 */
export function flattenToRankedItems(
  entries: CommandPaletteEntry[],
  query: string,
  options: { pathname?: string; filter?: PrefixFilter; limit?: number } = {},
): RankedPaletteItem[] {
  const limit = options.limit ?? 12;
  const ranked: RankedPaletteItem[] = [];

  for (const entry of entries) {
    const base = scoreEntry(entry, query, options);
    if (base <= 0 && query) continue;

    const triggers = entry.triggers ? Object.entries(entry.triggers) : [];
    if (triggers.length <= 1) {
      const [triggerKey, trigger] = triggers[0] ?? [undefined, undefined];
      ranked.push({
        entry,
        triggerKey,
        triggerPath: trigger?.path ?? entry.path,
        score: base,
        section: sectionFor(entry.category),
      });
    } else {
      for (const [triggerKey, trigger] of triggers) {
        let tScore = base;
        if (query) {
          const tk = triggerKey.toLowerCase();
          tScore += includesScore(tk, query) * 0.8;
          tScore += includesScore((trigger.path ?? "").toLowerCase(), query) * 0.3;
        }
        if (tScore <= 0 && query) continue;
        ranked.push({
          entry,
          triggerKey,
          triggerPath: trigger.path,
          score: tScore,
          section: sectionFor(entry.category),
        });
      }
    }
  }

  ranked.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
  return ranked.slice(0, limit);
}

function sectionFor(category: SearchCategory): RankedPaletteItem["section"] {
  switch (category) {
    case "action":
      return "actions";
    case "collection":
      return "collections";
    case "recent":
      return "recent";
    case "page":
    case "plugin":
      return "pages";
    default:
      return "results";
  }
}

// ─── Recents ────────────────────────────────────────────────────────────────

const RECENTS_PREFIX = "sveltycms.global-search.recents";
const MAX_RECENTS = 10;

export function recentsStorageKey(tenantId?: string | null, userId?: string | null): string {
  return `${RECENTS_PREFIX}:${tenantId || "default"}:${userId || "anon"}`;
}

export function loadRecents(storageKey: string): RecentItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.path === "string" && typeof r.title === "string")
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function pushRecent(storageKey: string, item: Omit<RecentItem, "at">): RecentItem[] {
  const next: RecentItem = { ...item, at: Date.now() };
  const prev = loadRecents(storageKey).filter((r) => r.id !== next.id && r.path !== next.path);
  const list = [next, ...prev].slice(0, MAX_RECENTS);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(storageKey, JSON.stringify(list));
    } catch {
      // quota / private mode
    }
  }
  return list;
}

export function recentsToEntries(recents: RecentItem[]): CommandPaletteEntry[] {
  return recents.map((r) => ({
    id: `recent:${r.id}`,
    category: "recent" as const,
    title: r.title,
    description: r.description || r.path,
    keywords: ["recent"],
    icon: r.icon || "mdi:history",
    path: r.path,
    weight: 5,
  }));
}

// ─── Context label ──────────────────────────────────────────────────────────

export function contextLabelFromPath(pathname: string): string | null {
  if (!pathname || pathname === "/") return null;
  if (pathname.startsWith("/mediagallery")) return "Media Gallery";
  if (pathname.includes("collectionbuilder")) return "Collection Builder";
  if (pathname.startsWith("/config")) return "Configuration";
  if (pathname.startsWith("/user")) return "User";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  // Collection content routes: /en/posts or /posts
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 1 && !["config", "api", "setup", "login"].includes(parts[0]!)) {
    const name = parts[parts.length - 1]!;
    if (name && name.length < 40) return name;
  }
  return null;
}

// ─── Collections → catalog ──────────────────────────────────────────────────

function nodeDisplayName(node: ContentNode): string {
  const tr = node.translations?.find((t) => t.isDefault) ?? node.translations?.[0];
  return tr?.translationName || node.name;
}

/**
 * Walk content structure and produce palette entries for collections (and optional categories).
 */
export function collectionsToEntries(
  nodes: ContentNode[],
  contentLanguage = "en",
): CommandPaletteEntry[] {
  const out: CommandPaletteEntry[] = [];

  function walk(list: ContentNode[], parentPath = "") {
    for (const node of list) {
      const label = nodeDisplayName(node);
      const path =
        node.path ||
        (node.nodeType === "collection" ? `/${contentLanguage}/${node.name}` : parentPath);

      if (node.nodeType === "collection") {
        const titleVariants = uniqueStrings([
          label,
          node.name,
          ...(node.translations?.map((t) => t.translationName) ?? []),
        ]);
        const keywords = [
          node.name,
          label,
          "collection",
          "content",
          ...(node.slug ? [node.slug] : []),
        ];
        const resolvedPath = path.startsWith("/")
          ? path
          : `/${contentLanguage}${path.startsWith("/") ? "" : "/"}${path}`;
        out.push({
          id: `collection:${node._id || node.name}`,
          category: "collection",
          title: label,
          description: node.description?.trim() || `Open collection · ${node.name}`,
          keywords,
          matchTerms: buildMatchTerms({
            titleVariants,
            descriptionVariants: [node.description?.trim() || ""].filter(Boolean),
            keywords,
            path: resolvedPath,
          }),
          icon: node.icon || "mdi:database",
          path: resolvedPath,
          weight: 12,
          contextBoost: [path, `/${node.name}`, node.name],
        });
      } else if (node.nodeType === "category" || node.nodeType === "folder") {
        // Categories are navigable in builder / sidebar context
        if (node.path) {
          const titleVariants = uniqueStrings([
            label,
            node.name,
            ...(node.translations?.map((t) => t.translationName) ?? []),
          ]);
          const keywords = [node.name, label, "category", "folder"];
          out.push({
            id: `category:${node._id || node.name}`,
            category: "page",
            title: label,
            description: node.description?.trim() || `Category · ${node.name}`,
            keywords,
            matchTerms: buildMatchTerms({
              titleVariants,
              descriptionVariants: [node.description?.trim() || ""].filter(Boolean),
              keywords,
              path: node.path,
            }),
            icon: node.icon || "mdi:folder",
            path: node.path,
            weight: 4,
          });
        }
      }

      if (node.children?.length) {
        walk(node.children, path);
      }
    }
  }

  walk(nodes);
  return out;
}

// ─── Static admin catalog (keys resolved by UI) ─────────────────────────────

export interface StaticCatalogDef {
  id: string;
  category: SearchCategory;
  titleKey: string;
  descriptionKey: string;
  /** English fallback if Paraglide not compiled yet */
  titleFallback: string;
  descriptionFallback: string;
  keywords: string[];
  icon: string;
  path: string;
  triggers?: Record<string, SearchTrigger>;
  contextBoost?: string[];
  weight?: number;
}

export const STATIC_CATALOG: StaticCatalogDef[] = [
  {
    id: "page:dashboard",
    category: "page",
    titleKey: "global_search_dashboard_title",
    descriptionKey: "global_search_dashboard_description",
    titleFallback: "Dashboard",
    descriptionFallback: "System overview, activity, and real-time health metrics.",
    keywords: ["home", "dashboard", "activity", "health", "metrics"],
    icon: "mdi:view-dashboard",
    path: "/dashboard",
    contextBoost: ["/dashboard"],
    weight: 20,
    triggers: { "Go to Dashboard": { path: "/dashboard" } },
  },
  {
    id: "page:media",
    category: "page",
    titleKey: "global_search_media_title",
    descriptionKey: "global_search_media_description",
    titleFallback: "Media Gallery",
    descriptionFallback: "DAM engine with tagging, batch editing, and transcoding.",
    keywords: ["media", "gallery", "images", "batch", "transcode", "video", "audio", "dam"],
    icon: "mdi:image-multiple",
    path: "/mediagallery",
    contextBoost: ["/mediagallery"],
    weight: 18,
    triggers: {
      "Go to Media Gallery": { path: "/mediagallery" },
      "Batch Image Processor": { path: "/mediagallery?mode=batch" },
      "Video Transcoding Hub": { path: "/mediagallery?mode=transcode" },
    },
  },
  {
    id: "page:collectionbuilder",
    category: "page",
    titleKey: "global_search_builder_title",
    descriptionKey: "global_search_builder_description",
    titleFallback: "Collection Builder",
    descriptionFallback: "Build schemas with visual logic and field validation.",
    keywords: ["builder", "collection", "schema", "logic", "field", "validation"],
    icon: "mdi:database-edit",
    path: "/config/collectionbuilder",
    contextBoost: ["/config/collectionbuilder"],
    weight: 18,
    triggers: {
      "Go to Collection Builder": { path: "/config/collectionbuilder" },
      "Create New Collection": { path: "/config/collectionbuilder/new" },
    },
  },
  {
    id: "action:create-collection",
    category: "action",
    titleKey: "global_search_create_collection_title",
    descriptionKey: "global_search_create_collection_description",
    titleFallback: "Create collection",
    descriptionFallback: "Open Collection Builder with a new schema.",
    keywords: ["create", "new", "collection", "schema"],
    icon: "mdi:plus-box",
    path: "/config/collectionbuilder/new",
    contextBoost: ["/config/collectionbuilder"],
    weight: 16,
  },
  {
    id: "page:settings",
    category: "page",
    titleKey: "global_search_settings_title",
    descriptionKey: "global_search_settings_description",
    titleFallback: "System Settings",
    descriptionFallback: "Database, email, cache, and security configuration.",
    keywords: ["settings", "config", "smtp", "email", "cache", "security", "database"],
    icon: "mdi:cog",
    path: "/config/system-settings",
    contextBoost: ["/config/system-settings", "/config"],
    weight: 15,
  },
  {
    id: "page:monitor",
    category: "page",
    titleKey: "global_search_monitor_title",
    descriptionKey: "global_search_monitor_description",
    titleFallback: "System Monitor",
    descriptionFallback: "Health dashboard, audit log, and plugin status.",
    keywords: ["monitor", "health", "audit", "status", "logs", "cpu", "memory"],
    icon: "mdi:heart-pulse",
    path: "/config/monitor",
    contextBoost: ["/config/monitor"],
    weight: 12,
  },
  {
    id: "page:access",
    category: "page",
    titleKey: "global_search_access_title",
    descriptionKey: "global_search_access_description",
    titleFallback: "Access Management",
    descriptionFallback: "Users, roles, permissions, tokens, and SAML/SCIM.",
    keywords: ["access", "users", "roles", "permissions", "tokens", "rbac", "saml", "scim"],
    icon: "mdi:shield-account",
    path: "/config/access-management",
    contextBoost: ["/config/access-management"],
    weight: 14,
  },
  {
    id: "page:extensions",
    category: "page",
    titleKey: "global_search_extensions_title",
    descriptionKey: "global_search_extensions_description",
    titleFallback: "Extensions",
    descriptionFallback: "Plugins, widgets, themes, and marketplace discovery.",
    keywords: ["extensions", "plugins", "widgets", "themes", "marketplace", "install"],
    icon: "mdi:puzzle",
    path: "/config/extensions",
    contextBoost: ["/config/extensions"],
    weight: 12,
  },
  {
    id: "page:automations",
    category: "page",
    titleKey: "global_search_automations_title",
    descriptionKey: "global_search_automations_description",
    titleFallback: "Automations",
    descriptionFallback: "Event-driven workflows with conditional logic.",
    keywords: ["automation", "workflow", "trigger", "action", "event", "rule"],
    icon: "mdi:robot",
    path: "/config/automations",
    contextBoost: ["/config/automations"],
    weight: 12,
  },
  {
    id: "page:queue",
    category: "page",
    titleKey: "global_search_queue_title",
    descriptionKey: "global_search_queue_description",
    titleFallback: "Background Queue",
    descriptionFallback: "Jobs, scheduled tasks, and failed operation retries.",
    keywords: ["queue", "jobs", "tasks", "background", "retry", "scheduled"],
    icon: "mdi:tray-full",
    path: "/config/queue",
    contextBoost: ["/config/queue"],
    weight: 10,
  },
  {
    id: "page:sync",
    category: "page",
    titleKey: "global_search_sync_title",
    descriptionKey: "global_search_sync_description",
    titleFallback: "Data Sync & Import",
    descriptionFallback: "Import from WordPress, Strapi, Directus, Drupal, or exports.",
    keywords: ["sync", "import", "export", "migrate", "wordpress", "strapi", "directus", "drupal"],
    icon: "mdi:swap-horizontal",
    path: "/config/sync",
    contextBoost: ["/config/sync"],
    weight: 10,
  },
  {
    id: "page:webhooks",
    category: "page",
    titleKey: "global_search_webhooks_title",
    descriptionKey: "global_search_webhooks_description",
    titleFallback: "Webhooks",
    descriptionFallback: "Outgoing HTTP callbacks on content events.",
    keywords: ["webhook", "callback", "http", "event", "integration", "dlq"],
    icon: "mdi:webhook",
    path: "/config/webhooks",
    contextBoost: ["/config/webhooks"],
    weight: 10,
  },
  {
    id: "page:redirects",
    category: "page",
    titleKey: "global_search_redirects_title",
    descriptionKey: "global_search_redirects_description",
    titleFallback: "Redirects",
    descriptionFallback: "301/302 rules with regex patterns and CSV import.",
    keywords: ["redirect", "seo", "301", "302", "regex", "url", "rewrite"],
    icon: "mdi:directions-fork",
    path: "/config/redirects",
    contextBoost: ["/config/redirects"],
    weight: 8,
  },
  {
    id: "page:trash",
    category: "page",
    titleKey: "global_search_trash_title",
    descriptionKey: "global_search_trash_description",
    titleFallback: "Trash",
    descriptionFallback: "Recover or permanently delete soft-deleted content.",
    keywords: ["trash", "delete", "recover", "restore", "soft-delete", "undo"],
    icon: "mdi:delete-restore",
    path: "/config/trash",
    contextBoost: ["/config/trash"],
    weight: 8,
  },
  {
    id: "page:user",
    category: "page",
    titleKey: "global_search_profile_title",
    descriptionKey: "global_search_profile_description",
    titleFallback: "User Profile",
    descriptionFallback: "Account settings, avatar, password, 2FA, and sessions.",
    keywords: ["user", "profile", "avatar", "password", "2fa", "session", "account"],
    icon: "mdi:account-circle",
    path: "/user",
    contextBoost: ["/user"],
    weight: 12,
  },
  {
    id: "page:config",
    category: "page",
    titleKey: "global_search_config_title",
    descriptionKey: "global_search_config_description",
    titleFallback: "Configuration",
    descriptionFallback: "System configuration overview and navigation hub.",
    keywords: ["config", "settings", "setup", "administration", "system"],
    icon: "mdi:tune",
    path: "/config",
    contextBoost: ["/config"],
    weight: 10,
  },
  {
    id: "action:invite-user",
    category: "action",
    titleKey: "global_search_invite_user_title",
    descriptionKey: "global_search_invite_user_description",
    titleFallback: "Invite user",
    descriptionFallback: "Open user management to send an invite token.",
    keywords: ["invite", "user", "token", "register"],
    icon: "mdi:account-plus",
    path: "/user",
    contextBoost: ["/user", "/config/access-management"],
    weight: 11,
  },
];

/**
 * Resolve static catalog for display + multi-locale matching.
 *
 * @param resolve - Current UI locale (what the user sees)
 * @param options.resolveAll - All locale variants for matchTerms (en+de+hi+…).
 *   When omitted, falls back to display string + English fallbacks + keywords + path
 *   so EN typing still works under DE/HI UI.
 */
export function staticDefsToEntries(
  resolve: (key: string, fallback: string) => string,
  options?: {
    /** Return every locale’s string for a message key (for match bag). */
    resolveAll?: (key: string, fallback: string) => string[];
  },
): CommandPaletteEntry[] {
  return STATIC_CATALOG.map((def) => {
    const title = resolve(def.titleKey, def.titleFallback);
    const description = resolve(def.descriptionKey, def.descriptionFallback);

    const titleVariants = uniqueStrings([
      ...(options?.resolveAll?.(def.titleKey, def.titleFallback) ?? []),
      title,
      def.titleFallback, // always keep EN source for DE/HI users typing English
    ]);
    const descriptionVariants = uniqueStrings([
      ...(options?.resolveAll?.(def.descriptionKey, def.descriptionFallback) ?? []),
      description,
      def.descriptionFallback,
    ]);

    const matchTerms = buildMatchTerms({
      titleVariants,
      descriptionVariants,
      keywords: def.keywords,
      path: def.path,
    });

    return {
      id: def.id,
      category: def.category,
      title,
      description,
      keywords: def.keywords,
      matchTerms,
      icon: def.icon,
      path: def.path,
      triggers: def.triggers,
      contextBoost: def.contextBoost,
      weight: def.weight,
      titleKey: def.titleKey,
      descriptionKey: def.descriptionKey,
    };
  });
}

function uniqueStrings(values: string[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = v?.trim();
    if (t) set.add(t);
  }
  return [...set];
}

/** Map legacy SearchData rows into palette entries (plugins / old index). */
export function legacySearchDataToEntry(item: {
  title: string;
  description: string;
  keywords: string[];
  triggers: Record<string, SearchTrigger>;
}): CommandPaletteEntry {
  const firstPath = Object.values(item.triggers)[0]?.path;
  const matchTerms = buildMatchTerms({
    titleVariants: [item.title],
    descriptionVariants: [item.description],
    keywords: item.keywords,
    path: firstPath,
  });
  return {
    id: `legacy:${item.title}`,
    category: "plugin",
    title: item.title,
    description: item.description,
    keywords: item.keywords,
    matchTerms,
    icon: "mdi:puzzle-outline",
    path: firstPath,
    triggers: item.triggers,
    weight: 8,
  };
}
