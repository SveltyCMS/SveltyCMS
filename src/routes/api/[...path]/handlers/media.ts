/**
 * @file src/routes/api/[...path]/handlers/media.ts
 * @description Media management handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { logger } from "@utils/logger.server";
import { successResponse, rawResponse } from "./base";

export async function handleMediaRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;
  const method = segments[1];
  logger.info(
    `MediaHandler TRACE: ${request.method} /api/media/${method || ""} (segments: ${segments.join(",")})`,
  );

  switch (request.method) {
    case "GET": {
      if (method === "exists") return handleMediaExists(event, cms, tenantId);
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
      if (method === "process") return handleMediaProcess(event, cms, tenantId, user);
      if (method === "remote") return handleMediaRemote(event, cms, tenantId, user);
      if (method === "trash" || method === "delete")
        return handleMediaPostDelete(event, cms, tenantId);
      if (method === "manipulate")
        return handleMediaManipulate(event, cms, tenantId, user, segments);
      break;
    }
    case "PATCH":
      return method
        ? rawResponse(event, await cms.media.update(method, await request.json(), tenantId))
        : successResponse(event, null);
    case "DELETE":
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
  const formData = await event.request.formData();
  const files = formData.getAll("files");
  const results = [];
  for (const file of files) {
    if (file instanceof File) {
      const res = await cms.media.upload(file, { userId: (user?._id as string) || "", tenantId });
      results.push({ fileName: file.name, success: true, data: res });
    }
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
    return successResponse(event, await cms.media.getMetadata(file));
  }
  if (processType === "save") return handleMediaUpload(event, cms, tenantId, user);
  if (processType === "delete") {
    await cms.media.delete(formData.get("mediaId") as string, { tenantId });
    return successResponse(event, null);
  }
  if (processType === "batch") {
    const mediaIds = JSON.parse(formData.get("mediaIds") as string);
    const options = JSON.parse(formData.get("options") as string);
    return successResponse(
      event,
      await cms.media.batchProcess(mediaIds, options, (user?._id as string) || "", tenantId),
    );
  }
  throw new AppError(`Process type ${processType} not implemented`, 404);
}

export async function handleMediaRemote(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  const { url: remoteUrl, access } = await event.request.json();
  return successResponse(
    event,
    await cms.media.remote(remoteUrl, (user?._id as string) || "", access || "private", tenantId),
  );
}

export async function handleMediaPostDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const { id } = await event.request.json();
  await cms.media.delete(id, { tenantId });
  return successResponse(event, { success: true });
}

export async function handleMediaManipulate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  segments: string[],
) {
  if (!segments[2]) throw new AppError("Media ID is required for manipulation", 400);
  const id = segments[2];
  const manipulations = await event.request.json();
  return successResponse(
    event,
    await cms.media.manipulate(id, manipulations, (user?._id as string) || "", tenantId),
  );
}

// End of file
