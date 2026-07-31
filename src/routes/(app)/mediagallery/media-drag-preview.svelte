<!--
@file src/routes/(app)/mediagallery/media-drag-preview.svelte
@component
**Custom cursor-anchored drag preview for the media gallery**

Tracks `pointermove` as well as `dragover`, so it follows a finger on touch
just as it follows the cursor on desktop. Rendered `pointer-events-none` at
`z-[9999]` so it paints above the mobile sidebar drawer without ever
intercepting `elementFromPoint` hit-testing.

`@thisux/sveltednd` has no cursor-following ghost of its own on the native
HTML5 path — the browser draws its default drag image (a screenshot of the
dragged element) instead. Sources suppress that default via
`suppressNativeDragGhost` (see `media-dnd.ts`) and this component renders our
own preview instead: thumbnail above the cursor, count badge to its right.

Mount once per page that hosts media drag sources.
-->

<script lang="ts">
  import Badge from "@components/ui/badge.svelte";
  import Portal from "@components/ui/portal.svelte";
  import { dndState } from "@thisux/sveltednd";
  import {
    MEDIA_DRAG_CONTAINER,
    suppressNativeDragGhost,
    type MediaDragData,
  } from "@utils/media/media-dnd";

  const CARD_SIZE = 120;
  const CARD_GAP = 12; // space between card bottom and cursor
  const BADGE_GAP = 16; // space between cursor and badge (badge sits to the right)
  const EDGE = 12;
  const RETURN_MS = 200;

  let cursorX = $state(0);
  let cursorY = $state(0);
  let hasPointer = $state(false);
  let originX = $state(0);
  let originY = $state(0);
  /** Hide immediately after a valid drop, or after the cancel-return finishes. */
  let dismissed = $state(false);
  /** Animate back to the source item when released outside a drop target. */
  let returning = $state(false);
  let returnTimer: ReturnType<typeof setTimeout> | null = null;
  // Snapshot while dragging — dndState clears on dragend before the return finishes.
  let snapPreview = $state<MediaDragData["preview"]>(undefined);
  let snapCount = $state(0);
  /** True when the preview <img> 404s / fails — match grid's image-off placeholder. */
  let imgFailed = $state(false);

  const isActive = $derived(dndState.isDragging && dndState.sourceContainer === MEDIA_DRAG_CONTAINER);
  const dragData = $derived(dndState.draggedItem as MediaDragData | null);

  // Don't paint until we have a real pointer — avoids the top-left flash when
  // sveltednd sets isDragging on pointerdown before the first move/dragover.
  const visible = $derived((isActive && hasPointer && !dismissed) || returning);

  function trackPointer(clientX: number, clientY: number) {
    if (returning) return;
    cursorX = clientX;
    cursorY = clientY;
    hasPointer = true;
  }

  function captureOrigin() {
    const id = dragData?.ids?.[0];
    if (!id || typeof document === "undefined") return;
    const el = document.querySelector(`[data-media-id="${CSS.escape(id)}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    originX = rect.left + rect.width / 2;
    originY = rect.top + rect.height / 2;
  }

  function finish() {
    returnTimer = null;
    returning = false;
    dismissed = true;
    hasPointer = false;
    snapPreview = undefined;
    snapCount = 0;
    imgFailed = false;
  }

  function onRelease() {
    if (dismissed || returning) return;
    // Click / aborted gesture with no real drag — nothing to animate.
    if (!hasPointer) {
      dismissed = true;
      return;
    }
    // Valid folder/breadcrumb under the cursor → drop handled; hide immediately.
    if (dndState.targetContainer) {
      dismissed = true;
      return;
    }
    // Cancelled: enable transition, then move to origin on the next frame so
    // the browser interpolates from the drop point (same-tick updates skip CSS).
    returning = true;
    requestAnimationFrame(() => {
      cursorX = originX;
      cursorY = originY;
      returnTimer = setTimeout(finish, RETURN_MS);
    });
  }

  function onDragStart(event: DragEvent) {
    // Capture phase on document — kills the native ghost (globe/icon) before
    // any target handler can leave the browser's default drag image in place.
    suppressNativeDragGhost(event);
    trackPointer(event.clientX, event.clientY);
  }

  function onDragOver(event: DragEvent) {
    trackPointer(event.clientX, event.clientY);
    // Accept the drag everywhere while active so the browser doesn't play its
    // own snap-back / "not allowed" cursor and delay dragend.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  }

  function onPointerMove(event: PointerEvent) {
    trackPointer(event.clientX, event.clientY);
  }

  $effect(() => {
    if (!isActive) return;
    dismissed = false;
    returning = false;
    hasPointer = false;
    snapPreview = dragData?.preview;
    snapCount = dragData?.ids?.length ?? 0;
    imgFailed = false;
    if (returnTimer) {
      clearTimeout(returnTimer);
      returnTimer = null;
    }
    captureOrigin();

    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("drop", onRelease, true);
    document.addEventListener("pointerup", onRelease, true);
    document.addEventListener("dragend", onRelease, true);

    return () => {
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("drop", onRelease, true);
      document.removeEventListener("pointerup", onRelease, true);
      document.removeEventListener("dragend", onRelease, true);
    };
  });

  const cardX = $derived.by(() => {
    if (typeof window === "undefined") return cursorX;
    const half = CARD_SIZE / 2;
    return Math.min(Math.max(cursorX, half + EDGE), window.innerWidth - half - EDGE);
  });

  const cardY = $derived.by(() => {
    if (typeof window === "undefined") return cursorY;
    return Math.min(Math.max(cursorY, CARD_SIZE + CARD_GAP + EDGE), window.innerHeight - EDGE);
  });

  const badgeX = $derived.by(() => {
    if (typeof window === "undefined") return cursorX + BADGE_GAP;
    return Math.min(cursorX + BADGE_GAP, window.innerWidth - EDGE);
  });

  const badgeY = $derived.by(() => {
    if (typeof window === "undefined") return cursorY;
    return Math.min(Math.max(cursorY, EDGE), window.innerHeight - EDGE);
  });

  function fileIcon(type: string | undefined): string {
    switch (type) {
      case "video":
        return "fa-solid:video";
      case "audio":
        return "fa-solid:play-circle";
      case "image":
        return "mdi:image-off-outline";
      default:
        return "mdi:file-outline";
    }
  }

  const showImage = $derived(
    snapPreview?.type === "image" && !!snapPreview.url && !imgFailed,
  );
</script>

{#if visible}
  <Portal>
    <div class="pointer-events-none fixed inset-0 z-[9999]" aria-hidden="true">
      <!-- Thumbnail: rounded-lg like gallery tiles; no hard .card border (those look sharp mid-drag) -->
      <div
        class="media-checkerboard absolute overflow-hidden rounded-lg shadow-lg {returning
          ? 'transition-[left,top] duration-200 ease-out'
          : ''}"
        style:left="{cardX}px"
        style:top="{cardY}px"
        style:width="{CARD_SIZE}px"
        style:transform="translate(-50%, calc(-100% - {CARD_GAP}px))"
      >
        <div class="aspect-square w-full overflow-hidden">
          {#if showImage}
            <img
              src={snapPreview?.url}
              alt=""
              class="h-full w-full object-cover"
              draggable="false"
              crossorigin="anonymous"
              onerror={() => (imgFailed = true)}
            />
          {:else}
            <div
              class="flex h-full w-full items-center justify-center bg-surface-100/80 dark:bg-surface-800/80"
            >
              <iconify-icon
                icon={fileIcon(snapPreview?.type)}
                width="36"
                class="text-surface-400 dark:text-surface-500"
              ></iconify-icon>
            </div>
          {/if}
        </div>
      </div>

      <!-- Count bar: right of the cursor — warning yellow, button-like radius (not pill) -->
      {#if snapCount > 0}
        <div
          class="absolute {returning ? 'transition-[left,top] duration-200 ease-out' : ''}"
          style:left="{badgeX}px"
          style:top="{badgeY}px"
          style:transform="translateY(-50%)"
        >
          <Badge variant="warning" size="sm" rounded={false} class="normal-case tracking-normal">
            {snapCount > 1 ? `+${snapCount - 1}` : "1 file"}
          </Badge>
        </div>
      {/if}
    </div>
  </Portal>
{/if}

<style>
  /* Same checkerboard as media-grid tiles so missing previews match the gallery. */
  .media-checkerboard {
    background-color: var(--color-surface-100);
    background-image:
      linear-gradient(45deg, var(--color-surface-200) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-surface-200) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-surface-200) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-surface-200) 75%);
    background-size: 12px 12px;
    background-position:
      0 0,
      0 6px,
      6px -6px,
      -6px 0;
  }

  :global(.dark) .media-checkerboard {
    background-color: var(--color-surface-900);
    background-image:
      linear-gradient(45deg, var(--color-surface-800) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-surface-800) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-surface-800) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-surface-800) 75%);
  }
</style>
