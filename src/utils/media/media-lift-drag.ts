/**
 * @file src/utils/media/media-lift-drag.ts
 * @description
 * "Lift & Carry" wrapper around sveltednd's `draggable` action for touch input.
 *
 * `draggable` starts a pointer drag on `pointerdown` and sets `touch-action: none`
 * on the node, which makes a touch device unable to scroll a list of draggables.
 * This action adds the press-and-hold gate the mobile UX needs, and then hands the
 * gesture back to sveltednd untouched so drop detection, drag state and auto-scroll
 * all stay the library's job — nothing here is reimplemented.
 *
 * Mouse/trackpad input is passed straight through to `draggable`, so desktop
 * behaviour is byte-for-byte unchanged.
 *
 * ### Features:
 * - hold-to-lift with movement cancel (a scroll gesture stays a scroll)
 * - re-dispatches the real pointerdown so sveltednd drives the actual drag
 * - keeps the node scrollable while idle (`touch-action` only set once lifted)
 */

import { draggable } from "@thisux/sveltednd";
import type { DraggableOptions } from "@thisux/sveltednd";

/** Press duration before the item lifts. Matches the mobile DnD prototype. */
const HOLD_MS = 200;
/** Movement (px) during the hold that cancels the lift and lets the list scroll. */
const MOVE_CANCEL_PX = 10;

/** Touch/pen input needs the hold gate; a mouse drags immediately as before. */
function needsHoldGate(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

/**
 * Svelte action: `draggable` with a press-and-hold gate on touch input.
 *
 * @param node - element to make draggable
 * @param options - forwarded verbatim to sveltednd's `draggable`
 */
export function liftAndCarry<T>(node: HTMLElement, options: DraggableOptions<T>) {
  let current = options;
  // Idle disabled so sveltednd leaves `touch-action` alone and the list scrolls.
  const inner = draggable(node, { ...current, disabled: true });

  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let lifted = false;
  let pending: PointerEvent | null = null;

  function setInnerDisabled(disabled: boolean) {
    inner.update({ ...current, disabled });
  }

  /** Block the browser's scroll/zoom once the item is lifted. */
  function onTouchMove(event: TouchEvent) {
    if (lifted) event.preventDefault();
  }

  function cancelHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    pending = null;
  }

  function lift() {
    if (!pending) return;
    const source = pending;
    holdTimer = null;
    pending = null;
    lifted = true;

    // Hand the gesture to sveltednd: enabling it and replaying the press makes
    // the library's own handlePointerDown run for real, so drag state, drop
    // dispatch and auto-scroll all come from the library rather than from here.
    setInnerDisabled(false);
    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: source.clientX,
        clientY: source.clientY,
        pointerId: source.pointerId,
        pointerType: source.pointerType,
        isPrimary: source.isPrimary,
        button: 0,
        buttons: 1,
      }),
    );

    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
  }

  function onPointerDown(event: PointerEvent) {
    if (current.disabled) return;
    if (!needsHoldGate(event.pointerType)) {
      // Mouse: keep sveltednd permanently enabled from here on.
      if (!lifted) {
        lifted = true;
        setInnerDisabled(false);
      }
      return;
    }
    if (lifted) return;

    startX = event.clientX;
    startY = event.clientY;
    pending = event;
    holdTimer = setTimeout(lift, HOLD_MS);

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(event: PointerEvent) {
    if (lifted || !pending) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_CANCEL_PX) {
      cancelHold();
    }
  }

  function onPointerUp() {
    cancelHold();
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
    if (!lifted) return;
    // Re-arm after sveltednd's own pointerup handler has finished the drop.
    setTimeout(() => {
      lifted = false;
      setInnerDisabled(true);
    }, 0);
  }

  node.addEventListener("pointerdown", onPointerDown, { capture: true });
  node.addEventListener("touchmove", onTouchMove, { passive: false });

  return {
    update(newOptions: DraggableOptions<T>) {
      current = newOptions;
      setInnerDisabled(!lifted);
    },
    destroy() {
      cancelHold();
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      node.removeEventListener("pointerdown", onPointerDown, { capture: true });
      node.removeEventListener("touchmove", onTouchMove);
      inner.destroy();
    },
  };
}
