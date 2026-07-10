/**
 * @file src/routes/api/preview/authorize/+server.ts
 * @description Generates signed live preview URLs for the editable-website plugin.
 */

import { previewService } from "@src/services/content/preview-service";
import type { CollectionEntry, Schema } from "@src/content/types";
import { requireEditableWebsiteLicense } from "@src/plugins/editable-website/license-gate.server";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || (user as { isAnonymous?: boolean }).isAnonymous) {
    throw error(401, "Authentication required for preview authorization");
  }

  await requireEditableWebsiteLicense();

  let body: {
    schema?: Schema;
    entry?: CollectionEntry;
    contentLanguage?: string;
    tenantId?: string | null;
    previewTargetUrl?: string;
  };

  try {
    body = await request.json();
  } catch {
    throw error(400, "Invalid JSON body");
  }

  const { schema, entry, contentLanguage = "en", tenantId, previewTargetUrl } = body;
  if (!schema || !entry) {
    throw error(400, "schema and entry are required");
  }

  const previewUrl = previewService.generatePreviewUrl(
    schema,
    entry,
    contentLanguage,
    tenantId ?? locals.tenantId,
    String(user._id),
    previewTargetUrl,
  );

  if (!previewUrl) {
    throw error(503, "Preview unavailable — configure PREVIEW_SECRET in system settings");
  }

  return json({ previewUrl });
};
