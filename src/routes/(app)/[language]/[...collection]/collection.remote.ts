/**
 * @file src/routes/(app)/[language]/[...collection]/collection.remote.ts
 * @description Collection Editor Remote Functions — typed CRUD without URL construction.
 *
 * All exports are SvelteKit query() wrappers per .remote.ts requirements.
 * Eliminates endpoint string building (isNew ? POST : PUT) and manual JSON parsing.
 */

import { query } from "$app/server";

export const saveEntry = query(
  "unchecked",
  async ({
    collectionId,
    data,
    tenantId,
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
    const isNew = !entryId;
    const endpoint = isNew
      ? `/api/collections/${collectionId}`
      : `/api/collections/${collectionId}/${entryId}`;
    const method = isNew ? "POST" : "PUT";

    const r = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, tenantId }),
    });
    const d = await r.json();
    return r.ok
      ? { success: true, entryId: d.data?._id, data: d.data }
      : { success: false, error: d.message };
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
