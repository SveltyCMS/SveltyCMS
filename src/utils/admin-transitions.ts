/**
 * @file src/utils/admin-transitions.ts
 * @description
 * Centralized Svelte transitions for the admin theme system.
 * Respects prefers-reduced-motion and AdminTheme.features.reducedMotion.
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

/** Card content reveal — slightly faster than page shell. */
export function adminCardIn(
  node: Element,
  { duration = 150, delay = 0 }: { duration?: number; delay?: number } = {},
): TransitionConfig {
  return adminFade(node, { duration, delay });
}
