/**
 * @file src/stores/screen-size-store.svelte.ts
 * @description Reactive screen size tracking using Svelte 5 runes.
 * Optimized for SSR-safety.
 */

export enum ScreenSize {
  XS = "xs",
  SM = "sm",
  MD = "md",
  LG = "lg",
  XL = "xl",
  XXL = "2xl",
}

export const BREAKPOINTS: Record<ScreenSize, number> = {
  [ScreenSize.XS]: 0,
  [ScreenSize.SM]: 640,
  [ScreenSize.MD]: 768,
  [ScreenSize.LG]: 1024,
  [ScreenSize.XL]: 1280,
  [ScreenSize.XXL]: 1536,
};

export function getScreenSize(width: number): ScreenSize {
  if (width >= BREAKPOINTS[ScreenSize.XXL]) return ScreenSize.XXL;
  if (width >= BREAKPOINTS[ScreenSize.XL]) return ScreenSize.XL;
  if (width >= BREAKPOINTS[ScreenSize.LG]) return ScreenSize.LG;
  if (width >= BREAKPOINTS[ScreenSize.MD]) return ScreenSize.MD;
  if (width >= BREAKPOINTS[ScreenSize.SM]) return ScreenSize.SM;
  return ScreenSize.XS;
}

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
