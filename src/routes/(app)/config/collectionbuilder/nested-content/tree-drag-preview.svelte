<script lang="ts">
  import Portal from "@components/ui/portal.svelte";
  import { dndState } from "@thisux/sveltednd";

  const RETURN_MS = 200;

  let cursorX = $state(0);
  let cursorY = $state(0);
  let hasPointer = $state(false);
  let originX = $state(0);
  let originY = $state(0);
  let dismissed = $state(false);
  let returning = $state(false);
  let returnTimer: ReturnType<typeof setTimeout> | null = null;
  let snapName = $state("");

  interface TreeDragData {
    itemId: string;
  }

  const isActive = $derived(dndState.isDragging && dndState.sourceContainer === "tree");
  const dragData = $derived(dndState.draggedItem as TreeDragData | null);

  const visible = $derived((isActive && hasPointer && !dismissed) || returning);

  // Latest pointer position, committed to reactive state at most once per frame.
  // `pointermove` can fire faster than the display refreshes (and on touch it is
  // coalesced into bursts), so writing $state per event re-rendered the chip
  // several times for a single painted frame — wasted work on mobile CPUs.
  let rafId: number | null = null;
  let nextX = 0;
  let nextY = 0;

  function commitPointer() {
    rafId = null;
    if (returning) return;
    hasPointer = true;
    cursorX = nextX;
    cursorY = nextY;
  }

  function trackPointer(clientX: number, clientY: number) {
    if (returning) return;
    nextX = clientX;
    nextY = clientY;
    rafId ??= requestAnimationFrame(commitPointer);
  }

  function handlePointerMove(e: PointerEvent) { trackPointer(e.clientX, e.clientY); }
  function handleDragOver(e: DragEvent) { if (e.clientX && e.clientY) trackPointer(e.clientX, e.clientY); }

  $effect(() => {
    if (isActive) {
      dismissed = false;
      returning = false;
      if (returnTimer) {
        clearTimeout(returnTimer);
        returnTimer = null;
      }
      
      if (dragData?.itemId) {
          // Just get the DOM element text
          const el = document.querySelector(`[data-item-id="${CSS.escape(dragData.itemId)}"] .truncate`);
          snapName = el?.textContent || "Item";
      }

      const activeEl = dragData?.itemId
        ? document.querySelector(`[data-item-id="${CSS.escape(dragData.itemId)}"]`)
        : null;
      if (activeEl) {
        const rect = activeEl.getBoundingClientRect();
        originX = rect.left;
        originY = rect.top;
      }
      
      document.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.addEventListener("dragover", handleDragOver, { passive: true });
    } else {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("dragover", handleDragOver);
      
      if (visible && !dismissed && !returning) {
        returning = true;
        returnTimer = setTimeout(() => {
          returning = false;
          dismissed = true;
          hasPointer = false;
        }, RETURN_MS);
      } else {
        hasPointer = false;
      }
    }
    
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("dragover", handleDragOver);
      if (returnTimer) clearTimeout(returnTimer);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  });

  const style = $derived(
    returning
      ? `transform: translate3d(${originX}px, ${originY}px, 0); transition: transform ${RETURN_MS}ms cubic-bezier(0.2, 0, 0, 1), opacity ${RETURN_MS}ms; opacity: 0;`
      : `transform: translate3d(${cursorX + 16}px, ${cursorY + 16}px, 0); transition: none; opacity: 1;`
  );
</script>

{#if visible}
  <Portal>
    <div
      class="fixed inset-0 pointer-events-none z-[9999]"
      aria-hidden="true"
    >
      <div
        class="absolute top-0 start-0 flex items-center gap-2 bg-surface-500/10 dark:bg-surface-700 border-s-4 border-s-primary-500 border-surface-500/40 p-2 rounded shadow-lg min-w-[150px] will-change-transform"
        {style}
      >
        <span class="truncate font-medium">{snapName}</span>
      </div>
    </div>
  </Portal>
{/if}
