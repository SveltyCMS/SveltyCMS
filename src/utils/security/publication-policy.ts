/**
 * @file src/utils/security/publication-policy.ts
 * @description Centralized publication visibility policy for content queries.
 *
 * Rules:
 * - Privileged actors (system, admin, editor, or isAdmin: true) can access
 *   any publication state (published, draft, all) as requested (defaulting to "all").
 * - Unprivileged / public visitors are strictly clamped to "published" status.
 *   Even if an unprivileged visitor explicitly passes publicationFilter="all" or "draft",
 *   the policy forces "published" to eliminate draft leaks.
 */

import { isAdmin } from "@src/databases/auth/constants";

export type PublicationFilter = "published" | "draft" | "all";

/**
 * Every status value that counts as *published*.
 *
 * The canonical writer (`applyPublicationToQuery`, `toggleEntryStatus`,
 * `StatusTypes.publish`) stores `"publish"`; the Smart-Importer's WordPress
 * mapper stores `"published"`. Both are accepted here so the read clamp and
 * the query filter cannot disagree about what a published row looks like.
 */
export const PUBLISHED_STATUS_LIST: readonly string[] = ["publish", "published"];
export const PUBLISHED_STATUS_VALUES: ReadonlySet<string> = new Set(PUBLISHED_STATUS_LIST);

/** True when a row's `status` means "published". */
export function isPublishedStatus(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const status = (row as { status?: unknown }).status;
  return typeof status === "string" && PUBLISHED_STATUS_VALUES.has(status);
}

export interface ActorContext {
  user?: {
    _id?: string;
    role?: string;
    isAdmin?: boolean;
    permissions?: string[];
  } | null;
  system?: boolean;
}

/**
 * Resolves the effective publication filter based on caller privilege.
 *
 * @param actor - The user/system context executing the query
 * @param requested - The publication filter requested by the client (optional)
 * @returns "published" | "draft" | "all"
 */
export function resolvePublicationFilter(
  actor?: ActorContext | null,
  requested?: string | null,
): PublicationFilter {
  const isPrivileged =
    actor?.system === true ||
    isAdmin(actor?.user) ||
    (Array.isArray(actor?.user?.permissions) &&
      (actor.user.permissions.includes("content:read_drafts") ||
        actor.user.permissions.includes("collections:read_drafts") ||
        actor.user.permissions.includes("admin")));

  if (isPrivileged) {
    if (requested === "published" || requested === "draft" || requested === "all") {
      return requested;
    }
    return "all";
  }

  // Unprivileged / anonymous visitors are unconditionally clamped to "published"
  return "published";
}

/**
 * Push the resolved publication filter into a DB query so unpublished rows
 * never leave the adapter when the caller is clamped to published/draft.
 * `"all"` leaves the query unchanged.
 */
export function applyPublicationToQuery<T extends Record<string, unknown>>(
  query: T,
  filter: PublicationFilter,
): T {
  if (filter === "published") {
    (query as Record<string, unknown>).status = "publish";
  } else if (filter === "draft") {
    (query as Record<string, unknown>).status = { $in: ["draft", "unpublish"] };
  }
  return query;
}

/** Precomputed suffixes so the hot path never allocates a template string. */
const PUBLICATION_CACHE_SUFFIXES: Partial<Record<PublicationFilter, string>> = {
  all: "",
  published: ":published",
  draft: ":draft",
};

/**
 * Cache-key suffix for a publication filter.
 * `"all"` is unconstrained (same query as pre-policy keys) so it MUST stay
 * suffix-free — otherwise every privileged findById fragments the L1 keyspace
 * and 10k-id random reads thrash a 2k LRU. Published/draft keep a suffix so
 * a cached "all" document can never be served to a clamped caller.
 */
export function publicationCacheSuffix(filter: PublicationFilter): string {
  // Precomputed lookup avoids a per-call template-string allocation on the
  // published/draft hot path; the fallback keeps out-of-type inputs identical.
  return PUBLICATION_CACHE_SUFFIXES[filter] ?? `:${filter}`;
}
