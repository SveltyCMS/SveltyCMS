/**
 * @file src/routes/api/[...path]/handlers/media.ts
 * @description High-performance, stream-isolated Enterprise Media Management API endpoint routing.
 */

import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import mime from "mime-types";
import { AppError, rethrow } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";
import { getPrivateEnv } from "@src/databases/db";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { isMultiTenantEnabled } from "@utils/tenant";
import { createLink, validateLink, revoke, extend, type ShareLink } from "@src/utils/media/sharing";
import { createBulkArchive, streamArchive, cleanupArchive } from "@src/utils/media/bulk-download";
import { analyze, insights, trends, quota } from "@src/utils/media/storage-analytics";
import { formatBytes } from "@utils/utils";
import { compareVersions, createVersion, getVersionStats } from "@src/utils/media/version-history";
import { parseMultipartStream } from "@utils/media/streaming-upload";
import { advancedSearch, type SearchCriteria } from "@utils/media/advanced-search";
import type { MediaItem } from "@utils/media/media-models";

// ─── Helpers ──────────────────────────────────────────────────────────────

function hasMediaPermission(event: RequestEvent, user: unknown, permission: string): boolean {
  if (event.locals.isAdmin) return true;
  return !!user && hasPermissionWithRoles(user as any, permission, event.locals.roles || []);
}

function isFileLike(value: unknown): value is File {
  return (
    value != null &&
    typeof value === "object" &&
    "arrayBuffer" in value &&
    typeof (value as any).arrayBuffer === "function" &&
    "name" in value
  );
}

/**
 * 🛡️ PUBLISH-STATE GATE: Prevents mutation of media assets referenced by published content.
 * Queries the MediaService to check if this media ID is referenced in any published entry.
 * Throws AppError(409) with details if the media is currently in use by published content.
 */
async function checkMediaNotReferencedByPublishedContent(
  cms: LocalCMS,
  mediaId: string,
  tenantId: DatabaseId,
): Promise<void> {
  // Fast path: if no mediaId, skip check (let downstream handler error with 400)
  if (!mediaId) return;

  let publishedRefs: any[] = [];

  // Use getPublishedReferences if available on the SDK namespace
  if (typeof cms.media.getPublishedReferences === "function") {
    publishedRefs = await cms.media.getPublishedReferences(mediaId, {
      tenantId,
    });
  } else {
    // Fallback: use standard references and filter for published status
    const result = await cms.media.references(mediaId, { tenantId });
    if (result.success && Array.isArray(result.data)) {
      publishedRefs = result.data.filter((r: any) => r.status === "publish");
    }
  }

  if (publishedRefs.length > 0) {
    const detailSummary = publishedRefs
      .slice(0, 3)
      .map((r: any) => `"${r.entryName}" in "${r.collectionName}" (${r.fieldName})`)
      .join(", ");
    const remainder = publishedRefs.length > 3 ? ` and ${publishedRefs.length - 3} more` : "";
    throw new AppError(
      `Cannot modify asset: referenced by published content - ${detailSummary}${remainder}`,
      409,
      "MEDIA_REFERENCED_BY_PUBLISHED_CONTENT",
    );
  }
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

export async function handleMediaRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;
  const method = segments[1];

  // Public share endpoints are token-gated and may run without tenant locals.
  // All other media operations require tenant isolation when multi-tenant is on.
  const isSharePath = method === "share";
  if (!isSharePath && isMultiTenantEnabled() && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  try {
    switch (request.method) {
      case "GET":
        return await handleGetRoutes(event, cms, tenantId, user, method, url, segments);
      case "POST":
        return await handlePostRoutes(event, cms, tenantId, user, method, segments);
      case "PATCH":
        if (method === "share")
          return await handleMediaShareExtend(event, cms, tenantId, user, segments);
        if (!method) return successResponse(event, null);
        return rawResponse(
          event,
          await cms.media.update(method, await request.json(), { tenantId }),
        );
      case "DELETE":
        return await handleDeleteRoutes(event, cms, tenantId, user, method, segments);
      default:
        throw new AppError(`HTTP method ${request.method} not allowed`, 405, "METHOD_NOT_ALLOWED");
    }
  } catch (err: any) {
    rethrow(err);
    // Expected client/auth errors should not spam stderr as "MediaRoute Error"
    if (err instanceof AppError) throw err;
    console.error(`[MediaRoute Error] ${segments.join("/")}:`, err);
    throw new AppError(err.message || "Media route handler transaction failed", 500);
  }
}

// ─── HTTP Method Routers ─────────────────────────────────────────────────────

async function handleGetRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _user: any,
  method: string | undefined,
  url: URL,
  segments: string[],
) {
  switch (method) {
    case "exists":
      return handleMediaExists(event, cms, tenantId);
    case "references":
      return handleMediaReferences(event, cms, tenantId, segments);
    case "share":
      return handleMediaShareDownload(event, cms, tenantId);
    case "analytics":
      return handleMediaAnalytics(event, cms, tenantId);
    case "bulk-download":
      return handleMediaBulkDownload(event, cms, tenantId);
    case "search":
      return handleMediaSearch(event, cms, tenantId, url);
  }

  if (method === "version" && segments[2]) {
    if (segments[3] === "list") return handleMediaVersionList(event, cms, tenantId, segments);
    if (segments[3] === "compare") return handleMediaVersionCompare(event, cms, tenantId, segments);
  }

  if (!method || method === "list") {
    return handleMediaList(event, cms, tenantId, url);
  }

  return successResponse(
    event,
    await cms.media.findById(method, {
      tenantId,
      prefix: url.searchParams.get("prefix") || undefined,
    }),
  );
}

async function handlePostRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  method: string | undefined,
  segments: string[],
) {
  if (!method || method === "upload") return handleMediaUpload(event, cms, tenantId, user);
  if (method === "process") return handleMediaProcess(event, cms, tenantId, user);
  if (method === "remote") return handleMediaRemote(event, cms, tenantId, user);
  if (method === "trash" || method === "delete") return handleMediaPostDelete(event, cms, tenantId);
  if (method === "manipulate" || method === "edit")
    return handleMediaManipulate(event, cms, tenantId, user, segments);
  if (method === "bulk-download") return handleMediaBulkDownload(event, cms, tenantId);
  if (method === "share") return handleMediaShareCreate(event, cms, tenantId, user, segments);
  if (method === "stream") return handleMediaStreamUpload(event, cms, tenantId, user);
  if (method === "move") return handleMediaMove(event, cms, tenantId, user);
  if (method === "version") {
    if (segments[3] === "restore")
      return handleMediaVersionRestore(event, cms, tenantId, user, segments);
    if (segments[3] === "upload")
      return handleMediaVersionUpload(event, cms, tenantId, user, segments);
    return handleMediaVersionCreate(event, cms, tenantId, user, segments);
  }
  throw new AppError(`Unknown POST target operation: ${method}`, 404);
}

async function handleDeleteRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  method: string | undefined,
  segments: string[],
) {
  if (method === "share") return handleMediaShareRevoke(event, cms, tenantId, user, segments);
  if (method === "delete" || method === "trash") return handleMediaPostDelete(event, cms, tenantId);
  if (method) {
    if (!hasMediaPermission(event, user, "media:delete")) {
      throw new AppError("Insufficient access for asset deletion", 403, "FORBIDDEN");
    }
    // Fast 404 before expensive published-reference scan (integration OOM root cause)
    const existing = await cms.media.findById(method, { tenantId });
    if (!existing.success || !existing.data) {
      throw new AppError("Media not found", 404, "NOT_FOUND");
    }
    // 🛡️ PUBLISH-STATE GATE: Block deletion of assets referenced by published content
    await checkMediaNotReferencedByPublishedContent(cms, method, tenantId);
    const deleted = await cms.media.delete(method, { tenantId });
    if (!deleted.success) {
      throw new AppError(deleted.message || "Failed to delete media", 400, "DELETE_FAILED");
    }
    return successResponse(event, { deleted: true, id: method });
  }
  return successResponse(event, null);
}

// ─── Route Implementations ──────────────────────────────────────────────────

export async function handleMediaExists(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  const urlParam = event.url.searchParams.get("url");
  if (!urlParam) throw new AppError("URL parameter required", 400);
  return rawResponse(event, {
    exists: await cms.media.exists(urlParam, tenantId),
  });
}

export async function handleMediaList(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  url: URL,
) {
  return rawResponse(
    event,
    await cms.media.find({
      tenantId,
      limit: Number(url.searchParams.get("limit")) || 100,
      folderId: url.searchParams.get("folderId") || undefined,
      recursive: url.searchParams.get("recursive") === "true",
      prefix: url.searchParams.get("prefix") || undefined,
    }),
  );
}

/**
 * Move media assets into a virtual folder (or media root).
 * POST /api/media/move
 * Body: { fileIds: string[], targetFolderId?: string | null }
 *
 * Virtual move only — updates folderId; does not relocate storage blobs.
 */
export async function handleMediaMove(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  if (!hasMediaPermission(event, user, "media:write")) {
    throw new AppError("Insufficient permissions for media move", 403, "FORBIDDEN");
  }

  let body: { fileIds?: unknown; targetFolderId?: unknown };
  try {
    body = await event.request.json();
  } catch {
    throw new AppError("Invalid JSON body", 400);
  }

  const rawIds = body?.fileIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw new AppError("fileIds must be a non-empty array", 400);
  }

  const fileIds = [
    ...new Set(rawIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)),
  ];
  if (fileIds.length === 0) {
    throw new AppError("fileIds must contain valid media IDs", 400);
  }

  // null / undefined / "" / "root" / "global" → media root (folderId = null)
  const rawTarget = body?.targetFolderId;
  let targetFolderId: string | null = null;
  if (typeof rawTarget === "string" && rawTarget.trim()) {
    const t = rawTarget.trim();
    if (t !== "root" && t !== "global") {
      targetFolderId = t;
    }
  }

  const result = await cms.media.move(fileIds, targetFolderId, { tenantId });
  if (!result.success) {
    throw (
      result.error ||
      new AppError(result.message || "Failed to move media", 500, "MEDIA_MOVE_FAILED")
    );
  }

  return successResponse(event, {
    movedCount: result.data?.movedCount ?? fileIds.length,
    fileIds,
    targetFolderId,
  });
}

export async function handleMediaReferences(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const mediaId = segments[2];
  if (!mediaId) throw new AppError("Media ID is required", 400);
  const result = await cms.media.references(mediaId, { tenantId });
  if (!result.success)
    throw result.error || new AppError(result.message || "Failed to scan references", 500);
  return successResponse(event, result.data);
}

export async function handleMediaUpload(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  if (!hasMediaPermission(event, user, "media:write")) {
    throw new AppError("Insufficient permissions for asset upload", 403, "FORBIDDEN");
  }

  const contentType = event.request.headers.get("content-type");
  if (!contentType?.includes("multipart/form-data")) {
    throw new AppError("Invalid payload wrapper context structure", 400);
  }

  const formData = await event.request.formData();
  const files = formData.getAll("files") as File[];
  const singleFile = formData.get("file");

  if (isFileLike(singleFile) && files.length === 0) files.push(singleFile);
  if (files.length === 0)
    throw new AppError("No valid file arrays found inside submission bundle", 400);

  const concurrency = getPrivateEnv()?.CONCURRENT_UPLOAD_SIZE || 2;
  const results: any[] = Array.from({ length: files.length });
  let nextIndex = 0;

  async function uploadWorker() {
    while (nextIndex < files.length) {
      const currentIndex = nextIndex++;
      const file = files[currentIndex];
      if (!isFileLike(file)) continue;

      try {
        const res = await cms.media.upload(file, {
          userId: user?._id || "system",
          tenantId,
        });
        results[currentIndex] = res.success
          ? { fileName: file.name, success: true, data: res.data }
          : { fileName: file.name, success: false, message: res.message };
      } catch (err: any) {
        // Preserve error code from AppError / Node.js filesystem errors
        const code =
          err instanceof AppError ? err.code : (err as NodeJS.ErrnoException)?.code || undefined;
        results[currentIndex] = {
          fileName: file.name,
          success: false,
          message: err.message,
          ...(code ? { code } : {}),
        };
      }
    }
  }

  // Launch N workers — each pulls the next file as it finishes (no chunk blocking)
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, uploadWorker);
  await Promise.all(workers);

  return successResponse(event, results.filter(Boolean));
}

export async function handleMediaProcess(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  const formData = await event.request.formData();
  const processType = formData.get("processType") as string;
  if (!processType) throw new AppError("Processing verification routing identifier expected", 400);

  if (
    ["metadata", "batch"].includes(processType) &&
    !hasMediaPermission(event, user, "media:write")
  ) {
    throw new AppError("Insufficient permissions for execution parameters", 403, "FORBIDDEN");
  }

  switch (processType) {
    case "metadata": {
      const file = formData.get("file");
      if (!isFileLike(file)) throw new AppError("Target asset source binary required", 400);
      return successResponse(event, await cms.media.getMetadata(file));
    }
    case "save":
      return handleMediaUpload(event, cms, tenantId, user);
    case "delete": {
      if (!hasMediaPermission(event, user, "media:delete")) {
        throw new AppError("Insufficient permissions for target deletion", 403, "FORBIDDEN");
      }
      const mediaId = formData.get("mediaId") as string;
      if (!mediaId) throw new AppError("Identifier expected", 400);
      await cms.media.delete(mediaId, { tenantId });
      return successResponse(event, null);
    }
    case "batch": {
      const mediaIdsRaw = formData.get("mediaIds") as string;
      const optionsRaw = formData.get("options") as string;
      if (!mediaIdsRaw) throw new AppError("Batch array target collection expected", 400);
      return successResponse(
        event,
        await cms.media.batchProcess(JSON.parse(mediaIdsRaw), {
          ...(optionsRaw ? JSON.parse(optionsRaw) : {}),
          userId: user?._id || "system",
          tenantId,
        }),
      );
    }
    default:
      throw new AppError(`Process key configuration matching '${processType}' unrecognized`, 404);
  }
}

export async function handleMediaRemote(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  if (!hasMediaPermission(event, user, "media:write")) {
    throw new AppError("Insufficient permissions for remote media ingestion", 403, "FORBIDDEN");
  }
  const body = await event.request.json().catch(() => ({}));
  const { url: remoteUrl, access } = body;
  if (!remoteUrl) throw new AppError("Remote tracking ingestion URL target required", 400);
  const result = await cms.media.remote(remoteUrl, {
    userId: user?._id || "system",
    access: access || "private",
    tenantId,
  });
  if (!result.success)
    throw result.error || new AppError(result.message || "Remote stream ingestion failed", 500);
  return successResponse(event, result.data);
}

export async function handleMediaPostDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const body = await event.request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const legacyUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!id && !legacyUrl) throw new AppError("Target asset identification criteria expected", 400);
  if (!event.locals.user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");

  if (!hasMediaPermission(event, event.locals.user, "media:delete")) {
    throw new AppError("Insufficient permissions for deletion execution block", 403, "FORBIDDEN");
  }

  let targetId = id;
  if (!targetId && legacyUrl) {
    const filter = cms.db.type === "mongodb" ? { url: legacyUrl } : { path: legacyUrl };
    const res = await cms.db.crud.findOne<any>("media", filter, { tenantId });
    if (!res.success || !res.data) throw new AppError("Target reference missing or scrubbed", 404);
    targetId = String(res.data._id);
  }

  // 🛡️ PUBLISH-STATE GATE: Block deletion of assets referenced by published content
  await checkMediaNotReferencedByPublishedContent(cms, targetId || id, tenantId);

  const result = await cms.media.delete(targetId, { tenantId });
  if (!result.success) throw result.error || new AppError(result.message || "Deletion failed", 500);
  return successResponse(event, { success: true });
}

export async function handleMediaManipulate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  segments: string[],
) {
  if (!hasMediaPermission(event, user, "media:write")) {
    throw new AppError("Insufficient structural operational context authority", 403, "FORBIDDEN");
  }

  const contentType = event.request.headers.get("content-type") || "";
  let id = segments[2];
  let body: any = {};

  if (contentType.includes("application/json")) {
    body = await event.request.json().catch(() => ({}));
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await event.request.formData();
    for (const [key, value] of formData.entries()) {
      try {
        body[key] = typeof value === "string" ? JSON.parse(value) : value;
      } catch {
        body[key] = value;
      }
    }
  }

  id = id || body.mediaId || body.id;
  if (!id) throw new AppError("Asset entity matrix identification value missing", 400);

  // 🛡️ PUBLISH-STATE GATE: Block manipulation of assets referenced by published content
  await checkMediaNotReferencedByPublishedContent(cms, id, tenantId);

  if (!body.manipulations || Object.keys(body.manipulations).length === 0) {
    throw new AppError("Manipulation instruction set is required", 400);
  }

  const result = await cms.media.manipulate(id, body.manipulations, {
    userId: user?._id || "system",
    tenantId,
  });
  if (!result.success) {
    if (result.error instanceof AppError) throw result.error;
    if (result.message === "Media not found") {
      throw new AppError("Media not found", 404, "MEDIA_NOT_FOUND");
    }
    throw new AppError(result.message || "Manipulation conversion framework fault", 500);
  }
  return successResponse(event, result.data);
}

export async function handleMediaVersionCreate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  segments: string[],
) {
  const mediaId = segments[2];
  if (!mediaId) throw new AppError("Media reference target identifier required", 400);

  // 🛡️ PUBLISH-STATE GATE: Block version creation for assets referenced by published content
  await checkMediaNotReferencedByPublishedContent(cms, mediaId, tenantId);

  const formData = await event.request.formData();
  const file = formData.get("file");
  if (!isFileLike(file))
    throw new AppError("Target payload matrix type must match binary File structure", 400);
  const reason = (formData.get("reason") as string) || undefined;

  // Hash the file content for version identity tracking
  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  // Count existing versions to determine next version number
  const existing = await cms.media.findById(mediaId, { tenantId });
  const versions =
    existing.success && existing.data ? (existing.data as any).metadata?.versions || [] : [];

  // Upload the new version via CMS adapter
  const result = await cms.media.uploadVersion(mediaId, file, {
    userId: user?._id || "system",
    tenantId,
  });
  if (!result.success)
    throw result.error || new AppError(result.message || "Version creation transaction fault", 500);

  // Build structured version metadata using createVersion utility
  const version = createVersion(
    mediaId as DatabaseId,
    user?._id || "system",
    "update",
    hash,
    file.size,
    [{ field: "content", type: "modify" }],
    { path: file.name, reason },
  );
  (version as any).versionNumber = versions.length + 1;

  return successResponse(event, { version, media: result.data });
}

export async function handleMediaVersionUpload(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  segments: string[],
) {
  const mediaId = segments[2];
  if (!mediaId) throw new AppError("Media reference target identifier required", 400);
  // 🛡️ PUBLISH-STATE GATE: Block version upload for assets referenced by published content
  await checkMediaNotReferencedByPublishedContent(cms, mediaId, tenantId);
  const formData = await event.request.formData();
  const file = formData.get("file");
  if (!isFileLike(file))
    throw new AppError("Target payload matrix type must match binary File structure", 400);
  const result = await cms.media.uploadVersion(mediaId, file, {
    userId: user?._id || "system",
    tenantId,
  });
  if (!result.success)
    throw (
      result.error || new AppError(result.message || "Pipeline variation write tracking fault", 500)
    );
  return successResponse(event, result.data);
}

export async function handleMediaVersionRestore(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  segments: string[],
) {
  const mediaId = segments[2];
  if (!mediaId) throw new AppError("Media reference target identifier required", 400);
  // 🛡️ PUBLISH-STATE GATE: Block version restore for assets referenced by published content
  await checkMediaNotReferencedByPublishedContent(cms, mediaId, tenantId);
  const { versionNumber } = await event.request.json().catch(() => ({}));
  if (!versionNumber) throw new AppError("Target variation index integer required", 400);
  const result = await cms.media.restoreVersion(mediaId, Number(versionNumber), {
    userId: user?._id || "system",
    tenantId,
  });
  if (!result.success)
    throw (
      result.error ||
      new AppError(result.message || "Pipeline revision activation transaction fault", 500)
    );
  return successResponse(event, result.data);
}

export async function handleMediaShareCreate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _user: any,
  segments: string[],
) {
  const mediaId = segments[2];
  if (!mediaId)
    throw new AppError("Media record targeted tracking location identifier required", 400);

  const { expiryHours, password } = await event.request.json().catch(() => ({}));
  const link = createLink(mediaId as DatabaseId, "system" as DatabaseId, {
    hours: expiryHours ? Number(expiryHours) : 24,
    passwordHash: password ? crypto.createHash("sha256").update(password).digest("hex") : undefined,
  });

  const mediaRes = await cms.media.findById(mediaId, { tenantId });
  if (!mediaRes.success || !mediaRes.data)
    throw new AppError("Target asset reference record missing", 404);

  const mediaItem = mediaRes.data as any;
  const newLink = {
    token: link.rawToken,
    tokenHash: link.token,
    expiresAt: link.expiresAt,
    passwordHash: link.passwordHash,
    downloadCount: 0,
    createdAt: link.createdAt,
    active: true,
  };

  await cms.media.update(
    mediaId,
    {
      metadata: {
        ...mediaItem.metadata,
        sharedLinks: [...(mediaItem.metadata?.sharedLinks || []), newLink],
      },
    },
    { tenantId },
  );

  return successResponse(event, {
    token: link.rawToken,
    expiresAt: link.expiresAt,
  });
}

export async function handleMediaShareDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const mediaId = segments[2];
  const token = segments[3];
  if (!mediaId || !token) throw new AppError("Asset matrix token validation paths mismatch", 400);

  const mediaRes = await cms.media.findById(mediaId, { tenantId });
  if (!mediaRes.success || !mediaRes.data) throw new AppError("Media item entry missing", 404);

  const item = mediaRes.data as any;
  const filtered = (item.metadata?.sharedLinks || []).filter((l: any) => l.token !== token);
  await cms.media.update(
    mediaId,
    { metadata: { ...item.metadata, sharedLinks: filtered } },
    { tenantId },
  );
  return successResponse(event, { success: true });
}

/** Revoke a share link (soft-deactivate) — DELETE /api/media/share/{mediaId}/{token} */
export async function handleMediaShareRevoke(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _user: any,
  segments: string[],
) {
  const mediaId = segments[2];
  const token = segments[3];
  if (!mediaId || !token) throw new AppError("Media identifier and share token required", 400);

  const mediaRes = await cms.media.findById(mediaId, { tenantId });
  if (!mediaRes.success || !mediaRes.data) throw new AppError("Media item not found", 404);

  const item = mediaRes.data as any;
  const links: ShareLink[] = item.metadata?.sharedLinks || [];
  const idx = links.findIndex((l) => l.token === token);
  if (idx === -1) throw new AppError("Share link not found", 404);

  revoke(links[idx]);
  await cms.media.update(
    mediaId,
    { metadata: { ...item.metadata, sharedLinks: links } },
    { tenantId },
  );

  return successResponse(event, { success: true });
}

/** Extend a share link expiry — PATCH /api/media/share/{mediaId}/{token} */
export async function handleMediaShareExtend(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _user: any,
  segments: string[],
) {
  const mediaId = segments[2];
  const token = segments[3];
  if (!mediaId || !token) throw new AppError("Media identifier and share token required", 400);

  const { expiryHours } = await event.request.json().catch(() => ({}));
  const hours = expiryHours ? Number(expiryHours) : 24;
  if (hours <= 0 || !Number.isFinite(hours))
    throw new AppError("Expiry hours must be a positive number", 400);

  const mediaRes = await cms.media.findById(mediaId, { tenantId });
  if (!mediaRes.success || !mediaRes.data) throw new AppError("Media item not found", 404);

  const item = mediaRes.data as any;
  const links: ShareLink[] = item.metadata?.sharedLinks || [];
  const idx = links.findIndex((l) => l.token === token);
  if (idx === -1) throw new AppError("Share link not found", 404);

  extend(links[idx], hours);
  await cms.media.update(
    mediaId,
    { metadata: { ...item.metadata, sharedLinks: links } },
    { tenantId },
  );

  return successResponse(event, {
    expiresAt: links[idx].expiresAt,
  });
}

export async function handleMediaShareDownload(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const id = event.url.searchParams.get("id");
  const token = event.url.searchParams.get("token");
  const password = event.url.searchParams.get("password") || "";
  if (!id || !token)
    throw new AppError("Resource context matrix validation tracking values expected", 400);

  const mediaRes = await cms.media.findById(id, { tenantId });
  if (!mediaRes.success || !mediaRes.data)
    throw new AppError("Media document record unavailable", 404);

  const item = mediaRes.data as any;
  const link = (item.metadata?.sharedLinks || []).find((l: any) => l.token === token);
  if (!link)
    throw new AppError("Target delivery link registration mismatch or signature expired", 404);

  const shareLink: ShareLink = {
    _id: id as DatabaseId,
    token: link.tokenHash || link.token,
    active: link.active !== false,
    expiresAt: link.expiresAt || link.expiry,
    downloadCount: link.downloadCount || 0,
    fileId: id as DatabaseId,
    createdBy: "system" as DatabaseId,
    createdAt: (link.createdAt || new Date().toISOString()) as any,
    passwordHash: link.passwordHash,
    logs: [],
  };

  const validation = validateLink(shareLink);
  if (!validation.ok) {
    throw new AppError(
      `Shared resource validation flag failure: ${validation.reason}`,
      validation.reason === "expired" ? 410 : 404,
    );
  }

  if (shareLink.passwordHash) {
    const hash = crypto.createHash("sha256").update(password).digest("hex");
    if (!validateLink(shareLink, undefined, hash).ok)
      return successResponse(event, { passwordRequired: true });
  }

  link.downloadCount = (link.downloadCount || 0) + 1;
  await cms.media.update(id, { metadata: item.metadata }, { tenantId });

  const storageType = getPublicSettingSync("MEDIA_STORAGE_TYPE") || "local";
  const mediaFolder = getPublicSettingSync("MEDIA_FOLDER") || "mediaFolder";
  const cloudUrl =
    getPublicSettingSync("MEDIA_CLOUD_PUBLIC_URL") || getPublicSettingSync("MEDIASERVER_URL");

  if (storageType !== "local" && cloudUrl) {
    const base = cloudUrl.replace(/\/+$/, "");
    const folder = mediaFolder.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
    return new Response(null, {
      status: 302,
      headers: {
        Location: folder ? `${base}/${folder}/${item.path}` : `${base}/${item.path}`,
      },
    });
  }

  const normalizedFolder = mediaFolder.replace(/^\.\//, "").replace(/^\/+/, "");
  const fullPath = path.join(process.cwd(), normalizedFolder, item.path);

  try {
    const stats = await fsp.stat(fullPath);
    const mimeType = mime.lookup(fullPath) || "application/octet-stream";

    return new Response(fs.createReadStream(fullPath) as any, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": stats.size.toString(),
        "Content-Disposition": `attachment; filename="${item.filename}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    throw new AppError(
      "Asset binary block matching tracking entity physically missing from storage layout",
      404,
    );
  }
}

export async function handleMediaBulkDownload(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const ids = event.url.searchParams.getAll("id");
  if (!ids.length) throw new AppError("Target selection download collection list empty", 400);

  const files: any[] = [];
  if (cms.db.crud.findMany) {
    const bulkRes = await cms.db.crud.findMany("media", { _id: { $in: ids as any } }, {
      tenantId,
    } as any);
    if (bulkRes.success && Array.isArray((bulkRes as any).data))
      files.push(...(bulkRes as any).data);
  } else {
    for (const id of ids) {
      const res = await cms.media.findById(id, { tenantId });
      if (res.success && (res as any).data) files.push((res as any).data);
    }
  }

  if (!files.length)
    throw new AppError("No matching assets cleared validation parsing step counters", 404);

  const archive = await createBulkArchive(files, os.tmpdir());
  const headers: Record<string, string> = {};
  streamArchive(archive.path, archive.filename, (k, v) => {
    headers[k] = v;
  });

  const nodeStream = fs.createReadStream(archive.path);

  const stream = new ReadableStream({
    start(ctrl) {
      nodeStream.on("data", (chunk) => ctrl.enqueue(chunk));
      nodeStream.on("end", () => {
        ctrl.close();
        cleanupArchive(archive.path).catch(() => {});
      });
      nodeStream.on("error", (err) => {
        ctrl.error(err);
        cleanupArchive(archive.path).catch(() => {});
      });
    },
    cancel() {
      nodeStream.destroy();
      cleanupArchive(archive.path).catch(() => {});
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...headers,
      "Content-Length": String(archive.size),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handleMediaAnalytics(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  // Use DB-side count for accurate total; cap in-memory sample to avoid heap pressure.
  // TODO: push full breakdown (byType/byFolder/byUser/byMonth) to DB adapter
  // aggregate pipelines for sub-millisecond analytics at 100K+ asset scale.
  const countRes = await cms.db.crud.count("media", {}, { tenantId });
  const totalFiles = countRes.success ? (countRes.data ?? 0) : 0;

  const ANALYTICS_SAMPLE_LIMIT = 2000;
  const listRes = await (cms.media as any).list({
    tenantId,
    limit: ANALYTICS_SAMPLE_LIMIT,
  });
  const files = (listRes.success ? listRes.data : []) as any[];

  const breakdown = analyze(files);
  breakdown.total.files = totalFiles;

  const topTypes = Object.entries(breakdown.byType)
    .sort(([, a]: any, [, b]: any) => b.size - a.size)
    .slice(0, 5)
    .map(([k, v]: any) => ({ type: k, ...v }));

  return successResponse(event, {
    total: {
      ...breakdown.total,
      formattedSize: formatBytes(breakdown.total.size),
    },
    byType: topTypes,
    insights: insights(files, breakdown),
    trends: trends(files).slice(-12),
    quota: quota(breakdown.total.size, 10 * 1024 * 1024 * 1024),
  });
}

export async function handleMediaVersionList(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const mediaId = segments[2];
  if (!mediaId) throw new AppError("Target asset identification context criteria expected", 400);
  const res = await cms.media.findById(mediaId, { tenantId });
  if (!res.success || !res.data) throw new AppError("Media item asset records unindexed", 404);
  const item = res.data as any;
  return successResponse(event, {
    versions: item.versions || [],
    stats: getVersionStats(item.versions || []),
  });
}

export async function handleMediaVersionCompare(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const mediaId = segments[2];
  const fromV = event.url.searchParams.get("from");
  const toV = event.url.searchParams.get("to");
  if (!mediaId || !fromV || !toV)
    throw new AppError("Required evaluation variant baseline sequence pointers missing", 400);

  const res = await cms.media.findById(mediaId, { tenantId });
  if (!res.success || !res.data) throw new AppError("Media context target unindexed", 404);

  const versions: any[] = (res.data as any).versions || [];
  const from = versions.find((v: any) => v.version === Number(fromV));
  const to = versions.find((v: any) => v.version === Number(toV));
  if (!from || !to)
    throw new AppError("Target operational reference validation index point split missing", 404);

  return successResponse(event, compareVersions(from, to));
}

// ─── Advanced Search ─────────────────────────────────────────────────────────

export async function handleMediaSearch(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  url: URL,
) {
  // Collect search criteria from query params
  const criteria: SearchCriteria = {};

  const filename = url.searchParams.get("filename");
  if (filename) criteria.filename = filename;

  const type = url.searchParams.get("type");
  if (type)
    criteria.fileTypes = type
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const tags = url.searchParams.get("tags");
  if (tags)
    criteria.tags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const camera = url.searchParams.get("camera");
  if (camera) criteria.camera = camera;

  const dominantColor = url.searchParams.get("dominantColor");
  if (dominantColor) criteria.dominantColor = dominantColor;

  const minWidth = url.searchParams.get("minWidth");
  if (minWidth) criteria.minWidth = Number(minWidth);

  const maxWidth = url.searchParams.get("maxWidth");
  if (maxWidth) criteria.maxWidth = Number(maxWidth);

  const minHeight = url.searchParams.get("minHeight");
  if (minHeight) criteria.minHeight = Number(minHeight);

  const maxHeight = url.searchParams.get("maxHeight");
  if (maxHeight) criteria.maxHeight = Number(maxHeight);

  const minSize = url.searchParams.get("minSize");
  if (minSize) criteria.minSize = Number(minSize);

  const maxSize = url.searchParams.get("maxSize");
  if (maxSize) criteria.maxSize = Number(maxSize);

  const uploadedAfter = url.searchParams.get("uploadedAfter");
  if (uploadedAfter) criteria.uploadedAfter = new Date(uploadedAfter);

  const uploadedBefore = url.searchParams.get("uploadedBefore");
  if (uploadedBefore) criteria.uploadedBefore = new Date(uploadedBefore);

  const aspectRatio = url.searchParams.get("aspectRatio");
  if (aspectRatio === "landscape" || aspectRatio === "portrait" || aspectRatio === "square") {
    criteria.aspectRatio = aspectRatio;
  }

  // Fetch all media for client-side filtering
  const listRes = await (cms.media as any).list({ tenantId, limit: 10000 });
  const files: MediaItem[] = listRes.success ? (listRes.data ?? []) : [];

  const result = advancedSearch(files, criteria);

  return successResponse(event, {
    files: result.files,
    total: result.total,
    matched: result.matched,
  });
}

// ─── Streaming Upload ────────────────────────────────────────────────────────

export async function handleMediaStreamUpload(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  if (!hasMediaPermission(event, user, "media:write")) {
    throw new AppError("Insufficient permissions for media upload", 403, "FORBIDDEN");
  }

  const operationId = crypto.randomUUID();
  let uploadFolder = "global";
  const uploaded: {
    fileName: string;
    success: boolean;
    data?: any;
    message?: string;
  }[] = [];

  try {
    await parseMultipartStream(event.request, {
      onFile: async (info) => {
        const chunks: Uint8Array[] = [];
        const reader = info.stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }

        const totalLength = chunks.reduce((s, c) => s + c.length, 0);
        const buffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }

        try {
          const res = await cms.media.upload(
            new File([buffer], info.filename, { type: info.contentType }),
            {
              userId: user?._id || "system",
              tenantId,
              folder: uploadFolder,
            },
          );
          uploaded.push({
            fileName: info.filename,
            success: !!res.success,
            data: (res as any).data,
            message: res.success ? undefined : res.message,
          });
        } catch (err: any) {
          const code =
            err instanceof AppError ? err.code : (err as NodeJS.ErrnoException)?.code || undefined;
          uploaded.push({
            fileName: info.filename,
            success: false,
            message: err.message,
            ...(code ? { code } : {}),
          });
        }
      },
      onField: (name, value) => {
        if (name === "folder" && value) {
          uploadFolder = value;
        }
      },
    });
  } catch (err: any) {
    rethrow(err);
    if (err instanceof AppError) throw err;
    throw new AppError(
      err.message || "Streaming upload transaction failed",
      500,
      "STREAM_UPLOAD_ERROR",
    );
  }

  return successResponse(event, {
    operationId,
    status: "completed",
    files: uploaded,
  });
}
