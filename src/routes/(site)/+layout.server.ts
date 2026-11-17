/**
 * @file src/routes/(site)/+layout.server.ts
 * @description Shared server data for the optional SvelteKit site starter.
 */

import { getPublicSettingSync } from "@src/services/core/settings-service";
import { isSiteStarterEnabled } from "@src/services/site/site-config.server";
import { previewService } from "@src/services/content/preview-service";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ url, cookies, locals }) => {
  if (!isSiteStarterEnabled()) {
    return { siteStarterEnabled: false };
  }

  // Draft preview mode must be backed by a valid HMAC-signed preview_token
  // (from query or HttpOnly cms_preview_token cookie). Never honor the
  // unsigned cms_draft_mode=true / cms_preview_entry cookies on their own.
  const candidateToken =
    url.searchParams.get("preview_token") || cookies.get("cms_preview_token") || "";
  const validated = candidateToken ? previewService.validateToken(candidateToken) : null;
  const isDraft = Boolean(validated?.valid);
  const previewEntryId: string | undefined = validated?.valid ? validated.entryId : undefined;

  const contentLanguage =
    url.searchParams.get("lang") || getPublicSettingSync("DEFAULT_CONTENT_LANGUAGE") || "en";

  return {
    siteStarterEnabled: true,
    siteName: getPublicSettingSync("SITE_NAME") || "SveltyCMS",
    isPreview: isDraft,
    isDraft,
    contentLanguage,
    previewEntryId,
    signedIn: Boolean(locals.user && !(locals.user as { isAnonymous?: boolean }).isAnonymous),
  };
};
