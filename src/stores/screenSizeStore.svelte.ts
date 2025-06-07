/**
 * @file src/stores/screenSizeStore.svelte.ts
 * @description Manages the screen size states
 *
 * Features:
 * - Enum for different screen sizes matching Tailwind CSS breakpoints
 * - Screen size breakpoints (Tailwind defaults):
 *   - xs: < 640px (mobile)
 *   - sm: 640px (mobile landscape/tablet portrait)
 *   - md: 768px (tablet landscape)
 *   - lg: 1024px (small desktop)
 *   - xl: 1280px (desktop)
 *   - 2xl: 1536px (large desktop)
 * - Reactive screen size tracking
 * - Derived values for different screen states
 * - Debounced screen size updates
 */

import { store } from '@utils/reactivity.svelte';

// Enum for screen sizes (matches Tailwind CSS breakpoints)
export enum ScreenSize {
	XS = 'xs',
	SM = 'sm',
	MD = 'md',
	LG = 'lg',
	XL = 'xl',
	XXL = '2xl'
}

// Screen size breakpoints (Tailwind defaults)
const BREAKPOINTS = {
	XS: 0, // Extra small devices
	SM: 640, // Small devices (mobile landscape/tablet portrait)
	MD: 768, // Medium devices (tablet landscape)
	LG: 1024, // Large devices (small desktop)
	XL: 1280, // Extra large devices (desktop)
	XXL: 1536 // 2x extra large devices (large desktop)
} as const;

// Helper function to get screen size name
function getScreenSizeName(width: number): ScreenSize {
	if (width < BREAKPOINTS.SM) {
		return ScreenSize.XS;
	} else if (width < BREAKPOINTS.MD) {
		return ScreenSize.SM;
	} else if (width < BREAKPOINTS.LG) {
		return ScreenSize.MD;
	} else if (width < BREAKPOINTS.XL) {
		return ScreenSize.LG;
	} else if (width < BREAKPOINTS.XXL) {
		return ScreenSize.XL;
	} else {
		return ScreenSize.XXL;
	}
}

// Create base stores
function createScreenSizeStores() {
	// Initialize with default values
	const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
	const initialHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
	const initialSize = getScreenSizeName(initialWidth);
	// Create stores from state
	const widthStore = store<number>(initialWidth);
	const heightStore = store<number>(initialHeight);
	const currentSizeStore = store<ScreenSize>(initialSize);

	// Derived states
	// Remove previous $derived usage for isMobile, isTablet, isDesktop, isLargeScreen
	const isMobileStore = store(() => {
		const size = currentSizeStore.value;
		return size === ScreenSize.XS || size === ScreenSize.SM;
	});
	const isTabletStore = store(() => currentSizeStore.value === ScreenSize.MD);
	const isDesktopStore = store(() => {
		const size = currentSizeStore.value;
		return size === ScreenSize.LG || size === ScreenSize.XL || size === ScreenSize.XXL;
	});
	const isLargeScreenStore = store(() => {
		const size = currentSizeStore.value;
		return size === ScreenSize.XL || size === ScreenSize.XXL;
	});

	// Debounce function
	function debounce(fn: () => void, delay: number): () => void {
		let timeoutId: ReturnType<typeof setTimeout>;
		return () => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(fn, delay);
		};
	}

	// Update function (only update currentSizeStore if category changes)
	function updateScreenSize() {
		if (typeof window !== 'undefined') {
			const width = window.innerWidth;
			const height = window.innerHeight;
			const prevSize = currentSizeStore.value;
			const newSize = getScreenSizeName(width);
			widthStore.set(width);
			heightStore.set(height);
			if (prevSize !== newSize) {
				currentSizeStore.set(newSize);
			}
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

	// Setup root effect for initialization
	$effect.root(() => {
		setupListener();
	});

	return {
		width: widthStore,
		height: heightStore,
		currentSize: currentSizeStore,
		isMobile: isMobileStore,
		isTablet: isTabletStore,
		isDesktop: isDesktopStore,
		isLargeScreen: isLargeScreenStore,
		setupListener
	};
}

// Create and export stores
const stores = createScreenSizeStores();

// Export individual stores
export const screenWidth = stores.width;
export const screenHeight = stores.height;
export const screenSize = stores.currentSize;
export const isMobile = stores.isMobile;
export const isTablet = stores.isTablet;
export const isDesktop = stores.isDesktop;
export const isLargeScreen = stores.isLargeScreen;

// Export setup function
export const setupScreenSizeListener = stores.setupListener;

// Export helper function for direct use
export { getScreenSizeName };
