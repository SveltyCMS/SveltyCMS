/**
 * @file src/routes/(app)/mediagallery/upload-media/remote-upload.remote.ts
 * @description Remote URL upload — LocalCMS/MediaService, no form-action HTTP hop.
 */

import { query, getRequestEvent } from "$app/server";
import type { DatabaseId } from "@src/content/types";
import { getAuthenticatedUser, requirePagePermission } from "@utils/page-guards.server";
import { saveRemoteMediaUrls } from "../save-remote-urls.server";
import { remoteErrorMessage } from "@utils/server/request-cms.server";

export const uploadRemoteUrls = query(
  "unchecked",
  async ({
    urls,
    folder = "global",
  }: {
    urls: string[];
    folder?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const event = getRequestEvent();
      const user = getAuthenticatedUser(event.locals);
      requirePagePermission(
        event.locals,
        "media:write",
        "Insufficient permissions to upload media",
      );
      return await saveRemoteMediaUrls({
        urls,
        folder,
        userId: String(user._id),
        tenantId: (event.locals.tenantId as DatabaseId | null) ?? null,
      });
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Upload failed") };
    }
  },
);
