/**
 * @file src/stores/screenSizeStore.svelte.ts
 * @description Reactive screen size tracking using Svelte 5 runes
 *
 * Features:
 * - Class-based singleton with $state properties
 * - matchMedia for efficient breakpoint detection
 * - requestAnimationFrame for smooth resize updates
 * - prefers-reduced-motion accessibility support
 */

// Import for internal use
import { ScreenSize, BREAKPOINTS, getScreenSize } from '@utils/screenSize';

// Re-export utilities for backwards compatibility
export { ScreenSize, BREAKPOINTS, getScreenSize };

/**
 * ScreenSizeStore - Reactive screen size management
 *
 * Usage:
 * - screen.size - Current ScreenSize enum value
 * - screen.width / screen.height - Current dimensions
 * - screen.isMobile / screen.isTablet / screen.isDesktop - Boolean helpers
 * - screen.prefersReducedMotion - Accessibility preference
 */
class ScreenSizeStore {
	// Core reactive state
	width = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
	height = $state(typeof window !== 'undefined' ? window.innerHeight : 768);

	// Accessibility: detect reduced motion preference
	prefersReducedMotion = $state(typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false);

	// Computed screen size
	get size(): ScreenSize {
		return getScreenSize(this.width);
	}

	// Convenience getters for common checks
	get isMobile(): boolean {
		return this.size === ScreenSize.XS || this.size === ScreenSize.SM;
	}

	get isTablet(): boolean {
		return this.size === ScreenSize.MD;
	}

	get isDesktop(): boolean {
		const s = this.size;
		return s === ScreenSize.LG || s === ScreenSize.XL || s === ScreenSize.XXL;
	}

	get isLargeScreen(): boolean {
		return this.size === ScreenSize.XL || this.size === ScreenSize.XXL;
	}

	// Internal state
	private rafId: number | null = null;
	private cleanup?: () => void;

	constructor() {
		if (typeof window === 'undefined') return;

		const update = () => {
			this.width = window.innerWidth;
			this.height = window.innerHeight;
			this.rafId = null;
		};

		const handleResize = () => {
			if (this.rafId) cancelAnimationFrame(this.rafId);
			this.rafId = requestAnimationFrame(update);
		};

		// Listen for reduced motion preference changes
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const handleMotionChange = (e: MediaQueryListEvent) => {
			this.prefersReducedMotion = e.matches;
		};

		// Set up listeners
		window.addEventListener('resize', handleResize);
		motionQuery.addEventListener('change', handleMotionChange);
		update();

		// Store cleanup for disposal
		this.cleanup = () => {
			if (this.rafId) cancelAnimationFrame(this.rafId);
			window.removeEventListener('resize', handleResize);
			motionQuery.removeEventListener('change', handleMotionChange);
		};
	}

	// Manual cleanup method
	destroy() {
		this.cleanup?.();
	}
}

// Singleton instance - the main export
export const screen = new ScreenSizeStore();
