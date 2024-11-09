/**
 * @file src/stores/screenSizeStore.ts
 * @description Manages the screen size states
 *
 * Features:
 * - Enum for different screen sizes
 * - Screen size breakpoints
 * - Screen size manager to track and update screen size states
 * - Listener for screen size changes
 * - Function to get screen size name based on width
 * - Function to debounce screen size updates
 *
 */

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

class ScreenSizeManager {
	// State declaration
	$state = {
		currentSize: typeof window !== 'undefined' ? this.getScreenSizeName(window.innerWidth) : ScreenSize.LG,
		width: typeof window !== 'undefined' ? window.innerWidth : 1024,
		height: typeof window !== 'undefined' ? window.innerHeight : 768
	};

	// Computed values
	get $derived() {
		return {
			isMobile: this.$state.currentSize === ScreenSize.SM,
			isTablet: this.$state.currentSize === ScreenSize.MD,
			isDesktop: this.$state.currentSize === ScreenSize.LG || this.$state.currentSize === ScreenSize.XL,
			isLargeScreen: this.$state.currentSize === ScreenSize.XL
		};
	}

	// Get screen size name based on width
	private getScreenSizeName(width: number): ScreenSize {
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

	// Update screen size
	private updateScreenSize = () => {
		if (typeof window !== 'undefined') {
			this.$state.width = window.innerWidth;
			this.$state.height = window.innerHeight;
			this.$state.currentSize = this.getScreenSizeName(window.innerWidth);
		}
	};

	// Debounce function
	private debounce(fn: () => void, delay: number): () => void {
		let timeoutId: ReturnType<typeof setTimeout>;
		return () => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(fn, delay);
		};
	}

	// Initialize screen size listener
	setupListener(): () => void {
		if (typeof window === 'undefined') {
			return () => {};
		}

		const debouncedUpdate = this.debounce(this.updateScreenSize, 150);

		// Initial update
		this.updateScreenSize();

		// Add event listener
		window.addEventListener('resize', debouncedUpdate);

		// Return cleanup function
		return () => {
			window.removeEventListener('resize', debouncedUpdate);
		};
	}
}

// Create and export singleton instance
export const screenSizeManager = new ScreenSizeManager();

// For backward compatibility with existing code that uses stores
export const screenSize = {
	subscribe: (fn: (value: ScreenSize) => void) => {
		fn(screenSizeManager.$state.currentSize);
		return () => {};
	},
	set: (value: ScreenSize) => {
		screenSizeManager.$state.currentSize = value;
	}
};

// Export setup function for backward compatibility
export const setupScreenSizeListener = () => screenSizeManager.setupListener();

// Export helper function for direct use
export const getScreenSizeName = (width: number): ScreenSize => {
	if (width <= BREAKPOINTS.SM) {
		return ScreenSize.SM;
	} else if (width <= BREAKPOINTS.MD) {
		return ScreenSize.MD;
	} else if (width <= BREAKPOINTS.LG) {
		return ScreenSize.LG;
	} else {
		return ScreenSize.XL;
	}
};
