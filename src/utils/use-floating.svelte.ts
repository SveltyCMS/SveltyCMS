/**
 * @file src/utils/use-floating.svelte.ts
 * @description Hardened floating element positioning rune.
 *
 * ### Hardening (audit 2026-07):
 * - GPU acceleration: translate3d replaces left/top for compositor-layer positioning
 * - RAF-wrapped updates: prevents Layout Thrashing on scroll (1 calc per frame max)
 * - Math.round: sub-pixel precision prevents "fuzzy text" on non-integer positions
 * - Strict cleanup: cancels pending RAF, disconnects ResizeObserver, removes listeners
 *
 * Zero-dependency floating element positioning rune.
 * Replaces @floating-ui/dom with an internal implementation.
 *
 * ### Features:
 * - CSS Anchor Positioning detection and application
 * - JS fallback with offset, flip (fallback placements), shift (viewport clamping), and arrow
 * - Auto-update on window scroll/resize + ResizeObserver on both elements
 * - WCAG 3.0: exposed triggerAria and contentAria for popovers/dialogs/tooltips
 * - Full Svelte 5 runes: $state, $derived, $effect
 */

import { untrack } from "svelte";

type Placement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "left-start"
  | "left-end"
  | "right"
  | "right-start"
  | "right-end";

interface FloatingOptions {
  reference: () => HTMLElement | null;
  floating: () => HTMLElement | null;
  arrow?: () => HTMLElement | null;
  placement?: () => Placement;
  offset?: number | (() => number);
  padding?: number | (() => number);
  enabled: () => boolean;
  showArrow?: () => boolean;
}

const SUPPORTS_ANCHOR = false;

const OPPOSITE_SIDE: Record<string, string> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

const FALLBACKS: Record<string, Placement[]> = {
  top: ["bottom", "top-start", "top-end", "left", "right"],
  "top-start": ["bottom-start", "bottom", "top", "top-end", "left-start"],
  "top-end": ["bottom-end", "bottom", "top", "top-start", "right-end"],
  bottom: ["top", "bottom-start", "bottom-end", "left", "right"],
  "bottom-start": ["top-start", "top", "bottom", "bottom-end", "left-start"],
  "bottom-end": ["top-end", "top", "bottom", "bottom-start", "right-end"],
  left: ["right", "left-start", "left-end", "top", "bottom"],
  "left-start": ["right-start", "right", "left", "left-end", "top-start"],
  "left-end": ["right-end", "right", "left", "left-start", "bottom-end"],
  right: ["left", "right-start", "right-end", "top", "bottom"],
  "right-start": ["left-start", "left", "right", "right-end", "top-start"],
  "right-end": ["left-end", "left", "right", "right-start", "bottom-end"],
};

// --- JS Fallback: Position Computation ---

function computeCoords(
  ref: DOMRect,
  float: DOMRect,
  placement: Placement,
  offset: number,
): { x: number; y: number } {
  const [side, align = "center"] = placement.split("-") as [string, string];
  let x: number, y: number;

  switch (side) {
    case "top":
      x = ref.left + ref.width / 2 - float.width / 2;
      y = ref.top - float.height - offset;
      break;
    case "bottom":
      x = ref.left + ref.width / 2 - float.width / 2;
      y = ref.bottom + offset;
      break;
    case "left":
      x = ref.left - float.width - offset;
      y = ref.top + ref.height / 2 - float.height / 2;
      break;
    case "right":
      x = ref.right + offset;
      y = ref.top + ref.height / 2 - float.height / 2;
      break;
    default:
      x = ref.left;
      y = ref.bottom + offset;
  }

  if (align === "start") {
    if (side === "top" || side === "bottom") x = ref.left;
    else y = ref.top;
  } else if (align === "end") {
    if (side === "top" || side === "bottom") x = ref.right - float.width;
    else y = ref.bottom - float.height;
  }

  return { x, y };
}

function isOverflowing(x: number, y: number, float: DOMRect, padding: number): boolean {
  return (
    x < padding ||
    y < padding ||
    x + float.width > window.innerWidth - padding ||
    y + float.height > window.innerHeight - padding
  );
}

function clampToViewport(
  x: number,
  y: number,
  float: DOMRect,
  padding: number,
): { x: number; y: number } {
  return {
    x: Math.max(padding, Math.min(x, window.innerWidth - float.width - padding)),
    y: Math.max(padding, Math.min(y, window.innerHeight - float.height - padding)),
  };
}

function computeArrow(
  ref: DOMRect,
  float: DOMRect,
  placement: Placement,
  floatX: number,
  floatY: number,
) {
  const [side] = placement.split("-");
  const staticSide = OPPOSITE_SIDE[side] ?? "top";
  let arrowX: number, arrowY: number;

  if (side === "top" || side === "bottom") {
    arrowX = ref.left + ref.width / 2 - floatX;
    arrowY = side === "top" ? float.height : 0;
  } else {
    arrowX = side === "left" ? float.width : 0;
    arrowY = ref.top + ref.height / 2 - floatY;
  }

  arrowX = Math.max(6, Math.min(arrowX, float.width - 6));
  arrowY = Math.max(6, Math.min(arrowY, float.height - 6));
  return { arrowX, arrowY, staticSide };
}

function findBestPlacement(
  ref: DOMRect,
  float: DOMRect,
  preferred: Placement,
  offset: number,
  padding: number,
) {
  const candidates = [preferred, ...(FALLBACKS[preferred] ?? [])];
  for (const placement of candidates) {
    const coords = computeCoords(ref, float, placement, offset);
    if (!isOverflowing(coords.x, coords.y, float, padding)) {
      const clamped = clampToViewport(coords.x, coords.y, float, padding);
      return { ...clamped, placement };
    }
  }
  const coords = computeCoords(ref, float, preferred, offset);
  const clamped = clampToViewport(coords.x, coords.y, float, padding);
  return { ...clamped, placement: preferred };
}

// --- Public API ---

export function useFloating(options: FloatingOptions) {
  let x = $state(0);
  let y = $state(0);
  let finalPlacement = $state<Placement>(options.placement?.() ?? "bottom");
  let arrowX = $state<number | null>(null);
  let arrowY = $state<number | null>(null);
  let staticSide = $state<string>("top");
  let positionCalculated = $state(false);

  const anchorName = `--f-${Math.random().toString(36).slice(2, 8)}`;

  $effect(() => {
    const ref = options.reference();
    const float = options.floating();
    const enabled = options.enabled();
    const placement = options.placement?.() ?? "bottom";
    const rawOffset = options.offset ?? 0;
    const rawPadding = options.padding ?? 10;
    const offset = typeof rawOffset === "function" ? rawOffset() : rawOffset;
    const padding = typeof rawPadding === "function" ? rawPadding() : rawPadding;

    if (!enabled || !ref || !float) {
      positionCalculated = false;
      return;
    }

    // --- CSS Anchor Positioning path ---
    if (SUPPORTS_ANCHOR) {
      ref.style.anchorName = anchorName;
      float.style.positionAnchor = anchorName;
      (float.style as any).positionArea = placement.replace("-", " ");
      (float.style as any).positionTryOptions = "flip-block, flip-inline";
      float.style.inset = "auto";
      float.style.margin = `${offset}px`;
      float.style.left = "auto";
      float.style.top = "auto";
      finalPlacement = placement;
      positionCalculated = true;

      if (options.showArrow?.() && options.arrow) {
        const arr = options.arrow();
        if (arr) {
          const [side] = placement.split("-");
          staticSide = OPPOSITE_SIDE[side] ?? "top";
          arr.style.position = "absolute";
          arr.style.left = `anchor(${anchorName} 50%)`;
          arr.style.top = `anchor(${anchorName} 50%)`;
          arr.style.transform = "rotate(45deg) translate(-50%, -50%)";
          arrowX = null;
          arrowY = null;
        }
      }

      return () => {
        ref.style.anchorName = "";
        float.style.positionAnchor = "";
        (float.style as any).positionArea = "";
        (float.style as any).positionTryOptions = "";
        float.style.inset = "";
        float.style.margin = "";
        float.style.left = "";
        float.style.top = "";
        positionCalculated = false;
      };
    }

    // --- JavaScript fallback path ---
    function updatePosition() {
      const refRect = ref!.getBoundingClientRect();
      const floatRect = float!.getBoundingClientRect();
      const best = findBestPlacement(refRect, floatRect, placement, offset, padding);
      x = best.x;
      y = best.y;
      finalPlacement = best.placement;

      if (options.showArrow?.() && options.arrow) {
        const arrowEl = options.arrow();
        if (arrowEl) {
          const arrow = computeArrow(refRect, floatRect, best.placement, best.x, best.y);
          arrowX = arrow.arrowX;
          arrowY = arrow.arrowY;
          staticSide = arrow.staticSide;
        }
      } else {
        arrowX = null;
        arrowY = null;
      }

      if (!positionCalculated) positionCalculated = true;
    }

    untrack(() => {
      updatePosition();
    });

    // 🛡️ RAF-wrapped update to prevent Layout Thrashing on scroll
    let rafId: number;
    const onUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePosition);
    };

    window.addEventListener("scroll", onUpdate, { passive: true, capture: true });
    window.addEventListener("resize", onUpdate, { passive: true });

    const observer = new ResizeObserver(onUpdate);
    observer.observe(ref);
    observer.observe(float);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onUpdate, { capture: true });
      window.removeEventListener("resize", onUpdate);
      observer.disconnect();
      positionCalculated = false;
    };
  });

  const triggerAria = $derived.by(() => ({
    "aria-haspopup": "true" as const,
    "aria-expanded": String(options.enabled()) as "true" | "false",
  }));

  const contentAria = $derived.by(() => ({
    role: "dialog" as const,
    "aria-label": "Popover content",
  }));

  /** Inline position style — GPU-accelerated via translate3d */
  const positionStyle = $derived(
    options.enabled()
      ? SUPPORTS_ANCHOR
        ? ""
        : `position: fixed; top: 0; left: 0; transform: translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0);`
      : "display: none;",
  );

  return {
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get placement() {
      return finalPlacement;
    },
    get arrowX() {
      return arrowX;
    },
    get arrowY() {
      return arrowY;
    },
    get staticSide() {
      return staticSide;
    },
    get positionCalculated() {
      return positionCalculated;
    },
    get triggerAria() {
      return triggerAria;
    },
    get contentAria() {
      return contentAria;
    },
    get positionStyle() {
      return positionStyle;
    },
  };
}

export type { Placement, FloatingOptions };
