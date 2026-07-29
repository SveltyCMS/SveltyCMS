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
 * Transport is @thisux/sveltednd (use:draggable / use:droppable) — dragData
 * travels in-memory via dndState, not a custom DataTransfer MIME type.
 *
 * ### Features:
 * - Windows-style multi-select drag payload
 * - Shared POST /api/media/move client for all drop targets
 */

/** Shared container id for all media drag sources (grid + table items). */
export const MEDIA_DRAG_CONTAINER = "media-gallery-items";

export interface MediaDragPreview {
  filename: string;
  url?: string;
  type?: string;
}

export interface MediaDragData {
  ids: string[];
  preview?: MediaDragPreview;
}

// A 1×1 transparent canvas is a valid HTML5 drag image and, unlike an <img>,
// needs no network fetch/decode — it's ready the instant it's created. A 0×0
// canvas is NOT valid: browsers reject it and fall back to their own ghost
// (on macOS often a small globe/document icon under the cursor).
// Must live in the document — Chromium silently ignores setDragImage for
// detached nodes and shows that same fallback icon.
const emptyDragImage: HTMLCanvasElement | null = (() => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1";
  return canvas;
})();

/**
 * Hides the browser's default HTML5 drag ghost (a screenshot of the dragged
 * element, offset wherever the pointer happened to grab it). Wire to
 * `ondragstart` alongside `use:draggable` so `MediaDragPreview` (a custom,
 * cursor-anchored overlay) is the only visible drag image.
 *
 * Safe to call from a capture-phase `dragstart` listener (preferred) so it
 * runs before any other handler can replace the drag image.
 */
export function suppressNativeDragGhost(event: DragEvent): void {
  if (!event.dataTransfer || !emptyDragImage) return;
  if (!emptyDragImage.isConnected) {
    document.body.appendChild(emptyDragImage);
  }
  event.dataTransfer.setDragImage(emptyDragImage, 0, 0);
}

export interface MoveMediaResult {
  movedCount: number;
  fileIds: string[];
  targetFolderId: string | null;
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

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.csrfToken) headers["X-CSRF-Token"] = options.csrfToken;

  const res = await fetch("/api/media/move", {
    method: "POST",
    headers,
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
