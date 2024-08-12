/**
 * @file sidebarStore.ts
 * @description Manages the sidebar and responsive layout state for the application using Svelte stores.
 *
 * This module provides functionality to:
 * - Define and manage screen width categories (Mobile, Tablet, Desktop)
 * - Create and update a store for the current screen width
 * - Define and manage sidebar states for different parts of the layout
 * - Handle responsive sidebar behavior based on screen width and application mode
 *
 * Key features:
 * - Responsive design handling with ScreenWidth enum and screenWidth store
 * - SidebarState interface defining states for various layout components
 * - sidebarState store for managing the current state of layout components
 * - Functions for toggling sidebar states and handling responsive behavior
 * - Integration with application mode for context-aware layout adjustments
 *
 * @requires svelte/store - For creating and managing Svelte stores
 * @requires ./store - For accessing the application mode store
 *
 * @exports ScreenWidth - Enum for screen width categories
 * @exports screenWidth - Writable store for current screen width
 * @exports SidebarState - Interface for sidebar states
 * @exports sidebarState - Writable store for current sidebar state
 * @exports toggleSidebar - Function to toggle individual sidebar components
 * @exports handleSidebarToggle - Function to handle responsive sidebar behavior
 */

import { get, writable } from 'svelte/store';
import { mode } from './store';

// Enum for screen width
export enum ScreenWidth {
	Mobile = 'mobile',
	Tablet = 'tablet',
	Desktop = 'desktop'
}

// Store for screen width
export const screenWidth = writable(getScreenWidthName());

// Update screen width on resize
if (typeof window !== 'undefined') {
	window.addEventListener('resize', () => {
		screenWidth.set(getScreenWidthName());
		handleSidebarToggle(); // Call the handleSidebarToggle function when the screen width changes
	});
}

// Function to determine screen width
function getScreenWidthName(): ScreenWidth {
	if (typeof window === 'undefined') {
		return ScreenWidth.Desktop; // Default to Desktop when running on server-side
	}

	const width = window.innerWidth;
	if (width <= 567) {
		return ScreenWidth.Mobile;
	} else if (width >= 568 && width <= 767) {
		return ScreenWidth.Tablet;
	} else {
		return ScreenWidth.Desktop;
	}
}

// Update screen width on resize
if (typeof window !== 'undefined') {
	window.addEventListener('resize', () => {
		screenWidth.set(getScreenWidthName());
	});
}

// Interface for sidebar states
export interface SidebarState {
	left: 'hidden' | 'collapsed' | 'full';
	right: 'hidden' | 'collapsed' | 'full';
	pageheader: 'hidden' | 'collapsed' | 'full';
	pagefooter: 'hidden' | 'collapsed' | 'full';
	header: 'hidden' | 'collapsed' | 'full';
	footer: 'hidden' | 'collapsed' | 'full';
}

// Default sidebar states
const defaultState: SidebarState = {
	left: getDefaultLeftState(),
	right: 'hidden',
	pageheader: 'hidden',
	pagefooter: 'hidden',
	header: 'hidden',
	footer: 'hidden'
};

// Store for sidebar state
export const sidebarState = writable(defaultState);

// Function to get default left state based on screen width
function getDefaultLeftState(): 'hidden' | 'collapsed' | 'full' {
	const width = get(screenWidth);
	if (width === ScreenWidth.Mobile) {
		return 'hidden'; // Start hidden on mobile
	} else if (width === ScreenWidth.Tablet) {
		return 'collapsed'; // Start collapsed on tablet
	} else {
		return 'full'; // Start full on Desktop
	}
}

// Function to toggle sidebar
export const toggleSidebar = (side: keyof SidebarState, state: 'hidden' | 'collapsed' | 'full') => {
	sidebarState.update((currentState: SidebarState) => {
		const newState: SidebarState = { ...currentState };
		newState[side] = state;
		return newState;
	});
};

// Store for user preferred sidebar state
export const userPreferredState = writable<'hidden' | 'collapsed' | 'full'>('collapsed');

// Function to handle sidebar toggle based on mode and screen width
export const handleSidebarToggle = () => {
	const width = get(screenWidth);
	// Mobile
	if (width === ScreenWidth.Mobile) {
		if (get(mode) === 'view' || get(mode) === 'media') {
			toggleSidebar('left', 'hidden');
			toggleSidebar('right', 'hidden');
			toggleSidebar('pageheader', 'hidden');
			toggleSidebar('pagefooter', 'hidden');
			toggleSidebar('header', 'hidden');
			toggleSidebar('footer', 'hidden');
		} else {
			toggleSidebar('left', 'hidden');
			toggleSidebar('right', 'hidden');
			toggleSidebar('pageheader', 'full');
			toggleSidebar('pagefooter', 'full');
			toggleSidebar('header', 'hidden');
			toggleSidebar('footer', 'hidden');
		}
		// Tablet
	} else if (width === ScreenWidth.Tablet) {
		if (get(mode) === 'view' || get(mode) === 'media') {
			toggleSidebar('left', 'collapsed');
			toggleSidebar('right', 'hidden');
			toggleSidebar('pageheader', 'hidden');
			toggleSidebar('pagefooter', 'hidden');
			toggleSidebar('header', 'hidden');
			toggleSidebar('footer', 'hidden');
		} else {
			toggleSidebar('left', 'hidden');
			toggleSidebar('right', 'hidden');
			toggleSidebar('pageheader', 'full');
			toggleSidebar('pagefooter', 'full');
			toggleSidebar('header', 'hidden');
			toggleSidebar('footer', 'hidden');
		}
		// Desktop
	} else if (width === ScreenWidth.Desktop) {
		if (get(mode) === 'view' || get(mode) === 'media') {
			toggleSidebar('left', 'full');
			toggleSidebar('right', 'hidden');
			toggleSidebar('pageheader', 'hidden');
			toggleSidebar('pagefooter', 'hidden');
			toggleSidebar('header', 'hidden');
			toggleSidebar('footer', 'hidden');
		} else {
			toggleSidebar('left', 'collapsed');
			toggleSidebar('right', 'full');
			toggleSidebar('pageheader', 'full');
			toggleSidebar('pagefooter', 'hidden');
			toggleSidebar('header', 'hidden');
			toggleSidebar('footer', 'hidden');
		}
	}
};
