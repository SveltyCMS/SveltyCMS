/**
 * @file src/stores/screenSizeStore.svelte.ts
 * @description Manages the screen size states (OPTIMIZED - Memory leak fixed)
 *
 * Features:
 * - Enum for different screen sizes matching Tailwind CSS breakpoints
 * - Reactive screen size tracking with proper cleanup
 * - Derived values for different screen states
 * - Debounced screen size updates
 * - Single effect root with proper disposal
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

// Screen size breakpoints
const BREAKPOINTS = {
	XS: 0,
	SM: 640,
	MD: 768,
	LG: 1024,
	XL: 1280,
	XXL: 1536
} as const;

// Helper function to get screen size name
function getScreenSizeName(width: number): ScreenSize {
	if (width < BREAKPOINTS.SM) return ScreenSize.XS;
	if (width < BREAKPOINTS.MD) return ScreenSize.SM;
	if (width < BREAKPOINTS.LG) return ScreenSize.MD;
	if (width < BREAKPOINTS.XL) return ScreenSize.LG;
	if (width < BREAKPOINTS.XXL) return ScreenSize.XL;
	return ScreenSize.XXL;
}

// Signal interface
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

	return {
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
			return $effect.root(() => {
				$effect(() => fn(v));
			});
		}
	};
}

// ✅ FIXED: Use $derived.by for proper Svelte 5 derived state without side-effects
function createDerivedSignal<T>(compute: () => T): Signal<T> {
	const v = $derived.by(compute);

	return {
		get value() {
			return v;
		},
		set: () => {}, // no-op; derived values are read-only
		update: () => {}, // no-op
		subscribe(fn: Subscriber<T>): Unsubscribe {
			return $effect.root(() => {
				$effect(() => fn(v));
			});
		}
	};
}

// Create base stores with proper cleanup
function createScreenSizeStores() {
	const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
	const initialHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
	const initialSize = getScreenSizeName(initialWidth);

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

	// Debounce helper
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

	// ✅ FIXED: Track cleanup function for proper disposal
	let cleanupListener: (() => void) | undefined;

	// Setup listener
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

	// ✅ FIXED: Single effect root with cleanup
	if (typeof window !== 'undefined') {
		$effect.root(() => {
			cleanupListener = setupListener();

			// Return cleanup for effect disposal
			return () => {
				if (cleanupListener) {
					cleanupListener();
				}
			};
		});
	}

	return {
		width: widthStore,
		height: heightStore,
		currentSize: currentSizeStore,
		isMobile: isMobileStore,
		isTablet: isTabletStore,
		isDesktop: isDesktopStore,
		isLargeScreen: isLargeScreenStore,
		setupListener,
		// ✅ NEW: Expose destroy method for manual cleanup
		destroy: () => {
			if (cleanupListener) {
				cleanupListener();
				cleanupListener = undefined;
			}
		}
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

// Export helper functions
export const setupScreenSizeListener = stores.setupListener;
export const destroyScreenSizeStore = stores.destroy;
export { getScreenSizeName };
