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

  const limit = Number(url.searchParams.get("limit")) || 100;
  const folderId = url.searchParams.get("folderId") || undefined;
  const recursive = url.searchParams.get("recursive") === "true";
  const prefix = url.searchParams.get("prefix") || undefined;

  switch (request.method) {
    case "GET": {
      if (method === "exists") {
        const url_param = event.url.searchParams.get("url");
        if (!url_param) throw new AppError("URL parameter is required", 400);
        const exists = await cms.media.exists(url_param, tenantId);
        return rawResponse(event, { exists });
      }

      if (!method || method === "list") {
        const result = await cms.media.find({ tenantId, limit, folderId, recursive, prefix });
        return rawResponse(event, result);
      }
      return successResponse(event, await cms.media.findById(method, { tenantId, prefix }));
    }

    case "POST": {
      switch (method) {
        case "upload":
        case undefined: {
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
          return successResponse(event, results);
        }

        case "process": {
          const formData = await request.formData();
          const processType = formData.get("processType") as string;
          if (!processType) throw new AppError("processType is required", 400);

          if (processType === "metadata") {
            const file = formData.get("file") as File;
            if (!file) throw new AppError("file is required for metadata processing", 400);
            return successResponse(event, await cms.media.getMetadata(file));
          }

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
            return successResponse(event, results);
          }
          if (processType === "delete") {
            await cms.media.delete(formData.get("mediaId") as string, { tenantId });
            return successResponse(event, null);
          }
          if (processType === "batch") {
            const mediaIds = JSON.parse(formData.get("mediaIds") as string);
            const options = JSON.parse(formData.get("options") as string);
            return successResponse(
              event,
              await cms.media.batchProcess(
                mediaIds,
                options,
                (user?._id as string) || "",
                tenantId,
              ),
            );
          }
          throw new AppError(`Process type ${processType} not implemented`, 404);
        }

        case "remote": {
          const { url: remoteUrl, access } = await request.json();
          return successResponse(
            event,
            await cms.media.remote(
              remoteUrl,
              (user?._id as string) || "",
              access || "private",
              tenantId,
            ),
          );
        }

        case "trash":
        case "delete": {
          const { id } = await request.json();
          await cms.media.delete(id, { tenantId });
          return successResponse(event, { success: true });
        }

        case "manipulate": {
          if (!segments[2]) break;
          const id = segments[2];
          const manipulations = await request.json();
          return successResponse(
            event,
            await cms.media.manipulate(id, manipulations, (user?._id as string) || "", tenantId),
          );
        }
      }
      break;
    }

    case "PATCH": {
      if (method) {
        const data = await request.json();
        return rawResponse(event, await cms.media.update(method, data, tenantId));
      }
      break;
    }

    case "DELETE": {
      if (method) {
        return rawResponse(event, await cms.media.delete(method, { tenantId }));
      }
      break;
    }
  }

  throw new AppError(`Media endpoint /api/media/${segments.join("/")} not implemented`, 404);
}
