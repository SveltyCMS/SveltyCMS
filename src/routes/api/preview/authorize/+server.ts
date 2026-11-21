/**
 * @file src/routes/api/preview/authorize/+server.ts
 * @description Generates signed live preview URLs for the editable-website plugin.
 */

import { previewService } from "@src/services/content/preview-service";
import type { CollectionEntry, Schema } from "@src/content/types";
import { requireEditableWebsiteLicense } from "@src/plugins/editable-website/license-gate.server";
import { json } from "@sveltejs/kit";
import { handleApiError, raise } from "@utils/error-handling";
import type { RequestHandler } from "./$types";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import { isAdmin, isSecureCookieContext } from "@src/databases/auth/constants";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { getPublicSettingSync } from "@src/services/core/settings-service";

function validatePreviewTargetOrigin(
  previewTargetUrl: string | undefined,
  requestOrigin: string,
): string | undefined {
  if (!previewTargetUrl) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(previewTargetUrl, requestOrigin);
  } catch {
    raise(400, "Invalid previewTargetUrl");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    raise(400, "Invalid previewTargetUrl protocol");
  }
  if (parsed.origin === requestOrigin) return previewTargetUrl;

  const allowedOrigins = new Set<string>([requestOrigin]);
  const configuredProd = getPublicSettingSync("HOST_PROD") || process.env.PUBLIC_SITE_URL;
  const configuredDev = getPublicSettingSync("HOST_DEV");
  for (const candidate of [configuredProd, configuredDev]) {
    if (typeof candidate === "string" && candidate.trim()) {
      try {
        allowedOrigins.add(new URL(candidate.trim()).origin);
      } catch {
        /* ignore malformed setting */
      }
    }
  }
  if (!allowedOrigins.has(parsed.origin)) {
    raise(403, "previewTargetUrl origin is not in the allowed preview origins");
  }
  return previewTargetUrl;
}

export const POST: RequestHandler = async (event) => {
  const { request, locals, cookies, url } = event;
  try {
    const isSecure = isSecureCookieContext(url.protocol, url.hostname);
    const csrfResult = validateCsrfForRequest(cookies, request, isSecure);
    if (!csrfResult.isValid) {
      raise(403, `Security violation: ${csrfResult.error}`);
    }

    const user = locals.user;
    if (!user || (user as { isAnonymous?: boolean }).isAnonymous) {
      raise(401, "Authentication required for preview authorization");
    }

    const roles = locals.roles || [];
    const canReadContent =
      locals.isAdmin === true ||
      isAdmin(user) ||
      hasPermissionWithRoles(user, "collections:read", roles) ||
      hasPermissionWithRoles(user, "collection:read", roles);
    if (!canReadContent) {
      raise(403, "Insufficient permissions for preview authorization");
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
      raise(400, "Invalid JSON body");
    }

    const { schema, entry, contentLanguage = "en", tenantId, previewTargetUrl } = body;
    if (!schema || !entry) {
      raise(400, "schema and entry are required");
    }

    // Never allow a tenant-scoped caller to forge preview tokens for another tenant.
    if (
      tenantId &&
      locals.tenantId &&
      tenantId !== locals.tenantId &&
      !(locals.isAdmin === true && locals.tenantId === "global")
    ) {
      raise(403, "Access denied: cross-tenant preview authorization is not allowed");
    }
    const effectiveTenantId = locals.tenantId ?? null;
    const safeTargetUrl = validatePreviewTargetOrigin(previewTargetUrl, url.origin);

    const previewUrl = previewService.generatePreviewUrl(
      schema,
      entry,
      contentLanguage,
      effectiveTenantId,
      String(user._id),
      safeTargetUrl,
    );

    if (!previewUrl) {
      raise(503, "Preview unavailable — configure PREVIEW_SECRET in system settings");
    }

    return json({ previewUrl });
  } catch (err) {
    return handleApiError(err, event);
  }
};
