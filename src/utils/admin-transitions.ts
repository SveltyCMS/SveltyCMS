/**
 * @file src/utils/admin-transitions.ts
 * @description
 * Centralized Svelte transitions and animation utilities for the admin theme system.
 * Respects prefers-reduced-motion and AdminTheme.features.reducedMotion.
 *
 * ### Features:
 * - adminFade: standard 200ms page-shell entry fade
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
