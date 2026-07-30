<!--
@file src/routes/(app)/mediagallery/media-drag-folder-rail.svelte
@component
**Mobile Lift & Carry folder rail**

Shown while a media item is being dragged on a mobile viewport. Lists the
current folder level; hovering a row with children spring-loads into that
folder (same behaviour as the mobile DnD prototype). Drop uses the shared
`moveMediaToFolder` API via `use:droppable`.

### Props
- `activeFolderId` (string): folder currently open in the gallery (`root` or id).

### Features:
- max-width side panel, app theme tokens
- spring-load drill-in / climb-out on hover
- sveltednd auto-scroll on the list edges
-->

<script lang="ts">
  import { untrack } from "svelte";
  import Portal from "@components/ui/portal.svelte";
  import { media_root_title } from "@src/paraglide/messages";
  import { mediaFolderTree } from "@src/stores/media-folder-tree.svelte.ts";
  import { page } from "$app/state";
  import { droppable, dndState, type DragDropState } from "@thisux/sveltednd";
  import {
    MEDIA_DRAG_CONTAINER,
    MEDIA_DROP_OK,
    MEDIA_DROP_SAME,
    moveMediaToFolder,
    type MediaDragData,
  } from "@utils/media/media-dnd";
  import { logger } from "@utils/logger";
  import { toast } from "@src/stores/toast.svelte.ts";
  import { screen } from "@src/stores/screen-size-store.svelte.ts";

  interface Props {
    activeFolderId?: string;
  }

  let { activeFolderId = "root" }: Props = $props();

  /** Hold over a row with children (or ↑ back) before drilling — matches prototype. */
  const SPRING_MS = 500;
  /** Scroll step per frame past the rail edge — same as sveltednd's own max speed,
   *  so its inside-the-panel ramp and our outside-the-panel scroll are continuous. */
  const EDGE_SCROLL_STEP = 15;

  let railLevel = $state("root");
  let railScrollEl = $state<HTMLDivElement | null>(null);
  let springTimer: ReturnType<typeof setTimeout> | null = null;
  let hoveredId = $state<string | null>(null);
  let isMoving = $state(false);
  let pointerX = 0;
  let pointerY = 0;
  let rafId: number | null = null;
  let lastScrollTop = -1;

  const isActive = $derived(
    screen.isMobile &&
      dndState.isDragging &&
      dndState.sourceContainer === MEDIA_DRAG_CONTAINER,
  );

  const railFolders = $derived(mediaFolderTree.childrenOf(railLevel));
  const pathLabel = $derived.by(() => {
    const chain = mediaFolderTree.pathOf(railLevel);
    if (chain.length === 0) return media_root_title().toUpperCase();
    return [media_root_title(), ...chain.map((n) => n.name)].join(" › ").toUpperCase();
  });
  const backName = $derived.by(() => {
    if (railLevel === "root") return "";
    const parentId = mediaFolderTree.parentLevelOf(railLevel);
    if (parentId === "root") return media_root_title();
    return mediaFolderTree.getFolder(parentId)?.name ?? media_root_title();
  });

  function clearSpring() {
    if (springTimer) {
      clearTimeout(springTimer);
      springTimer = null;
    }
  }

  function springInto(id: string) {
    const next = id === "__up" ? mediaFolderTree.parentLevelOf(railLevel) : id;
    railLevel = next;
    hoveredId = null;
    clearSpring();
    if (railScrollEl) railScrollEl.scrollTop = 0;
  }

  function scheduleSpring(id: string | null) {
    clearSpring();
    if (!id) return;
    const springable =
      id === "__up"
        ? railLevel !== "root"
        : mediaFolderTree.childrenOf(id).length > 0;
    if (!springable) return;
    springTimer = setTimeout(() => springInto(id), SPRING_MS);
  }

  function onRowEnter(id: string) {
    if (hoveredId === id) return;
    hoveredId = id;
    scheduleSpring(id);
  }

  function onRowLeave(id: string) {
    if (hoveredId !== id) return;
    hoveredId = null;
    clearSpring();
  }

  /**
   * ↑ back is not a droppable (release cancels). Touch won't fire pointerenter
   * under the finger, so we resolve hover with elementFromPoint — same trick
   * sveltednd uses for droppable hit-testing.
   */
  function trackUpHover(clientX: number, clientY: number) {
    if (railLevel === "root") {
      if (hoveredId === "__up") onRowLeave("__up");
      return;
    }
    const el = document.elementFromPoint(clientX, clientY);
    const overUp = !!el?.closest?.('[data-folder="__up"]');
    if (overUp) onRowEnter("__up");
    else if (hoveredId === "__up") onRowLeave("__up");
  }

  async function handleDrop(
    state: DragDropState<MediaDragData>,
    folderId: string,
  ): Promise<void> {
    const ids = state.draggedItem?.ids ?? [];
    if (!ids.length) {
      toast.error("No media to move");
      return;
    }

    const currentId = activeFolderId === "root" ? null : activeFolderId;
    const targetId = folderId === "root" ? null : folderId;
    if (currentId === targetId) {
      toast.info("Already in this folder");
      return;
    }

    if (isMoving) return;
    isMoving = true;
    try {
      const moved = await moveMediaToFolder(ids, targetId, {
        csrfToken: page.data.csrfToken,
      });
      const folderLabel =
        folderId === "root"
          ? media_root_title()
          : (mediaFolderTree.getFolder(folderId)?.name ?? "folder");
      toast.success(
        moved.movedCount === 1
          ? `Moved 1 item to ${folderLabel}`
          : `Moved ${moved.movedCount} items to ${folderLabel}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Move failed";
      toast.error(message);
      logger.error("[MediaDragFolderRail] Move error:", err);
    } finally {
      isMoving = false;
    }
  }

  /**
   * Per-frame rail upkeep while dragging.
   *
   * sveltednd's auto-scroll only acts while the pointer is *inside* a scrollable
   * box, so dragging past the rail's top/bottom edge stopped scrolling entirely.
   * We cover just that outside-the-box region — the library still owns the
   * inside-the-box ramp, and since it reaches full speed exactly at the edge the
   * two meet without a jump.
   *
   * The second half fixes the "laggy" highlight: while the list scrolls under a
   * stationary finger no pointermove fires, so droppable hit-testing never
   * re-runs and the highlight sticks to a row that has already scrolled away.
   * Replaying a pointermove whenever scrollTop actually moved keeps the hovered
   * row, the spring timer and the drop target in sync with what's under the finger.
   */
  function tickRail() {
    const el = railScrollEl;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (pointerY < rect.top) {
        el.scrollBy({ top: -EDGE_SCROLL_STEP, behavior: "instant" });
      } else if (pointerY > rect.bottom) {
        el.scrollBy({ top: EDGE_SCROLL_STEP, behavior: "instant" });
      }

      if (el.scrollTop !== lastScrollTop) {
        lastScrollTop = el.scrollTop;
        document.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            clientX: pointerX,
            clientY: pointerY,
            pointerType: "touch",
            isPrimary: true,
          }),
        );
      }
    }
    rafId = requestAnimationFrame(tickRail);
  }

  // Load folders once they're needed (kept out of the listener effect so a
  // folder fetch doesn't tear down and re-add the drag listeners mid-drag).
  // untrack + ensureLoaded keep this depending on isActive alone: reading the
  // store's own state here would re-fire the effect off its own fetch.
  $effect(() => {
    if (!isActive) return;
    untrack(() => void mediaFolderTree.ensureLoaded());
  });

  // Reset rail when a drag starts or ends; track pointer + edge scroll while active
  $effect(() => {
    if (!isActive) {
      clearSpring();
      railLevel = "root";
      hoveredId = null;
      return;
    }

    const onMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      trackUpHover(e.clientX, e.clientY);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    lastScrollTop = -1;
    rafId = requestAnimationFrame(tickRail);

    return () => {
      document.removeEventListener("pointermove", onMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      clearSpring();
    };
  });
</script>

{#if isActive}
  <Portal>
    <aside
      class="pointer-events-auto fixed inset-s-0 top-24 z-[9998] flex max-h-[min(70vh,520px)] w-[min(70vw,220px)] flex-col rounded-e-2xl border border-s-0 border-surface-300 bg-surface-50 shadow-xl dark:border-surface-600 dark:bg-surface-900"
      aria-label="Move to folder"
      data-testid="media-drag-folder-rail"
    >
      <div
        class="truncate px-3 pb-2 pt-3 text-[10px] font-medium tracking-wider text-surface-500 dark:text-surface-400"
        title={pathLabel}
      >
        {pathLabel}
      </div>

      {#if railLevel !== "root"}
        <div
          role="listitem"
          class="mx-2 mb-1 flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2.5 text-sm
            {hoveredId === '__up'
              ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400'
              : 'border-surface-300 text-surface-500 dark:border-surface-600 dark:text-surface-400'}"
          data-folder="__up"
        >
          <iconify-icon icon="mdi:arrow-up" width="16" aria-hidden="true"></iconify-icon>
          <span class="truncate">{backName}</span>
        </div>
      {/if}

      <div
        bind:this={railScrollEl}
        class="flex flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-3"
        role="list"
        aria-label="Folders"
      >
        {#if railLevel === "root"}
          {@const rootSame = activeFolderId === "root"}
          {@const rootHighlight = dndState.targetContainer === "root"}
          <div
            role="listitem"
            class="flex items-center gap-2 rounded-lg px-2.5 py-2.5 text-sm font-medium
              {rootHighlight
                ? rootSame
                  ? 'text-error-600 dark:text-error-400'
                  : 'text-surface-900 dark:text-surface-50'
                : 'text-surface-700 dark:text-surface-200'}"
            use:droppable={{
              container: "root",
              attributes: {
                dragOverClass: rootSame ? MEDIA_DROP_SAME : MEDIA_DROP_OK,
              },
              callbacks: {
                onDrop: (state: DragDropState<MediaDragData>) =>
                  handleDrop(state, "root"),
              },
            }}
            data-media-drop-target="root"
            data-folder="root"
          >
            <iconify-icon
              icon={rootHighlight ? "mdi:folder-move-outline" : "mdi:home-outline"}
              width="18"
              class="shrink-0 {rootHighlight
                ? rootSame
                  ? 'text-error-500'
                  : 'text-primary-500'
                : 'text-surface-400'}"
              aria-hidden="true"
            ></iconify-icon>
            <span class="min-w-0 flex-1 truncate">{media_root_title()}</span>
          </div>
        {/if}

        {#each railFolders as folder (folder.id)}
          {@const hasChildren = mediaFolderTree.childrenOf(folder.id).length > 0}
          {@const sameFolder = activeFolderId === folder.id}
          {@const dropHighlight = dndState.targetContainer === folder.id}
          <div
            role="listitem"
            class="flex items-center gap-2 rounded-lg px-2.5 py-2.5 text-sm font-medium
              {dropHighlight
                ? sameFolder
                  ? 'text-error-600 dark:text-error-400'
                  : 'text-surface-900 dark:text-surface-50'
                : 'text-surface-700 dark:text-surface-200'}"
            use:droppable={{
              container: folder.id,
              attributes: {
                dragOverClass: sameFolder ? MEDIA_DROP_SAME : MEDIA_DROP_OK,
              },
              callbacks: {
                onDrop: (state: DragDropState<MediaDragData>) =>
                  handleDrop(state, folder.id),
                onDragEnter: () => onRowEnter(folder.id),
                onDragLeave: () => onRowLeave(folder.id),
              },
            }}
            data-media-drop-target={folder.id}
            data-folder={folder.id}
          >
            <iconify-icon
              icon={dropHighlight ? "mdi:folder-move-outline" : "mdi:folder-outline"}
              width="18"
              class="shrink-0 {dropHighlight
                ? sameFolder
                  ? 'text-error-500'
                  : 'text-primary-500'
                : 'text-surface-400'}"
              aria-hidden="true"
            ></iconify-icon>
            <span class="min-w-0 flex-1 truncate">{folder.name}</span>
            {#if dropHighlight && !sameFolder}
              <span class="shrink-0 font-mono text-[11px] text-primary-500">
                +{((dndState.draggedItem as MediaDragData | null)?.ids?.length ?? 1)}
              </span>
            {/if}
            {#if hasChildren}
              <iconify-icon
                icon="mdi:chevron-right"
                width="16"
                class="shrink-0 {dropHighlight && !sameFolder
                  ? 'text-primary-500'
                  : 'text-surface-400'}"
                aria-hidden="true"
              ></iconify-icon>
            {/if}
          </div>
        {/each}

        {#if railFolders.length === 0 && railLevel !== "root"}
          <p class="px-2 py-4 text-center text-xs text-surface-500">No subfolders</p>
        {/if}
      </div>
    </aside>
  </Portal>
{/if}
