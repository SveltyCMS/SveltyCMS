/**
 * @file src/utils/auth/post-auth-landing.ts
 * @description Where a caller lands after an authentication flow (password login,
 * 2FA, passkey, OAuth, invited sign-up).
 *
 * `/config/collectionbuilder` is guarded by `hasCollectionBuilderPermission`
 * (collectionbuilder/+page.server.ts throws `error(403)` otherwise) while every
 * other authenticated page — the dashboard — only needs a session. Every auth
 * path used to return the builder unconditionally, so an invited user whose
 * invite token carried a non-builder role was created, logged in, and then shown
 * a 403 page. Landing resolution lives here so all of those paths share one rule.
 */

export const DEFAULT_AUTH_LANDING_PATH = "/dashboard";
export const COLLECTION_BUILDER_PATH = "/config/collectionbuilder";

/** Roles that always carry the collection-builder capability. */
const BUILDER_ROLES = new Set(["admin", "developer"]);

export interface PostAuthLandingInput {
  role?: string | null;
  isAdmin?: boolean;
  /** `hasCollectionBuilderPermission(user, roles, isAdmin)` when the caller knows it. */
  canBuildCollections?: boolean;
  /** Deepest usable page for the caller, e.g. `getCachedFirstCollectionPath()`. */
  firstCollectionPath?: string | null;
}

/** Same-origin, absolute path only — never `//host` or `https://host`. */
function isSafeLocalPath(path: string | null | undefined): path is string {
  if (!path) return false;
  const trimmed = path.trim();
  return trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\");
}

/** True when the caller may open `/config/collectionbuilder` without a 403. */
export function canOpenCollectionBuilder(input: PostAuthLandingInput): boolean {
  const role = (input.role ?? "").trim().toLowerCase();
  return input.isAdmin === true || input.canBuildCollections === true || BUILDER_ROLES.has(role);
}

/**
 * Landing path for the caller after a successful authentication.
 * Builder-capable callers keep the old behaviour (first collection, else the
 * builder); everyone else lands on the dashboard.
 */
export function resolvePostAuthLandingPath(input: PostAuthLandingInput): string {
  if (!canOpenCollectionBuilder(input)) return DEFAULT_AUTH_LANDING_PATH;
  return isSafeLocalPath(input.firstCollectionPath)
    ? input.firstCollectionPath.trim()
    : COLLECTION_BUILDER_PATH;
}
