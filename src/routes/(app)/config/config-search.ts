/**
 * @file src/routes/(app)/config/config-search.ts
 * @description Pure helpers for the `/config` tile search.
 *
 * Kept free of Svelte/DOM imports so the filter contract is unit-testable
 * without mounting the page.
 *
 * ### Features:
 * - tokenized, case- and punctuation-insensitive AND matching
 * - synonym aliases so setting-level terms (cache, smtp, cron) find their page
 * - empty query matches everything (no filtering until the user types)
 */

/**
 * Extra terms a page title does not expose (e.g. "cache" lives inside
 * System Settings). Keyed by tile id.
 */
export const CONFIG_SEARCH_ALIASES: Record<string, string> = {
  settings: "cache smtp email database security 2fa languages license gdpr",
  tenants: "multi tenant workspaces workspace",
  designSystem: "theme colors density rtl appearance",
  monitor: "audit health logs uptime status",
  collectionbuilder: "schema content model fields",
  accessManagement: "users roles permissions tokens api keys",
  extensions: "plugins widgets themes marketplace",
  automations: "triggers events rules",
  workflows: "review publish stages",
  queue: "jobs cron retry failed background",
  sync: "import export migration wordpress strapi directus",
  apiPlayground: "rest graphql openapi sdk developer",
  dashboard: "metrics statistics activity",
  emailPreviews: "mail templates transactional",
  webhooks: "http callbacks events",
  redirects: "301 302 seo rules",
  trash: "restore deleted archive recycle",
};

/** Searchable projection of a config tile. */
export interface ConfigSearchEntry {
  id: string;
  /** Catalog label (English fallback). */
  label: string;
  /** Localized tile label, when available. */
  displayLabel?: string;
  /** Permission display name. */
  name?: string;
  /** Permission description. */
  description?: string;
}

/** Fold case and punctuation so "System-Settings" and "system settings" agree. */
function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Normalize a query into tokens (empty query → no tokens). */
export function tokenizeConfigQuery(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(/\s+/) : [];
}

/** True when every token appears in the entry's title/key/description/aliases. */
export function matchesConfigQuery(entry: ConfigSearchEntry, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;

  const haystack = normalizeSearchText(
    [
      entry.displayLabel ?? "",
      entry.label,
      entry.id,
      entry.name ?? "",
      entry.description ?? "",
      CONFIG_SEARCH_ALIASES[entry.id] ?? "",
    ].join(" "),
  );

  return tokens.every((token) => haystack.includes(token));
}
