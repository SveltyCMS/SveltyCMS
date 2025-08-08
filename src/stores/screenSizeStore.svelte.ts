/**
 * @file src/stores/screenSizeStore.svelte.ts
 * @description Manages the screen size states
 *
 * Features:
 * - Enum for different screen sizes matching Tailwind CSS breakpoints
 * - Screen size breakpoints (Tailwind defaults with custom xs: 360px):
 *   - xs: 360px (custom extra small breakpoint)
 *   - sm: 640px (mobile landscape/tablet portrait)
 *   - md: 768px (tablet landscape)
 *   - lg: 1024px (small desktop)
 *   - xl: 1280px (desktop)
 *   - 2xl: 1536px (large desktop)
 * - Max-width utilities:
 *   - max-xs: max 359px
 *   - max-sm: max 639px
 *   - max-md: max 767px
 *   - max-lg: max 1023px
 *   - max-xl: max 1279px
 *   - max-2xl: max 1535px
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

// Lightweight rune-based signal with a compatible API to the previous helper
type Unsubscribe = () => void;
type Subscriber<T> = (value: T) => void;

interface Signal<T> {
	readonly value: T;
	set: (value: T) => void;
	update: (fn: (value: T) => T) => void;
	subscribe: (fn: Subscriber<T>) => Unsubscribe;
}

function createSignal<T>(initial: T): Signal<T> {
	let v = $state(initial) as T;

	const api: Signal<T> = {
		get value() {
			return v;
		},
		set(value: T) {
			if (v !== value) v = value;
		},
		update(fn) {
			v = fn(v);
		},
		subscribe(fn: Subscriber<T>): Unsubscribe {
			// Create an effect that re-runs the subscriber when v changes
			return $effect.root(() => {
				$effect(() => {
					// Access v so changes are tracked
					fn(v);
				});
			});
		}
	};

	return api;
}

// Derived signal that recomputes from dependencies; read-only
function createDerivedSignal<T>(compute: () => T): Signal<T> {
	// Backing state mirrors the computed value to offer .value access
	let v = $state(compute()) as T;

	// Keep v in sync with compute() reactively
	$effect.root(() => {
		$effect(() => {
			v = compute();
		});
	});

	return {
		get value() {
			return v;
		},
		set: () => {
			// no-op; derived values are read-only
		},
		update: () => {
			// no-op; derived values are read-only
		},
		subscribe(fn: Subscriber<T>): Unsubscribe {
			return $effect.root(() => {
				$effect(() => {
					fn(v);
				});
			});
		}
	};
}

// Create base stores using runes
function createScreenSizeStores() {
	// Initialize with default values
	const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
	const initialHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
	const initialSize = getScreenSizeName(initialWidth);

	// Signals backed by $state
	const widthStore = createSignal<number>(initialWidth);
	const heightStore = createSignal<number>(initialHeight);
	const currentSizeStore = createSignal<ScreenSize>(initialSize);

	// Derived states
	const isMobileStore = createDerivedSignal<boolean>(() => {
		const size = currentSizeStore.value;
		return size === ScreenSize.XS || size === ScreenSize.SM;
	});
	const isTabletStore = createDerivedSignal<boolean>(() => currentSizeStore.value === ScreenSize.MD);
	const isDesktopStore = createDerivedSignal<boolean>(() => {
		const size = currentSizeStore.value;
		return size === ScreenSize.LG || size === ScreenSize.XL || size === ScreenSize.XXL;
	});
	const isLargeScreenStore = createDerivedSignal<boolean>(() => {
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
