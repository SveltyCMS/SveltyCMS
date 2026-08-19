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

export type PublicationFilter = "published" | "draft" | "all";

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
    actor?.user?.role === "admin" ||
    actor?.user?.role === "editor" ||
    actor?.user?.isAdmin === true;

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
