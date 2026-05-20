/**
 * @file src/routes/api/[...path]/handlers/media.ts
 * @description Media management handlers for the dispatcher.
 */

import { dev } from "$app/environment";
import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { logger } from "@utils/logger";
import { successResponse, rawResponse } from "./base";
import { getPrivateEnv } from "@src/databases/db";
import { getPublicSettingSync } from "@src/services/core/settings-service";

export async function handleMediaRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;
  const method = segments[1];

  if (dev) {
    logger.debug(
      `MediaHandler TRACE: ${request.method} /api/media/${method || ""} (segments: ${segments.join(",")})`,
    );
  }

  switch (request.method) {
    case "GET": {
      if (method === "exists") return handleMediaExists(event, cms, tenantId);
      if (method === "references") return handleMediaReferences(event, cms, tenantId, segments);
      if (method === "share") return handleMediaShareDownload(event, cms, tenantId);
      if (!method || method === "list") return handleMediaList(event, cms, tenantId, url);
      return successResponse(
        event,
        await cms.media.findById(method, {
          tenantId,
          prefix: url.searchParams.get("prefix") || undefined,
        }),
      );
    }
    case "POST": {
      if (method === "upload" || !method) return handleMediaUpload(event, cms, tenantId, user);
      if (method === "version") {
        if (segments[3] === "restore") {
          return handleMediaVersionRestore(event, cms, tenantId, user, segments);
        }
        return handleMediaVersionUpload(event, cms, tenantId, user, segments);
      }
      if (method === "share") {
        return handleMediaShareCreate(event, cms, tenantId, user, segments);
      }
      if (method === "process") return handleMediaProcess(event, cms, tenantId, user);
      if (method === "remote") return handleMediaRemote(event, cms, tenantId, user);
      if (method === "trash" || method === "delete")
        return handleMediaPostDelete(event, cms, tenantId);
      if (method === "manipulate" || method === "edit")
        return handleMediaManipulate(event, cms, tenantId, user, segments);
      break;
    }
    case "PATCH":
      return method
        ? rawResponse(event, await cms.media.update(method, await request.json(), { tenantId }))
        : successResponse(event, null);
    case "DELETE":
      if (method === "share") {
        return handleMediaShareDelete(event, cms, tenantId, segments);
      }
      if (method === "delete" || method === "trash") {
        return handleMediaPostDelete(event, cms, tenantId);
      }
      return method
        ? rawResponse(event, await cms.media.delete(method, { tenantId }))
        : successResponse(event, null);
  }

  throw new AppError(`Media endpoint /api/media/${segments.join("/")} not implemented`, 404);
}

export async function handleMediaExists(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  const url_param = event.url.searchParams.get("url");
  if (!url_param) throw new AppError("URL parameter is required", 400);
  return rawResponse(event, { exists: await cms.media.exists(url_param, tenantId) });
}

export async function handleMediaList(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  url: URL,
) {
  const limit = Number(url.searchParams.get("limit")) || 100;
  const folderId = url.searchParams.get("folderId") || undefined;
  const recursive = url.searchParams.get("recursive") === "true";
  const prefix = url.searchParams.get("prefix") || undefined;
  return rawResponse(event, await cms.media.find({ tenantId, limit, folderId, recursive, prefix }));
}

export async function handleMediaUpload(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  const contentType = event.request.headers.get("content-type");
  if (!contentType?.includes("multipart/form-data")) {
    throw new AppError("Invalid content type. Expected multipart/form-data", 400);
  }

  const formData = await event.request.formData();
  const files = formData.getAll("files");

  // Single file support for some endpoints like save-avatar calling this directly
  const singleFile = formData.get("file");
  if (singleFile instanceof File && files.length === 0) {
    files.push(singleFile);
  }

  if (files.length === 0) {
    throw new AppError("No files provided for upload", 400);
  }

  const config = getPrivateEnv();
  const concurrency = config?.CONCURRENT_UPLOAD_SIZE || 1;

  const results = [];
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const chunkPromises = chunk.map(async (file) => {
      if (!(file instanceof File)) return null;
      const res = (await cms.media.upload(file, {
        userId: (user?._id as string) || "system",
        tenantId,
      })) as any;

      if (!res.success) {
        return { fileName: file.name, success: false, message: res.message };
      } else {
        return { fileName: file.name, success: true, data: res.data };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults.filter((r): r is any => r !== null));
  }
  return successResponse(event, results);
}

export async function handleMediaProcess(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  const formData = await event.request.formData();
  const processType = formData.get("processType") as string;
  if (!processType) throw new AppError("processType is required", 400);

  if (processType === "metadata") {
    const file = formData.get("file") as File;
    if (!file) throw new AppError("file is required for metadata processing", 400);
    const result = await cms.media.getMetadata(file);
    return successResponse(event, result);
  }
  if (processType === "save") return handleMediaUpload(event, cms, tenantId, user);
  if (processType === "delete") {
    const mediaId = formData.get("mediaId") as string;
    if (!mediaId) throw new AppError("mediaId is required", 400);
    await cms.media.delete(mediaId, { tenantId });
    return successResponse(event, null);
  }
  if (processType === "batch") {
    const mediaIdsRaw = formData.get("mediaIds") as string;
    const optionsRaw = formData.get("options") as string;
    if (!mediaIdsRaw) throw new AppError("mediaIds is required", 400);
    const mediaIds = JSON.parse(mediaIdsRaw);
    const options = optionsRaw ? JSON.parse(optionsRaw) : {};
    const result = await cms.media.batchProcess(mediaIds, {
      ...options,
      userId: (user?._id as string) || "system",
      tenantId,
    });
    return successResponse(event, result);
  }
  throw new AppError(`Process type ${processType} not implemented`, 404);
}

export async function handleMediaRemote(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  const body = await event.request.json().catch(() => ({}));
  const { url: remoteUrl, access } = body;
  if (!remoteUrl) throw new AppError("remote URL is required", 400);

  const result = await cms.media.remote(remoteUrl, {
    userId: (user?._id as string) || "system",
    access: access || "private",
    tenantId,
  });

  if (!result.success) {
    throw result.error || new AppError(result.message || "Remote upload failed", 500);
  }

  return successResponse(event, result.data);
}

export async function handleMediaPostDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const body = await event.request.json().catch(() => ({}));
  const { id } = body;
  if (!id) throw new AppError("Media ID is required for deletion", 400);

  const result = await cms.media.delete(id, { tenantId });

  if (!result.success) {
    throw result.error || new AppError(result.message || "Deletion failed", 500);
  }

  return successResponse(event, { success: true });
}

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
    // Convert FormData to a flat object for the manipulate service
    for (const [key, value] of formData.entries()) {
      try {
        body[key] = typeof value === "string" ? JSON.parse(value) : value;
      } catch {
        body[key] = value;
      }
    }
  }

  // Allow ID to be in segments OR in the body (from FormData/JSON)
  id = id || body.mediaId || body.id;

  if (!id) {
    throw new AppError("Media ID is required for manipulation", 400);
  }

  if (Object.keys(body).length === 0) {
    throw new AppError("Manipulation parameters are required", 400);
  }

  const result = await cms.media.manipulate(id, body, {
    userId: (user?._id as string) || "system",
    tenantId,
  });

  if (!result.success) {
    // 🚀 UNWRAP ERROR: If the namespace returns a 404/403 error, we MUST propagate it.
    if (result.error instanceof AppError) throw result.error;
    if (result.message && result.message.toLowerCase().includes("not found")) {
      throw new AppError(result.message, 404);
    }
    throw new AppError(result.message || "Manipulation failed", 500);
  }

  return successResponse(event, result.data);
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
  if (!result.success) {
    throw result.error || new AppError(result.message || "Failed to scan references", 500);
  }
  return successResponse(event, result.data);
}

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
  if (!(file instanceof File)) {
    throw new AppError("A valid File object is required", 400);
  }

  const result = await cms.media.uploadVersion(mediaId, file, {
    userId: (user?._id as string) || "system",
    tenantId,
  });

  if (!result.success) {
    throw result.error || new AppError(result.message || "Version upload failed", 500);
  }

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
  if (!mediaId) throw new AppError("Media ID is required", 400);

  const body = await event.request.json().catch(() => ({}));
  const { versionNumber } = body;
  if (!versionNumber) throw new AppError("Version number is required", 400);

  const result = await cms.media.restoreVersion(mediaId, Number(versionNumber), {
    userId: (user?._id as string) || "system",
    tenantId,
  });

  if (!result.success) {
    throw result.error || new AppError(result.message || "Version restore failed", 500);
  }

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

  // Get current media item
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

  const updatedMetadata = {
    ...mediaItem.metadata,
    sharedLinks: [...sharedLinks, newLink],
  };

  const updateRes = await cms.media.update(mediaId, { metadata: updatedMetadata }, { tenantId });
  if (!updateRes.success) {
    throw new AppError("Failed to update media metadata with share link", 500);
  }

  return successResponse(event, { token, expiry });
}

export async function handleMediaShareDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const mediaId = segments[2];
  const token = segments[3];
  if (!mediaId || !token) throw new AppError("Media ID and Token are required", 400);

  // Get current media item
  const mediaRes = await cms.media.findById(mediaId, { tenantId });
  if (!mediaRes.success || !mediaRes.data) {
    throw new AppError("Media item not found", 404);
  }

  const mediaItem = mediaRes.data as any;
  const sharedLinks = mediaItem.metadata?.sharedLinks || [];
  const updatedLinks = sharedLinks.filter((l: any) => l.token !== token);

  const updatedMetadata = {
    ...mediaItem.metadata,
    sharedLinks: updatedLinks,
  };

  const updateRes = await cms.media.update(mediaId, { metadata: updatedMetadata }, { tenantId });
  if (!updateRes.success) {
    throw new AppError("Failed to revoke share link", 500);
  }

  return successResponse(event, { success: true });
}

export async function handleMediaShareDownload(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const id = event.url.searchParams.get("id");
  const token = event.url.searchParams.get("token");
  const password = event.url.searchParams.get("password") || "";

  if (!id || !token) {
    throw new AppError("Media ID and Token are required", 400);
  }

  const mediaRes = await cms.media.findById(id, { tenantId });
  if (!mediaRes.success || !mediaRes.data) {
    throw new AppError("Media item not found", 404);
  }

  const mediaItem = mediaRes.data as any;
  const sharedLinks = mediaItem.metadata?.sharedLinks || [];
  const link = sharedLinks.find((l: any) => l.token === token);

  if (!link) {
    throw new AppError("Invalid or expired share link", 404);
  }

  if (link.expiry && new Date() > new Date(link.expiry)) {
    throw new AppError("Share link has expired", 410);
  }

  if (link.passwordHash) {
    const crypto = await import("node:crypto");
    const hash = crypto.createHash("sha256").update(password).digest("hex");
    if (hash !== link.passwordHash) {
      return successResponse(event, { passwordRequired: true });
    }
  }

  // Increment download count
  link.downloadCount = (link.downloadCount || 0) + 1;
  await cms.media.update(id, { metadata: mediaItem.metadata }, { tenantId });

  // Stream/Serve the file
  const filePath = mediaItem.path;
  const storageType = getPublicSettingSync("MEDIA_STORAGE_TYPE") || "local";
  const mediaFolder = getPublicSettingSync("MEDIA_FOLDER") || "static/media";
  const cloudPublicUrl =
    getPublicSettingSync("MEDIA_CLOUD_PUBLIC_URL") || getPublicSettingSync("MEDIASERVER_URL");

  // Redirect if cloud storage
  if (storageType !== "local" && cloudPublicUrl) {
    const baseUrl = cloudPublicUrl.replace(/\/+$/, "");
    const normalizedFolder = mediaFolder.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
    const fullUrl = normalizedFolder
      ? `${baseUrl}/${normalizedFolder}/${filePath}`
      : `${baseUrl}/${filePath}`;
    return new Response(null, {
      status: 302,
      headers: { Location: fullUrl },
    });
  }

  // Serve locally
  const normalizedMediaFolder = mediaFolder.replace(/^\.\//, "").replace(/^\/+/, "");
  const pathMod = await import("node:path");
  const fs = await import("node:fs");
  const fullPath = pathMod.join(process.cwd(), normalizedMediaFolder, filePath);

  if (!fs.existsSync(fullPath)) {
    throw new AppError("File not found on disk", 404);
  }

  const stats = fs.statSync(fullPath);
  const stream = fs.createReadStream(fullPath);
  const mimeMod = await import("mime-types");
  const contentType = mimeMod.lookup(fullPath) || "application/octet-stream";

  return new Response(stream as any, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": stats.size.toString(),
      "Content-Disposition": `attachment; filename="${mediaItem.filename}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
