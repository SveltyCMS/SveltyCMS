/**
 * @file src/stores/sidebarStore.ts
 * @description Manages the sidebar and responsive layout states using Svelte stores
 *
 * This module provides functionality to:
 * - Define and manage sidebar states for different parts of the layout
 * - Handle responsive sidebar behavior based on screen width and application mode
 *
 * Key features:
 * - Responsive design handling with ScreenSize enum and screenSize store
 * - SidebarState interface defining states for various layout components
 * - Reactive stores for managing the current state of layout components
 * - Functions for toggling sidebar states and handling responsive behavior
 * - Integration with application mode for context-aware layout adjustments
 */

import { screenSize, ScreenSize } from './screenSizeStore.svelte';
import { mode } from './collectionStore.svelte';
import { store } from "@utils/reactivity.svelte";

// Types for sidebar visibility states
type SidebarVisibility = 'hidden' | 'collapsed' | 'full';

// Interface for sidebar states
export interface SidebarState {
	left: SidebarVisibility;
	right: SidebarVisibility;
	pageheader: SidebarVisibility;
	pagefooter: SidebarVisibility;
	header: SidebarVisibility;
	footer: SidebarVisibility;
}

// Helper function to get default left state based on screen size
function getDefaultLeftState(size: ScreenSize): SidebarVisibility {
	if (size === ScreenSize.SM) {
		return 'hidden';
	} else if (size === ScreenSize.MD) {
		return 'collapsed';
	} else {
		return 'full';
	}
}

// Create base stores
const createSidebarStores = () => {
	let resizeObserver: ResizeObserver | null = null;
	const initialSize = screenSize.value;

	// Base stores
	const sidebar = store<SidebarState>({
		left: getDefaultLeftState(initialSize),
		right: 'hidden',
		pageheader: 'hidden',
		pagefooter: 'hidden',
		header: 'hidden',
		footer: 'hidden'
	});

	const userPreferred = store<SidebarVisibility>('collapsed');
	const isInitialized = store(false);

	// Derived values

	const isLeftVisible = $derived(() => sidebar.value.left !== 'hidden');
	const isRightVisible = $derived(() => sidebar.value.right !== 'hidden');
	const isHeaderVisible = $derived(() => sidebar.value.header !== 'hidden');
	const isFooterVisible = $derived(() => sidebar.value.footer !== 'hidden');


	// Layout handlers
	function handleMobileLayout(currentMode: string) {
		const isViewMode = currentMode === 'view' || currentMode === 'media';
		sidebar.set({
			left: 'hidden',
			right: 'hidden',
			pageheader: isViewMode ? 'hidden' : 'full',
			pagefooter: isViewMode ? 'hidden' : 'full',
			header: 'hidden',
			footer: 'hidden'
		});
	}

	function handleTabletLayout(currentMode: string) {
		const isViewMode = currentMode === 'view' || currentMode === 'media';
		sidebar.set({
			left: isViewMode ? 'collapsed' : 'hidden',
			right: 'hidden',
			pageheader: isViewMode ? 'hidden' : 'full',
			pagefooter: isViewMode ? 'hidden' : 'full',
			header: 'hidden',
			footer: 'hidden'
		});
	}

	function handleDesktopLayout(currentMode: string) {
		const isViewMode = currentMode === 'view' || currentMode === 'media';
		sidebar.set({
			left: isViewMode ? 'full' : 'collapsed',
			right: isViewMode ? 'hidden' : 'full',
			pageheader: isViewMode ? 'hidden' : 'full',
			pagefooter: 'hidden',
			header: 'hidden',
			footer: 'hidden'
		});
	}

	// Handle sidebar toggle based on mode and screen size
	function handleSidebarToggle() {
		const currentSize = screenSize.value;
		const currentMode = mode.value;

		if (currentSize === ScreenSize.SM) {
			handleMobileLayout(currentMode);
		} else if (currentSize === ScreenSize.MD) {
			handleTabletLayout(currentMode);
		} else {
			handleDesktopLayout(currentMode);
		}
	}

	// Toggle sidebar visibility
	function toggleSidebar(side: keyof SidebarState, state: SidebarVisibility) {
		sidebar.update(($sidebar) => ({
			...$sidebar,
			[side]: state
		}));
	}

	// Initialize sidebar manager
	function initialize() {
		if (isInitialized.value || typeof window === 'undefined') {
			return;
		}

		// Set up ResizeObserver for screen size changes
		resizeObserver = new ResizeObserver(() => {
			if (screenSize.value) {
				handleSidebarToggle();
			}
		});

		// Observe document body for size changes
		resizeObserver.observe(document.body);

		// Initial toggle
		handleSidebarToggle();

		isInitialized.set(true);
	}

	// Cleanup method
	function destroy() {
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
	}

	return {
		// Base stores
		sidebar,
		userPreferred,
		isInitialized,

		// Derived values
		isLeftVisible,
		isRightVisible,
		isHeaderVisible,
		isFooterVisible,

		// Functions
		toggleSidebar,
		handleSidebarToggle,
		initialize,
		destroy
	};
};

// Create and export stores
export const sidebarState =  createSidebarStores();

// Export individual stores with their full store interface
export const userPreferredState = {
	subscribe: sidebarState.userPreferred.subscribe,
	set: sidebarState.userPreferred.set,
	update: sidebarState.userPreferred.update
};



// Export functions
export const toggleSidebar = sidebarState.toggleSidebar;
export const handleSidebarToggle = sidebarState.handleSidebarToggle;

// Initialize the sidebar manager
if (typeof window !== 'undefined') {
	sidebarState.initialize();
}
