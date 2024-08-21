/**
 * @file src/stores/screenSizeStore.ts
 * @description Manages the screen size state for the application using Svelte stores.
 */

import { writable } from 'svelte/store';

// Enum for screen sizes
export enum ScreenSize {
	SM = 'sm',
	MD = 'md',
	LG = 'lg',
	XL = 'xl'
}

// Function to determine screen width
export function getScreenSizeName(width: number): ScreenSize {
	if (width <= 567) {
		return ScreenSize.SM;
	} else if (width >= 568 && width <= 767) {
		return ScreenSize.MD;
	} else if (width >= 768 && width <= 1024) {
		return ScreenSize.LG;
	} else {
		return ScreenSize.XL;
	}
}

// Initialize the screen width store
export const screenSize = writable<ScreenSize>(typeof window !== 'undefined' ? getScreenSizeName(window.innerWidth) : ScreenSize.LG);

// Debounce function to limit the rate at which a function can fire
function debounce(fn: () => void, delay: number): () => void {
	let timeoutId: ReturnType<typeof setTimeout>;
	return () => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(fn, delay);
	};
}

// Function to set up resize listener and return cleanup function
export function setupScreenSizeListener(): () => void {
	if (typeof window === 'undefined') {
		// Return a no-op function if not in browser environment
		return () => {};
	}

	const updateScreenSize = () => {
		const width = window.innerWidth;
		screenSize.set(getScreenSizeName(width));
	};

	const debouncedUpdate = debounce(updateScreenSize, 150);

	// Immediate update on setup
	updateScreenSize();

	window.addEventListener('resize', debouncedUpdate);

	// Return cleanup function
	return () => {
		window.removeEventListener('resize', debouncedUpdate);
	};
}
