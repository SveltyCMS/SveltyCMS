/**
 * @file src/utils/entry-autosave.ts
 * @description Builds the navigation-guard autosave payload without demoting live entries.
 *
 * ### Features:
 * - New entries are saved as `draft`
 * - Existing entries keep their loaded status instead of being forced to `draft`
 * - A loaded schedule timestamp is preserved; one added only in the form is dropped
 */

/** Build the payload used by the editor's navigation-guard autosave. */
export function buildAutosavePayload(
  entryData: Record<string, unknown>,
  loadedData: Record<string, unknown> | null,
  now: string,
): Record<string, unknown> {
  if (!entryData._id) {
    return { ...entryData, status: "draft", updatedAt: now };
  }

  const payload: Record<string, unknown> = {
    ...entryData,
    status: loadedData?.status ?? entryData.status ?? "draft",
    updatedAt: now,
  };

  // Autosave must never introduce a schedule that has no job behind it. Keep
  // the loaded timestamp only when the persisted entry already had one.
  if (loadedData && Object.hasOwn(loadedData, "_scheduled")) {
    payload._scheduled = loadedData._scheduled;
  } else {
    delete payload._scheduled;
  }
  delete payload._scheduledBy;

  return payload;
}
