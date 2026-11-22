/**
 * @file src/utils/media/media-access.ts
 * @description Access decision for the `/files/**` serving route.
 *
 * The media record carries `access: "public" | "private" | "protected"`. Before this
 * module the route never read it: authorization was the tenant path prefix plus the
 * opt-in signed-URL check, so a `private` asset was protected only by content-hash
 * unguessability. `decideMediaAccess()` is the pure decision the route applies when
 * `MEDIA_ENFORCE_PRIVATE_ACCESS` is enabled.
 *
 * Features:
 * - Pure (no IO) so the decision table is unit-testable without storage or a DB
 * - `public` and legacy `undefined` stay open (a missing row is not a privacy claim)
 * - `private` / `protected` require an owning tenant, a system admin, or a signed URL
 * - Signed URL wins first: it is already HMAC-bound to the exact path and tenant
 */

export type MediaAccessValue = "public" | "private" | "protected" | undefined;

export interface MediaAccessSubject {
  /** Stored `access` value; `undefined` for legacy rows or a missing lookup. */
  access: MediaAccessValue;
  /** The request carries an authenticated session. */
  authenticated: boolean;
  /** Authenticated caller's tenant (`locals.tenantId`). */
  callerTenantId?: string | null;
  /** Tenant segment of the requested path (`{tenant}/{hash}/original/<file>`). */
  pathTenant: string;
  /** Caller is a system admin. */
  isAdmin?: boolean;
  /** A valid signed URL was presented for this exact path. */
  signedUrlValid?: boolean;
}

export type MediaAccessReason =
  | "signed-url"
  | "public"
  | "legacy-unmarked"
  | "admin"
  | "owner-tenant"
  | "auth-required"
  | "tenant-mismatch";

export interface MediaAccessDecision {
  allowed: boolean;
  reason: MediaAccessReason;
}

/** A missing/legacy value is not a privacy claim — treat it as public. */
function restricts(access: MediaAccessValue): boolean {
  return access === "private" || access === "protected";
}

export function decideMediaAccess(subject: MediaAccessSubject): MediaAccessDecision {
  if (subject.signedUrlValid) return { allowed: true, reason: "signed-url" };

  if (subject.access === undefined) return { allowed: true, reason: "legacy-unmarked" };
  if (!restricts(subject.access)) return { allowed: true, reason: "public" };

  if (!subject.authenticated) return { allowed: false, reason: "auth-required" };
  if (subject.isAdmin === true) return { allowed: true, reason: "admin" };

  const caller = subject.callerTenantId ?? null;
  if (caller !== null && caller === subject.pathTenant) {
    return { allowed: true, reason: "owner-tenant" };
  }

  // `global` is the shared scope: an ordinary user row that carries it does not
  // read every tenant's private files (see the `/files` tenant gate).
  return { allowed: false, reason: "tenant-mismatch" };
}
