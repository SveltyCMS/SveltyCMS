/**
 * @file src/routes/api/[...path]/handlers/media.ts
 * @description Media management handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
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

  const limit = Number(url.searchParams.get("limit")) || 100;
  const folderId = url.searchParams.get("folderId") || undefined;
  const recursive = url.searchParams.get("recursive") === "true";

  if (request.method === "GET") {
    const fileId = method;
    if (!fileId || fileId === "list") {
      const result = await cms.media.find({ tenantId, limit, folderId, recursive });
      return rawResponse(result);
    }
    const data = await cms.media.findById(fileId, { tenantId });
    return successResponse(data);
  }

  if (request.method === "POST") {
    if (method === "upload" || !method) {
      const formData = await request.formData();
      const files = formData.getAll("files");
      const results = [];
      for (const file of files) {
        if (file instanceof File) {
          const res = await cms.media.upload(file, {
            userId: (user?._id as string) || "",
            tenantId,
          });
          results.push({ fileName: file.name, success: true, data: res });
        }
      }
      return successResponse(results);
    }

    if (method === "process") {
      const formData = await request.formData();
      const processType = formData.get("processType");

      if (processType === "save") {
        const files = formData.getAll("files");
        const results = [];
        for (const file of files) {
          if (file instanceof File) {
            const res = await cms.media.upload(file, {
              userId: (user?._id as string) || "",
              tenantId,
            });
            results.push({ fileName: file.name, success: true, data: res });
          }
        }
        return successResponse(results);
      }

      if (processType === "delete") {
        const mediaId = formData.get("mediaId") as string;
        await cms.media.delete(mediaId, { tenantId });
        return successResponse(null);
      }

      if (processType === "batch") {
        const mediaIds = JSON.parse(formData.get("mediaIds") as string);
        const options = JSON.parse(formData.get("options") as string);
        const result = await cms.media.batchProcess(
          mediaIds,
          options,
          (user?._id as string) || "",
          tenantId,
        );
        return successResponse(result);
      }
    }
  }

  if (request.method === "PATCH" && method) {
    const data = await request.json();
    const result = await cms.media.update(method, data, tenantId);
    return rawResponse(result);
  }

  if (request.method === "DELETE" && method) {
    const result = await cms.media.delete(method, { tenantId });
    return rawResponse(result);
  }

  throw new AppError(`Media endpoint /api/media/${segments.join("/")} not implemented`, 404);
}
