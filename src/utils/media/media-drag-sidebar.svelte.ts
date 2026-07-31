/**
 * @file src/utils/media/media-drag-sidebar.svelte.ts
 * @description
 * Opens the left-sidebar overlay drawer on mobile while a media drag is in
 * flight, so the folder tree — the same drop target desktop uses — is reachable
 * without a separate mobile DnD surface.
 *
 * The drawer's previous visibility is remembered and restored the moment the
 * drag ends. On mobile that previous value is `hidden`, so a completed move
 * closes the drawer by itself; a cancelled drag leaves the UI exactly as it was.
 *
 * ### Features:
 * - single source of truth for drag-driven sidebar visibility
 * - restore-on-end, so cancel and drop share one code path
 */

import { untrack } from "svelte";
import { mediaFolderTree } from "@src/stores/media-folder-tree.svelte.ts";
import { screen } from "@src/stores/screen-size-store.svelte.ts";
import { ui, type UIVisibility } from "@src/stores/ui-store.svelte.ts";

/**
 * Wire the drawer to a media drag. Call once from a component's `<script>`;
 * it installs an `$effect`, so it must run during component init.
 *
 * @param isMediaDragActive - reads the gallery's drag flag reactively
 */
export function useMediaDragSidebar(isMediaDragActive: () => boolean): void {
  /** Visibility to put back when the drag ends; null when we haven't opened it. */
  let restoreTo: UIVisibility | null = null;

  // The drawer is unmounted on mobile until we open it, so its folder tree would
  // otherwise start fetching mid-drag. Warm the shared store up front (deduped)
  // so the drawer springs open already populated.
  $effect(() => {
    untrack(() => void mediaFolderTree.ensureLoaded());
  });

  $effect(() => {
    const dragging = isMediaDragActive();
    const isMobile = screen.isMobile;

    // ui.state is written here and read on the next run — untrack keeps this
    // effect depending on the drag flag alone rather than re-firing on itself.
    untrack(() => {
      if (dragging && isMobile) {
        if (restoreTo === null) {
          restoreTo = ui.state.leftSidebar;
          ui.toggle("leftSidebar", "full");
        }
        return;
      }
      if (restoreTo !== null) {
        ui.toggle("leftSidebar", restoreTo);
        restoreTo = null;
      }
    });
  });
}
