/**
 * @file src/stores/sidebarStore.ts
 * @description Manages the sidebar and responsive layout state for the application using Svelte stores.
 *
 * This module provides functionality to:
 * - Define and manage sidebar states for different parts of the layout
 * - Handle responsive sidebar behavior based on screen width and application mode
 *
 * Key features:
 * - Responsive design handling with ScreenSize enum and screenSize store
 * - SidebarState interface defining states for various layout components
 * - sidebarState store for managing the current state of layout components
 * - Functions for toggling sidebar states and handling responsive behavior
 * - Integration with application mode for context-aware layout adjustments
 *
 * @requires svelte/store - For creating and managing Svelte stores
 * @requires ./screenSizeStore - For accessing the screen size store and enum
 * @requires ./store - For accessing the application mode store
 */

import { get, writable } from 'svelte/store';
import { screenSize, ScreenSize } from './screenSizeStore'; // Import from screenSizeStore
import { mode } from './collectionStore';

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

// Function to get default left state based on screen size
function getDefaultLeftState(): 'hidden' | 'collapsed' | 'full' {
	const size = get(screenSize);
	if (size === ScreenSize.SM) {
		return 'hidden'; // Start hidden on mobile
	} else if (size === ScreenSize.MD) {
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

// Function to handle sidebar toggle based on mode and screen size
export const handleSidebarToggle = () => {
	const size = get(screenSize);
	const currentMode = get(mode);

	if (size === ScreenSize.SM) {
		if (currentMode === 'view' || currentMode === 'media') {
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
	} else if (size === ScreenSize.MD) {
		if (currentMode === 'view' || currentMode === 'media') {
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
	} else if (size === ScreenSize.LG || size === ScreenSize.XL) {
		if (currentMode === 'view' || currentMode === 'media') {
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

// Automatically update sidebar state when screen size changes
if (typeof window !== 'undefined') {
	screenSize.subscribe(() => {
		handleSidebarToggle();
	});
}
