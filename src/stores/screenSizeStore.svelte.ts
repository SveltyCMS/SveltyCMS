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

// Enum for screen sizes (matches Tailwind CSS breakpoints)
export enum ScreenSize {
	XS = 'XS',
	SM = 'SM',
	MD = 'MD',
	LG = 'LG',
	XL = 'XL',
	XXL = '2XL'
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

// Create base store using Svelte 5 runes
function createScreenSizeStore() {
	// SSR-safe initial values
	const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
	const initialHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
	const initialSize = getScreenSizeName(initialWidth);

	// State using $state rune
	let width = $state<number>(initialWidth);
	let height = $state<number>(initialHeight);
	let currentSizeState = $state<ScreenSize>(initialSize);
	const currentSize = {
		get value() { return currentSizeState; },
		set(newValue: ScreenSize) {
			// Only update if value actually changed for performance
			if (currentSizeState !== newValue) {
				currentSizeState = newValue;
			}
		},
		update(fn: (value: ScreenSize) => ScreenSize) {
			const newValue = fn(currentSizeState);
			if (currentSizeState !== newValue) {
				currentSizeState = newValue;
			}
		},
		subscribe(fn: (value: ScreenSize) => void) {
			return $effect.root(() => {
				$effect(() => {
					fn(currentSizeState);
				});
				return () => { }; // cleanup function
			});
		}
	};


	// Derived values using $derived rune
	const isMobile = $derived(currentSizeState === ScreenSize.XS || currentSizeState === ScreenSize.SM);
	const isTablet = $derived(currentSizeState === ScreenSize.MD);
	const isDesktop = $derived(currentSizeState === ScreenSize.LG || currentSizeState === ScreenSize.XL || currentSizeState === ScreenSize.XXL);
	const isLargeScreen = $derived(currentSizeState === ScreenSize.XL || currentSizeState === ScreenSize.XXL);

	// Debounce function
	function debounce(fn: () => void, delay: number): () => void {
		let timeoutId: ReturnType<typeof setTimeout>;
		return () => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(fn, delay);
		};
	}

	// Update function (only update currentSize if category changes)
	function updateScreenSize() {
		if (typeof window !== 'undefined') {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const prevSize = currentSizeState;
			const newSize = getScreenSizeName(w);
			width = w;
			height = h;
			if (prevSize !== newSize) {
				currentSize.set(newSize);
			}
		}
	}

	// Setup listener function
	function setupListener(): () => void {
		if (typeof window === 'undefined') {
			return () => { };
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
		get width() { return width; },
		get height() { return height; },
		get currentSize() { return currentSize; },
		get isMobile() { return isMobile; },
		get isTablet() { return isTablet; },
		get isDesktop() { return isDesktop; },
		get isLargeScreen() { return isLargeScreen; },
		setupListener
	};
}

// Create and export store instance
const store = createScreenSizeStore();

export const screenWidth = store.width;
export const screenHeight = store.height;
export const screenSize = store.currentSize;
export const isMobile = store.isMobile;
export const isTablet = store.isTablet;
export const isDesktop = store.isDesktop;
export const isLargeScreen = store.isLargeScreen;
export const setupScreenSizeListener = store.setupListener;

// Export helper function for direct use
export { getScreenSizeName };
