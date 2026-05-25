/**
 * @file src/routes/(app)/[language]/[...collection]/collection.remote.ts
 * @description Collection Editor Remote Functions — typed CRUD without URL construction.
 *
 * Eliminates endpoint string building (isNew ? POST : PUT) and manual JSON parsing.
 */

export interface SaveEntryResult {
  success: boolean;
  entryId?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export async function saveEntry(
  collectionId: string,
  data: Record<string, unknown>,
  tenantId?: string,
  entryId?: string,
): Promise<SaveEntryResult> {
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
}

export async function deleteEntry(
  collectionId: string,
  entryId: string,
): Promise<{ success: boolean; error?: string }> {
  const r = await fetch(`/api/collections/${collectionId}/${entryId}`, { method: "DELETE" });
  const d = await r.json();
  return r.ok ? { success: true } : { success: false, error: d.message };
}
