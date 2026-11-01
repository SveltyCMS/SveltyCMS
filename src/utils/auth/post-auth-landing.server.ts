/**
 * @file src/utils/auth/post-auth-landing.server.ts
 * @description Server-side landing resolution: the one place that turns an
 * authenticated `User` into the path they are redirected to.
 *
 * `resolvePostAuthLandingPath` (./post-auth-landing) is the pure rule; this
 * wrapper supplies its inputs from the SAME sources the builder page guard uses
 * (`config/collectionbuilder/+page.server.ts`: `hasCollectionBuilderPermission(user,
 * locals.roles, locals.isAdmin)`). Before it existed every auth path assembled
 * the input itself and they drifted: password login looked at the caller's role
 * flags while 2FA, passkey and sign-up passed only `role` + `isAdmin`, so a
 * custom role granted `config:collectionbuilder` was sent to the dashboard by
 * those paths and the builder by the password path.
 */
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";
import { isAdmin as isAdminRole } from "@src/databases/auth/constants";
import type { Role, User } from "@src/databases/auth/types";
import { resolvePostAuthLandingPath } from "./post-auth-landing";

export interface PostAuthLandingContext {
  /** `event.locals.roles` — the role rows the page guards resolve too. */
  roles?: readonly Role[] | null;
  /** `event.locals.isAdmin` — the hook's admin flag, when already computed. */
  isAdmin?: boolean;
  /** Deepest usable collection page, e.g. `getCachedFirstCollectionPath()`. */
  firstCollectionPath?: string | null;
}

/** Minimal caller shape — accepts a full `User` as well as a partial stub. */
export type PostAuthLandingUser =
  | (Partial<User> & { role?: string | null; isAdmin?: boolean | number | string })
  | null
  | undefined;

/**
 * Landing path for an authenticated user. Capability is computed exactly like
 * the builder guard's, so the landing can never point at a page whose load
 * throws 403 for the same caller.
 */
export function resolveUserPostAuthLanding(
  user: PostAuthLandingUser,
  context: PostAuthLandingContext = {},
): string {
  const roles = (context.roles ?? []) as Role[];
  const isAdminUser = context.isAdmin === true || isAdminRole(user);
  return resolvePostAuthLandingPath({
    role: user?.role ?? null,
    isAdmin: isAdminUser,
    canBuildCollections: hasCollectionBuilderPermission(
      user as User | null | undefined,
      roles,
      isAdminUser,
    ),
    firstCollectionPath: context.firstCollectionPath ?? null,
  });
}
