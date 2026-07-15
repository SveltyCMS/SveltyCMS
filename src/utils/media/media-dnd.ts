/**
 * @file src/utils/media/media-dnd.ts
 * @description
 * Shared drag-and-drop helpers for moving media into virtual folders.
 *
 * Drop targets (equivalent on desktop and mobile):
 * - Left-sidebar virtual folder tree
 * - Gallery breadcrumb ancestors
 *
 * Both call the same move API with the same multi-id payload.
 *
 * ### Features:
 * - Custom MIME type isolated from folder reorder and OS file drops
 * - Windows-style multi-select drag payload
 * - Shared POST /api/media/move client for all drop targets
 */

/** Custom MIME used by media grid/table → folder tree / breadcrumb drag operations */
export const MEDIA_DND_MIME = "application/x-sveltycms-media-ids";

/** Document-level class while a media drag is active (optional CSS hooks) */
export const MEDIA_DND_ACTIVE_CLASS = "media-dnd-active";

export interface MediaDragPayload {
  ids: string[];
}

export interface MoveMediaResult {
  movedCount: number;
  fileIds: string[];
  targetFolderId: string | null;
}

export function serializeMediaDragPayload(ids: string[]): string {
  const unique = [...new Set(ids.filter(Boolean))];
  return JSON.stringify({ ids: unique } satisfies MediaDragPayload);
}

export function parseMediaDragPayload(raw: string | null | undefined): MediaDragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MediaDragPayload;
    if (!parsed || !Array.isArray(parsed.ids)) return null;
    const ids = parsed.ids.filter((id): id is string => typeof id === "string" && id.length > 0);
    return ids.length ? { ids } : null;
  } catch {
    return null;
  }
}

/** True when the drag event carries our media payload (types list is available on dragover). */
export function hasMediaDrag(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes(MEDIA_DND_MIME);
}

export function getMediaDragPayload(
  dataTransfer: DataTransfer | null | undefined,
): MediaDragPayload | null {
  if (!dataTransfer) return null;
  return parseMediaDragPayload(dataTransfer.getData(MEDIA_DND_MIME));
}

/**
 * Windows Explorer–style drag IDs:
 * if the dragged item is in the selection, move the whole selection; else only that item.
 */
export function resolveMediaDragIds(
  draggedId: string,
  selectedIds: Iterable<string> | null | undefined,
): string[] {
  if (!draggedId) return [];
  const selected = selectedIds ? [...selectedIds].filter(Boolean) : [];
  if (selected.length > 0 && selected.includes(draggedId)) {
    return [...new Set(selected)];
  }
  return [draggedId];
}

/**
 * Write the media move payload onto a DataTransfer and optional multi-item ghost.
 * Returns the ids written (empty if drag should be cancelled).
 */
export function beginMediaDrag(
  dataTransfer: DataTransfer | null | undefined,
  ids: string[],
): string[] {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!dataTransfer || unique.length === 0) return [];

  dataTransfer.effectAllowed = "move";
  dataTransfer.setData(MEDIA_DND_MIME, serializeMediaDragPayload(unique));
  // Fallback for environments that only expose text/plain during dragover
  dataTransfer.setData("text/plain", unique.join(","));

  if (
    unique.length > 1 &&
    typeof document !== "undefined" &&
    typeof document.createElement === "function" &&
    document.body
  ) {
    const ghost = document.createElement("div");
    ghost.textContent = `${unique.length} items`;
    ghost.style.cssText =
      "position:absolute;top:-9999px;padding:6px 10px;border-radius:8px;background:rgba(0,0,0,0.8);color:#fff;font:600 12px/1.2 system-ui,sans-serif;pointer-events:none;";
    document.body.appendChild(ghost);
    dataTransfer.setDragImage(ghost, 24, 16);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => ghost.remove());
    } else {
      ghost.remove();
    }
  }

  const root = typeof document !== "undefined" ? document.documentElement : null;
  root?.classList?.add(MEDIA_DND_ACTIVE_CLASS);

  return unique;
}

export function endMediaDrag(): void {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  root?.classList?.remove(MEDIA_DND_ACTIVE_CLASS);
}

/**
 * Move media assets into a virtual folder (or root when targetFolderId is null).
 * Dispatches a `mediaMoved` document event on success for gallery refresh.
 */
export async function moveMediaToFolder(
  fileIds: string[],
  targetFolderId: string | null,
  options: { csrfToken?: string | null } = {},
): Promise<MoveMediaResult> {
  const ids = [...new Set(fileIds.filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("No media to move");
  }

  const res = await fetch("/api/media/move", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": options.csrfToken ?? "",
    },
    body: JSON.stringify({
      fileIds: ids,
      targetFolderId,
    }),
  });

  const result = await res.json().catch(() => null);
  if (!res.ok || result?.success === false) {
    const msg = result?.message || result?.error?.message || "Failed to move media";
    throw new Error(msg);
  }

  const moved: MoveMediaResult = {
    movedCount: result?.data?.movedCount ?? ids.length,
    fileIds: result?.data?.fileIds ?? ids,
    targetFolderId:
      result?.data?.targetFolderId === undefined
        ? targetFolderId
        : (result.data.targetFolderId as string | null),
  };

  if (typeof document !== "undefined") {
    document.dispatchEvent(
      new CustomEvent("mediaMoved", {
        detail: {
          ids: moved.fileIds,
          targetFolderId: moved.targetFolderId,
          movedCount: moved.movedCount,
        },
      }),
    );
  }

  return moved;
}
