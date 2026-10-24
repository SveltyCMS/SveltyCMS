/**
 * @file src/routes/share/[token]/+page.server.ts
 * @description Server load function for public media download pages.
 *
 * ### Tenant decision
 * A share URL (`/share/<token>?id=<mediaId>`) is opened by anonymous visitors
 * and carries no tenant of its own. The unguessable token (plus the optional
 * per-link password) is the capability, so the media lookup itself must not be
 * tenant-filtered — scoping it to a host-resolved tenant hid links that were
 * minted in another tenant, and multi-tenant installs never resolve a tenant
 * for a bare domain (`getTenantIdFromHostname` → `null`).
 *
 * The read therefore runs under a branded system scope, and isolation is
 * enforced explicitly afterwards: when the request *does* resolve a tenant and
 * the asset belongs to a *different* tenant, the link is rejected as 404.
 */

import { getDbSafe } from "@src/databases/db";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { isAppError, raise, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import type { DatabaseId } from "@src/content/types";
import type { BaseEntity, CmsMediaMetadata } from "@src/databases/db-interface";
import type { PageServerLoad } from "./$types";

/**
 * A share entry as persisted under `media.metadata.sharedLinks`.
 * `expiry` is the legacy field name still written by older links/seeds.
 */
interface SharedLink {
  active?: boolean;
  expiresAt?: string | null;
  expiry?: string | null;
  passwordHash?: string;
  token: string;
}

/** Only the media fields this page renders — the adapter row is wider. */
interface SharedMediaRecord extends BaseEntity {
  filename: string;
  metadata?: CmsMediaMetadata;
  mimeType: string;
  size: number;
  type?: string;
  url?: string;
}

function isSharedLink(value: unknown): value is SharedLink {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { token?: unknown }).token === "string"
  );
}

function readSharedLinks(metadata: CmsMediaMetadata | undefined): SharedLink[] {
  const links = metadata?.sharedLinks;
  return Array.isArray(links) ? links.filter(isSharedLink) : [];
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const { token } = params;
  const mediaId = url.searchParams.get("id");

  try {
    if (!token || !mediaId) {
      raise(404, "Invalid share link request. Missing token or media ID.");
    }

    const dbAdapter = await getDbSafe();
    // "bootstrap" is the closest closed-union system-scope reason for an
    // anonymous, token-authorized read. The scope is minted here — it is never
    // derived from request input — and the cross-tenant check below keeps it
    // from widening access across tenant boundaries.
    const result = await dbAdapter.crud.findOne<SharedMediaRecord>(
      "media",
      { _id: mediaId as DatabaseId },
      withSystemScope("bootstrap"),
    );

    if (!result.success || !result.data) {
      raise(404, "Shared asset not found.");
    }

    const mediaItem = result.data;
    const requestTenantId = locals.tenantId ?? null;
    const mediaTenantId = mediaItem.tenantId ?? null;
    if (requestTenantId && mediaTenantId && requestTenantId !== mediaTenantId) {
      logger.warn("[Share] Cross-tenant share link rejected", {
        mediaId,
        mediaTenantId,
        requestTenantId,
      });
      raise(404, "Shared asset not found.");
    }

    const link = readSharedLinks(mediaItem.metadata).find((candidate) => candidate.token === token);
    if (!link) {
      raise(404, "This share link does not exist.");
    }
    if (link.active === false) {
      raise(404, "This share link has been revoked.");
    }

    // Links created through `POST /api/media/share` store `expiresAt`; older
    // seeds/links used `expiry`. A missing/unparseable value is treated as
    // "no expiry", matching `validateLink` on the download endpoint.
    const expiresAt = link.expiresAt ?? link.expiry;
    const expiryMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    if (Number.isFinite(expiryMs) && Date.now() > expiryMs) {
      raise(410, "This share link has expired.");
    }

    return {
      token,
      mediaId,
      filename: mediaItem.filename,
      size: mediaItem.size,
      type: mediaItem.type,
      mimeType: mediaItem.mimeType,
      url: mediaItem.url,
      passwordRequired: Boolean(link.passwordHash),
    };
  } catch (err) {
    rethrow(err);
    if (isAppError(err)) throw err;
    logger.error("[Share] Failed to load shared media", err);
    raise(500, "Failed to load shared media.");
  }
};
