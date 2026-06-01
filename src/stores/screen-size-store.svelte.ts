/**
 * @file src/stores/screen-size-store.svelte.ts
 * @description Reactive screen size tracking using Svelte 5 runes.
 * Optimized for SSR-safety.
 */

import { BREAKPOINTS, getScreenSize, ScreenSize } from "@utils/screen-size";

export { ScreenSize, BREAKPOINTS, getScreenSize };

class ScreenSizeStore {
  width = $state(1024);
  height = $state(768);
  prefersReducedMotion = $state(false);

  get size(): ScreenSize {
    return getScreenSize(this.width);
  }

  get isMobile(): boolean {
    return this.width < BREAKPOINTS[ScreenSize.MD];
  }

  get isTablet(): boolean {
    return this.width >= BREAKPOINTS[ScreenSize.MD] && this.width < BREAKPOINTS[ScreenSize.LG];
  }

  get isDesktop(): boolean {
    return this.width >= BREAKPOINTS[ScreenSize.LG];
  }

  private rafId: number | null = null;
  private cleanup?: () => void;

  constructor() {
    // Inert constructor for SSR safety
  }

  mount() {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const update = () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.rafId = null;
    };

    const handleResize = () => {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(update);
    };

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.prefersReducedMotion = motionQuery.matches;

    const handleMotionChange = (e: MediaQueryListEvent) => {
      this.prefersReducedMotion = e.matches;
    };

    motionQuery.addEventListener("change", handleMotionChange);
    window.addEventListener("resize", handleResize);

    update();

    this.cleanup = () => {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      window.removeEventListener("resize", handleResize);
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }

  destroy() {
    this.cleanup?.();
  }
}

export const screen = new ScreenSizeStore();
