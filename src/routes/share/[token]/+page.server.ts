/**
 * @file src/routes/share/[token]/+page.server.ts
 * @description Server load function for public media download pages.
 */

import { error } from "@sveltejs/kit";
import { LocalCMS } from "@src/services/sdk";
import { getDbSafe } from "@src/databases/db";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, url }) => {
  const { token } = params;
  const mediaId = url.searchParams.get("id");

  if (!token || !mediaId) {
    throw error(404, "Invalid share link request. Missing token or media ID.");
  }

  const dbAdapter = await getDbSafe();
  const cms = new LocalCMS(dbAdapter);

  // We load the media item globally (no specific tenant constraint or fallback to the base database)
  const result = await cms.media.findById(mediaId, { prefix: undefined });
  if (!result.success || !result.data) {
    throw error(404, "Shared asset not found.");
  }

  const mediaItem = result.data as any;
  const sharedLinks = mediaItem.metadata?.sharedLinks || [];
  const link = sharedLinks.find((l: any) => l.token === token);

  if (!link) {
    throw error(404, "This share link does not exist.");
  }

  // Check expiration
  if (link.expiry && new Date() > new Date(link.expiry)) {
    throw error(410, "This share link has expired.");
  }

  return {
    token,
    mediaId,
    filename: mediaItem.filename,
    size: mediaItem.size,
    type: mediaItem.type,
    mimeType: mediaItem.mimeType,
    url: mediaItem.url,
    passwordRequired: !!link.passwordHash,
  };
};
