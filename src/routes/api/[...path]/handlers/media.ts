/**
 * @file src/routes/api/[...path]/handlers/media.ts
 * @description Enterprise media management — upload, process, manipulate, version, share, and serve.
 *
 * Responsibilities:
 * - File upload with concurrent chunking and permission gating
 * - Media CRUD (list, find, update, delete) with defense-in-depth security
 * - Image manipulation (resize, crop, filters) via native media service
 * - Remote URL ingestion
 * - Version management (upload new version, restore previous)
 * - Secure share links with optional password protection and expiry
 * - File streaming/download with cloud storage redirect support
 * - Batch processing and metadata extraction
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";
import { getPrivateEnv } from "@src/databases/db";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";

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

  try {
    switch (request.method) {
      // ── Read ──
      case "GET":
        return handleGetRoutes(event, cms, tenantId, user, method, url, segments);

      // ── Create / Upload / Process ──
      case "POST":
        return handlePostRoutes(event, cms, tenantId, user, method, segments);

      // ── Update ──
      case "PATCH":
        return method
          ? rawResponse(
              event,
              await cms.media.update(method, await request.json(), {
                tenantId,
              }),
            )
          : successResponse(event, null);

      // ── Delete ──
      case "DELETE":
        return handleDeleteRoutes(event, cms, tenantId, user, method, segments);
    }

    throw new AppError(`Media endpoint /api/media/${segments.join("/")} not implemented`, 404);
  } catch (err: any) {
    console.error(`[MediaRoute Error] ${segments.join("/")}:`, err);
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || "Media operation failed", 500);
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
  if (method === "exists") return handleMediaExists(event, cms, tenantId);
  if (method === "references") return handleMediaReferences(event, cms, tenantId, segments);
  if (method === "share") return handleMediaShareDownload(event, cms, tenantId);

  // List all or find by ID
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
  // Upload
  if (method === "upload" || !method) {
    return handleMediaUpload(event, cms, tenantId, user);
  }

  // Version management
  if (method === "version") {
    if (segments[3] === "restore") {
      return handleMediaVersionRestore(event, cms, tenantId, user, segments);
    }
    return handleMediaVersionUpload(event, cms, tenantId, user, segments);
  }

  // Share links
  if (method === "share") {
    return handleMediaShareCreate(event, cms, tenantId, user, segments);
  }

  // Processing & ingestion
  if (method === "process") return handleMediaProcess(event, cms, tenantId, user);
  if (method === "remote") return handleMediaRemote(event, cms, tenantId, user);

  // Delete via POST body (legacy support)
  if (method === "trash" || method === "delete") {
    return handleMediaPostDelete(event, cms, tenantId);
  }

  // Manipulation
  if (method === "manipulate" || method === "edit") {
    return handleMediaManipulate(event, cms, tenantId, user, segments);
  }

  throw new AppError(`Unknown POST method: ${method}`, 404);
}

async function handleDeleteRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  method: string | undefined,
  segments: string[],
) {
  // Revoke share link
  if (method === "share") {
    return handleMediaShareDelete(event, cms, tenantId, segments);
  }

  // Delete by request body
  if (method === "delete" || method === "trash") {
    return handleMediaPostDelete(event, cms, tenantId);
  }

  // Delete by media ID in URL
  if (method) {
    if (!user || !hasPermissionWithRoles(user, "media:delete", event.locals.roles || [])) {
      throw new AppError("Insufficient permissions for media deletion", 403, "FORBIDDEN");
    }
    return rawResponse(event, await cms.media.delete(method, { tenantId }));
  }

  return successResponse(event, null);
}

// ─── Read Handlers ───────────────────────────────────────────────────────────

/** Check if a media file exists by URL. */
export async function handleMediaExists(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  const urlParam = event.url.searchParams.get("url");
  if (!urlParam) throw new AppError("URL parameter is required", 400);
  return rawResponse(event, {
    exists: await cms.media.exists(urlParam, tenantId),
  });
}

/** List media files with folder filtering and recursion. */
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

/** Find references to a media item across collections. */
export async function handleMediaReferences(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const mediaId = segments[2];
  if (!mediaId) throw new AppError("Media ID is required", 400);

  const result = await cms.media.references(mediaId, { tenantId });
  if (!result.success) {
    throw result.error || new AppError(result.message || "Failed to scan references", 500);
  }
  return successResponse(event, result.data);
}

// ─── Upload Handler ──────────────────────────────────────────────────────────

/**
 * Handles media file upload with concurrent chunking.
 * Requires media:write permission (defense-in-depth).
 * Supports both "files" (multiple) and "file" (single) field names.
 */
export async function handleMediaUpload(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  // 🛡️ Defense-in-depth permission check
  if (!user || !hasPermissionWithRoles(user, "media:write", event.locals.roles || [])) {
    throw new AppError("Insufficient permissions for media upload", 403, "FORBIDDEN");
  }

  const contentType = event.request.headers.get("content-type");
  if (!contentType?.includes("multipart/form-data")) {
    throw new AppError("Invalid content type. Expected multipart/form-data", 400);
  }

  const formData = await event.request.formData();
  const files = formData.getAll("files") as File[];

  // Support single file upload via "file" field
  const singleFile = formData.get("file");
  if (singleFile instanceof File && files.length === 0) {
    files.push(singleFile);
  }

  if (files.length === 0) {
    throw new AppError("No files provided for upload", 400);
  }

  const config = getPrivateEnv();
  const concurrency = config?.CONCURRENT_UPLOAD_SIZE || 1;

  const results: any[] = [];
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (file) => {
        if (!(file instanceof File)) return null;
        try {
          const res = await cms.media.upload(file, {
            userId: user?._id || "system",
            tenantId,
          });
          return res.success
            ? { fileName: file.name, success: true, data: res.data }
            : { fileName: file.name, success: false, message: res.message };
        } catch (err: any) {
          return { fileName: file.name, success: false, message: err.message };
        }
      }),
    );
    results.push(...chunkResults.filter(Boolean));
  }

  return successResponse(event, results);
}

// ─── Process Handlers ────────────────────────────────────────────────────────

/**
 * Media processing router — metadata extraction, save, batch operations.
 * processType values: metadata | save | delete | batch
 */
export async function handleMediaProcess(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  const formData = await event.request.formData();
  const processType = formData.get("processType") as string;

  if (!processType) throw new AppError("processType is required", 400);

  switch (processType) {
    case "metadata": {
      const file = formData.get("file") as File;
      if (!file) throw new AppError("File is required for metadata processing", 400);
      return successResponse(event, await cms.media.getMetadata(file));
    }

    case "save":
      return handleMediaUpload(event, cms, tenantId, user);

    case "delete": {
      const mediaId = formData.get("mediaId") as string;
      if (!mediaId) throw new AppError("mediaId is required", 400);
      await cms.media.delete(mediaId, { tenantId });
      return successResponse(event, null);
    }

    case "batch": {
      const mediaIdsRaw = formData.get("mediaIds") as string;
      const optionsRaw = formData.get("options") as string;
      if (!mediaIdsRaw) throw new AppError("mediaIds is required", 400);

      const mediaIds = JSON.parse(mediaIdsRaw);
      const options = optionsRaw ? JSON.parse(optionsRaw) : {};
      return successResponse(
        event,
        await cms.media.batchProcess(mediaIds, {
          ...options,
          userId: user?._id || "system",
          tenantId,
        }),
      );
    }

    default:
      throw new AppError(`Process type '${processType}' not implemented`, 404);
  }
}

/** Ingests a file from a remote URL into the media library. */
export async function handleMediaRemote(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  const body = await event.request.json().catch(() => ({}));
  const { url: remoteUrl, access } = body;

  if (!remoteUrl) throw new AppError("Remote URL is required", 400);

  const result = await cms.media.remote(remoteUrl, {
    userId: user?._id || "system",
    access: access || "private",
    tenantId,
  });

  if (!result.success) {
    throw result.error || new AppError(result.message || "Remote upload failed", 500);
  }
  return successResponse(event, result.data);
}

// ─── Delete Handler ──────────────────────────────────────────────────────────

/**
 * Deletes media via POST body (legacy compatibility path).
 * Requires media:delete permission (defense-in-depth).
 */
export async function handleMediaPostDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  // 🛡️ Defense-in-depth permission check
  if (
    !event.locals.user ||
    !hasPermissionWithRoles(event.locals.user, "media:delete", event.locals.roles || [])
  ) {
    throw new AppError("Insufficient permissions for media deletion", 403, "FORBIDDEN");
  }

  const body = await event.request.json().catch(() => ({}));
  const { id } = body;
  if (!id) throw new AppError("Media ID is required for deletion", 400);

  const result = await cms.media.delete(id, { tenantId });
  if (!result.success) {
    throw result.error || new AppError(result.message || "Deletion failed", 500);
  }
  return successResponse(event, { success: true });
}

// ─── Manipulation Handler ────────────────────────────────────────────────────

/**
 * Image manipulation — resize, crop, filters, etc.
 * Accepts JSON body or multipart/form-data.
 * Media ID can be in URL segment or request body.
 */
export async function handleMediaManipulate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  segments: string[],
) {
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

  // ID from URL segment or body
  id = id || body.mediaId || body.id;
  if (!id) throw new AppError("Media ID is required for manipulation", 400);
  if (Object.keys(body).length === 0) {
    throw new AppError("Manipulation parameters are required", 400);
  }

  const result = await cms.media.manipulate(id, body, {
    userId: user?._id || "system",
    tenantId,
  });

  if (!result.success) {
    if (result.error instanceof AppError) throw result.error;
    if (result.message?.toLowerCase().includes("not found")) {
      throw new AppError(result.message, 404);
    }
    throw new AppError(result.message || "Manipulation failed", 500);
  }

  return successResponse(event, result.data);
}

// ─── Version Handlers ────────────────────────────────────────────────────────

/** Uploads a new version of an existing media file. */
export async function handleMediaVersionUpload(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  segments: string[],
) {
  const mediaId = segments[2];
  if (!mediaId) throw new AppError("Media ID is required", 400);

  const contentType = event.request.headers.get("content-type");
  if (!contentType?.includes("multipart/form-data")) {
    throw new AppError("Invalid content type. Expected multipart/form-data", 400);
  }

  const formData = await event.request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new AppError("A valid File object is required", 400);

  const result = await cms.media.uploadVersion(mediaId, file, {
    userId: user?._id || "system",
    tenantId,
  });

  if (!result.success) {
    throw result.error || new AppError(result.message || "Version upload failed", 500);
  }
  return successResponse(event, result.data);
}

/** Restores a previous version of a media file. */
export async function handleMediaVersionRestore(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  segments: string[],
) {
  const mediaId = segments[2];
  if (!mediaId) throw new AppError("Media ID is required", 400);

  const body = await event.request.json().catch(() => ({}));
  const { versionNumber } = body;
  if (!versionNumber) throw new AppError("Version number is required", 400);

  const result = await cms.media.restoreVersion(mediaId, Number(versionNumber), {
    userId: user?._id || "system",
    tenantId,
  });

  if (!result.success) {
    throw result.error || new AppError(result.message || "Version restore failed", 500);
  }
  return successResponse(event, result.data);
}

// ─── Share Link Handlers ─────────────────────────────────────────────────────

/**
 * Creates a secure share link for a media item.
 * Supports optional password protection and expiry.
 */
export async function handleMediaShareCreate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _user: any,
  segments: string[],
) {
  const mediaId = segments[2];
  if (!mediaId) throw new AppError("Media ID is required", 400);

  const body = await event.request.json().catch(() => ({}));
  const { expiryHours, password } = body;

  const crypto = await import("node:crypto");
  const token = crypto.randomUUID();
  const expiry = expiryHours
    ? new Date(Date.now() + Number(expiryHours) * 60 * 60 * 1000).toISOString()
    : null;

  let passwordHash: string | undefined;
  if (password) {
    passwordHash = crypto.createHash("sha256").update(password).digest("hex");
  }

  // Get current media item and its existing shared links
  const mediaRes = await cms.media.findById(mediaId, { tenantId });
  if (!mediaRes.success || !mediaRes.data) {
    throw new AppError("Media item not found", 404);
  }

  const mediaItem = mediaRes.data as any;
  const sharedLinks = mediaItem.metadata?.sharedLinks || [];

  const newLink = {
    token,
    expiry,
    passwordHash,
    downloadCount: 0,
    createdAt: new Date().toISOString(),
  };

  const updateRes = await cms.media.update(
    mediaId,
    {
      metadata: {
        ...mediaItem.metadata,
        sharedLinks: [...sharedLinks, newLink],
      },
    },
    { tenantId },
  );

  if (!updateRes.success) {
    throw new AppError("Failed to update media metadata with share link", 500);
  }

  return successResponse(event, { token, expiry });
}

/** Revokes a share link by token. */
export async function handleMediaShareDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const mediaId = segments[2];
  const token = segments[3];
  if (!mediaId || !token) throw new AppError("Media ID and Token are required", 400);

  const mediaRes = await cms.media.findById(mediaId, { tenantId });
  if (!mediaRes.success || !mediaRes.data) {
    throw new AppError("Media item not found", 404);
  }

  const mediaItem = mediaRes.data as any;
  const filtered = (mediaItem.metadata?.sharedLinks || []).filter((l: any) => l.token !== token);

  const updateRes = await cms.media.update(
    mediaId,
    { metadata: { ...mediaItem.metadata, sharedLinks: filtered } },
    { tenantId },
  );

  if (!updateRes.success) throw new AppError("Failed to revoke share link", 500);
  return successResponse(event, { success: true });
}

/**
 * Downloads a file via a share link.
 * Validates token, expiry, and optional password.
 * Redirects for cloud storage, streams for local storage.
 */
export async function handleMediaShareDownload(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const id = event.url.searchParams.get("id");
  const token = event.url.searchParams.get("token");
  const password = event.url.searchParams.get("password") || "";

  if (!id || !token) throw new AppError("Media ID and Token are required", 400);

  // Find the media item and validate the share link
  const mediaRes = await cms.media.findById(id, { tenantId });
  if (!mediaRes.success || !mediaRes.data) {
    throw new AppError("Media item not found", 404);
  }

  const mediaItem = mediaRes.data as any;
  const link = (mediaItem.metadata?.sharedLinks || []).find((l: any) => l.token === token);

  if (!link) throw new AppError("Invalid or expired share link", 404);
  if (link.expiry && new Date() > new Date(link.expiry)) {
    throw new AppError("Share link has expired", 410);
  }

  // Validate password if set
  if (link.passwordHash) {
    const crypto = await import("node:crypto");
    const hash = crypto.createHash("sha256").update(password).digest("hex");
    if (hash !== link.passwordHash) {
      return successResponse(event, { passwordRequired: true });
    }
  }

  // Increment download counter
  link.downloadCount = (link.downloadCount || 0) + 1;
  await cms.media.update(id, { metadata: mediaItem.metadata }, { tenantId });

  // Determine storage backend
  const filePath = mediaItem.path;
  const storageType = getPublicSettingSync("MEDIA_STORAGE_TYPE") || "local";
  const mediaFolder = getPublicSettingSync("MEDIA_FOLDER") || "static/media";
  const cloudUrl =
    getPublicSettingSync("MEDIA_CLOUD_PUBLIC_URL") || getPublicSettingSync("MEDIASERVER_URL");

  // Cloud storage → redirect
  if (storageType !== "local" && cloudUrl) {
    const base = cloudUrl.replace(/\/+$/, "");
    const folder = mediaFolder.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
    const fullUrl = folder ? `${base}/${folder}/${filePath}` : `${base}/${filePath}`;
    return new Response(null, { status: 302, headers: { Location: fullUrl } });
  }

  // Local storage → stream
  const pathMod = await import("node:path");
  const fs = await import("node:fs");
  const normalized = mediaFolder.replace(/^\.\//, "").replace(/^\/+/, "");
  const fullPath = pathMod.join(process.cwd(), normalized, filePath);

  if (!fs.existsSync(fullPath)) throw new AppError("File not found on disk", 404);

  const stats = fs.statSync(fullPath);
  const mimeMod = await import("mime-types");
  const mimeType = mimeMod.lookup(fullPath) || "application/octet-stream";

  return new Response(fs.createReadStream(fullPath) as any, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": stats.size.toString(),
      "Content-Disposition": `attachment; filename="${mediaItem.filename}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
