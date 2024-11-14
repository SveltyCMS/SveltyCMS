/**
 * @file src/stores/screenSizeStore.svelte.ts
 * @description Manages the screen size states using Svelte 5 runes
 *
 * Features:
 * - Enum for different screen sizes
 * - Screen size breakpoints
 * - Reactive screen size tracking
 * - Derived values for different screen states
 * - Debounced screen size updates
 */

import { store } from '@src/utils/reactivity.svelte';

// Enum for screen sizes
export enum ScreenSize {
	SM = 'sm',
	MD = 'md',
	LG = 'lg',
	XL = 'xl'
}

// Screen size breakpoints
const BREAKPOINTS = {
	SM: 567,
	MD: 767,
	LG: 1024
} as const;

// Helper function to get screen size name
function getScreenSizeName(width: number): ScreenSize {
	if (width <= BREAKPOINTS.SM) {
		return ScreenSize.SM;
	} else if (width <= BREAKPOINTS.MD) {
		return ScreenSize.MD;
	} else if (width <= BREAKPOINTS.LG) {
		return ScreenSize.LG;
	} else {
		return ScreenSize.XL;
	}
}

// Create base stores
function createScreenSizeStores() {
	// Initialize with default values
	const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
	const initialHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
	const initialSize = getScreenSizeName(initialWidth);

	// Base stores
	const currentSize = store<ScreenSize>(initialSize);
	const width = store<number>(initialWidth);
	const height = store<number>(initialHeight);

	// Derived values
	const isMobile = $derived(currentSize() === ScreenSize.SM);
	const isTablet = $derived(currentSize() === ScreenSize.MD);
	const isDesktop = $derived(currentSize() === ScreenSize.LG || currentSize() === ScreenSize.XL);
	const isLargeScreen = $derived(currentSize() === ScreenSize.XL);

	// Debounce function
	function debounce(fn: () => void, delay: number): () => void {
		let timeoutId: ReturnType<typeof setTimeout>;
		return () => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(fn, delay);
		};
	}

	// Update function
	function updateScreenSize() {
		if (typeof window !== 'undefined') {
			width.set(window.innerWidth);
			height.set(window.innerHeight);
			currentSize.set(getScreenSizeName(window.innerWidth));
		}
	}

	// Setup listener function
	function setupListener(): () => void {
		if (typeof window === 'undefined') {
			return () => {};
		}

		const debouncedUpdate = debounce(updateScreenSize, 150);

		// Initial update
		updateScreenSize();

		// Add event listener
		window.addEventListener('resize', debouncedUpdate);

		// Return cleanup function
		return () => {
			window.removeEventListener('resize', debouncedUpdate);
		};
	}

	return {
		// Base stores
		currentSize,
		width,
		height,

		// Derived values
		isMobile,
		isTablet,
		isDesktop,
		isLargeScreen,

		// Helper functions
		setupListener,
		updateScreenSize
	};
}

// Create and export stores
const stores = createScreenSizeStores();

// Export individual stores and values
export const screenSize = {
	subscribe: stores.currentSize.subscribe,
	set: stores.currentSize.set
};

export const screenWidth = {
	subscribe: () => stores.width()
};

export const screenHeight = {
	subscribe: () => stores.height()
};

// Export derived values
export const isMobile = { subscribe: () => stores.isMobile };
export const isTablet = { subscribe: () => stores.isTablet };
export const isDesktop = { subscribe: () => stores.isDesktop };
export const isLargeScreen = { subscribe: () => stores.isLargeScreen };

// Export setup function
export const setupScreenSizeListener = stores.setupListener;

// Export helper function for direct use
export { getScreenSizeName };
