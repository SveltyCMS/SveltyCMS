/**
 * @file src/routes/(app)/[language]/[...collection]/collection.remote.ts
 * @description Collection editor remotes — LocalCMS, no HTTP hop.
 */

import { getRequestEvent, query } from "$app/server";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { getRequestLocalCMS, remoteErrorMessage } from "@utils/server/request-cms.server";

export const saveEntry = query(
  "unchecked",
  async ({
    collectionId,
    data,
    entryId,
  }: {
    collectionId: string;
    data: Record<string, unknown>;
    tenantId?: string;
    entryId?: string;
  }): Promise<{
    success: boolean;
    entryId?: string;
    data?: Record<string, unknown>;
    error?: string;
  }> => {
    try {
      const event = getRequestEvent();
      const user = getAuthenticatedUser(event.locals);
      const { cms, tenantId } = await getRequestLocalCMS();
      const opts = { user, tenantId: tenantId as never };
      const result = entryId
        ? await cms.collections.update(collectionId, entryId, data, opts)
        : await cms.collections.create(collectionId, data, opts);
      if (!result?.success) {
        return { success: false, error: result?.message || "Save failed" };
      }
      const saved = (result.data ?? result) as Record<string, unknown> | undefined;
      return {
        success: true,
        entryId: (saved?._id as string | undefined) ?? entryId,
        data: saved,
      };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Save failed") };
    }
  },
);

export const deleteEntry = query(
  "unchecked",
  async ({
    collectionId,
    entryId,
  }: {
    collectionId: string;
    entryId: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const event = getRequestEvent();
      const user = getAuthenticatedUser(event.locals);
      const { cms, tenantId } = await getRequestLocalCMS();
      const result = await cms.collections.delete(collectionId, entryId, {
        user,
        tenantId: tenantId as never,
      });
      if (!result?.success) {
        return { success: false, error: result?.message || "Delete failed" };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Delete failed") };
    }
  },
);
