/**
 * @file src/utils/admin-transitions.ts
 * @description
 * Centralized Svelte transitions and animation utilities for the admin theme system.
 * Respects prefers-reduced-motion and AdminTheme.features.reducedMotion.
 *
 * ### Features:
 * - adminFade: standard 200ms page-shell entry fade
 * - adminPage: standard 240ms page entry (fade + subtle rise) — applied once in the (app) layout
 * - adminStagger: staggered reveal for card grids / list rows (index → delay)
 * - adminCardIn: card content reveal (alias for adminFade with shorter duration)
 * - motion: numeric array interpolation with requestAnimationFrame loop
 */
import { cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.reducedMotion === "true"
  );
}

/** Standard 200ms fade for page shell entry — enterprise tier (no fly/bounce). */
export function adminFade(
  _node: Element,
  { duration = 200, delay = 0 }: { duration?: number; delay?: number } = {},
): TransitionConfig {
  if (prefersReducedMotion()) {
    return { duration: 0, delay: 0 };
  }
  return {
    duration,
    delay,
    easing: cubicOut,
    css: (t) => `opacity: ${t};`,
  };
}

/**
 * Standard page entry — fade + subtle rise, 240ms, cubicOut.
 * Applied ONCE around `children` in `(app)/+layout.svelte` (keyed on pathname)
 * so every admin route gets the identical entry motion without per-page work.
 */
export function adminPage(
  _node: Element,
  {
    duration = 240,
    delay = 0,
    rise = 8,
  }: { duration?: number; delay?: number; rise?: number } = {},
): TransitionConfig {
  if (prefersReducedMotion()) {
    return { duration: 0, delay: 0 };
  }
  return {
    duration,
    delay,
    easing: cubicOut,
    css: (t, u) => `opacity: ${t}; transform: translateY(${u * rise}px);`,
  };
}

/**
 * Staggered reveal for card grids / list rows.
 * Pass the zero-based item index; each item starts `step` ms after the previous.
 *
 * @example
 * {#each cards as card, i}
 *   <AdminCard in:adminStagger={{ index: i }}>…</AdminCard>
 * {/each}
 */
export function adminStagger(
  _node: Element,
  {
    index = 0,
    duration = 200,
    step = 40,
    rise = 8,
  }: { index?: number; duration?: number; step?: number; rise?: number } = {},
): TransitionConfig {
  if (prefersReducedMotion()) {
    return { duration: 0, delay: 0 };
  }
  return adminPage(_node, { duration, delay: index * step, rise });
}

/**
 * Direction-aware slide for drawers / sidebars / slide-over panels.
 * Positive `distance` slides in from the right, negative from the left.
 * Reduced-motion aware (0ms).
 *
 * @example
 * <div transition:adminSlide={{ distance: -240 }}>…left drawer…</div>
 */
export function adminSlide(
  _node: Element,
  {
    duration = 240,
    delay = 0,
    distance = 64,
  }: { duration?: number; delay?: number; distance?: number } = {},
): TransitionConfig {
  if (prefersReducedMotion()) {
    return { duration: 0, delay: 0 };
  }
  return {
    duration,
    delay,
    easing: cubicOut,
    css: (t, u) => `opacity: ${t}; transform: translateX(${u * distance}px);`,
  };
}

/**
 * Numeric array interpolation with requestAnimationFrame loop.
 * Animates from `start[]` to `end[]` over `duration` ms, calling `cb` on each frame.
 *
 * @example
 * await motion([0, 0], [100, 200], 500, ([x, y]) => updatePosition(x, y));
 */
export async function motion(
  start: number[],
  end: number[],
  duration: number,
  cb: (current: number[]) => void,
): Promise<void> {
  const current = [...start];
  let elapsed = 0;
  let time = Date.now();
  let hasPassed = false;
  setTimeout(() => {
    hasPassed = true;
  }, duration);
  return new Promise<void>((resolve) => {
    function animation(current: number[]) {
      elapsed = Date.now() - time;
      const ds = start.map((s, i) => (s - end[i]) / (duration / elapsed));

      time = Date.now();
      for (const [index, d] of ds.entries()) {
        current[index] -= d;
      }

      if (hasPassed) {
        cb(end);
        resolve();
        return;
      }
      cb(current);
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => animation(current));
      } else {
        setTimeout(() => animation(current), 16);
      }
    }

    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => animation(current));
    } else {
      setTimeout(() => animation(current), 16);
    }
  });
}
