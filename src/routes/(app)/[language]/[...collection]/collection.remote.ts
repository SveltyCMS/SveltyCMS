/**
 * @file src/routes/(app)/[language]/[...collection]/collection.remote.ts
 * @description Collection Editor Remote Functions — typed CRUD without URL construction.
 *
 * All exports are SvelteKit query() wrappers per .remote.ts requirements.
 * Create uses POST; updates use PATCH (PUT is accepted as an alias).
 */

import { getRequestEvent, query } from "$app/server";

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
    const event = getRequestEvent();
    const isNew = !entryId;
    const endpoint = isNew
      ? `/api/collections/${collectionId}`
      : `/api/collections/${collectionId}/${entryId}`;
    const method = isNew ? "POST" : "PATCH";

    const r = await event.fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await r.json().catch(() => ({}));
    const saved = (d?.data ?? d) as Record<string, unknown> | undefined;
    return r.ok
      ? { success: true, entryId: saved?._id as string | undefined, data: saved }
      : { success: false, error: d.message || d.error };
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
    const r = await fetch(`/api/collections/${collectionId}/${entryId}`, {
      method: "DELETE",
    });
    const d = await r.json();
    return r.ok ? { success: true } : { success: false, error: d.message };
  },
);
