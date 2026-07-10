/**
 * @file src/routes/(site)/+layout.server.ts
 * @description Shared server data for the optional SvelteKit site starter.
 */

import { getPublicSettingSync } from "@src/services/core/settings-service";
import { isSiteStarterEnabled } from "@src/services/site/site-config.server";
import { previewService } from "@src/services/content/preview-service";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ url, cookies }) => {
  if (!isSiteStarterEnabled()) {
    return { siteStarterEnabled: false };
  }

  const previewToken = url.searchParams.get("preview_token");
  const draftCookie = cookies.get("cms_draft_mode") === "true";
  let isDraft = draftCookie;
  let previewEntryId: string | undefined = cookies.get("cms_preview_entry");

  if (previewToken) {
    const validated = previewService.validateToken(previewToken);
    isDraft = validated.valid;
    if (validated.valid) previewEntryId = validated.entryId;
  }

  const contentLanguage =
    url.searchParams.get("lang") || getPublicSettingSync("DEFAULT_CONTENT_LANGUAGE") || "en";

  return {
    siteStarterEnabled: true,
    siteName: getPublicSettingSync("SITE_NAME") || "SveltyCMS",
    isPreview: !!previewToken || draftCookie,
    isDraft,
    contentLanguage,
    previewEntryId,
  };
};
