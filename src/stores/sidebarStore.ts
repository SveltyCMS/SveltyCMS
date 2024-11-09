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

import { writable, derived, get } from 'svelte/store';
import { screenSize, ScreenSize } from './screenSizeStore';
import { mode } from './collectionStore';

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
	const initialSize = get(screenSize);

	// Base stores
	const sidebar = writable<SidebarState>({
		left: getDefaultLeftState(initialSize),
		right: 'hidden',
		pageheader: 'hidden',
		pagefooter: 'hidden',
		header: 'hidden',
		footer: 'hidden'
	});

	const userPreferred = writable<SidebarVisibility>('collapsed');
	const isInitialized = writable(false);

	// Derived values
	const isLeftVisible = derived(sidebar, ($sidebar) => $sidebar.left !== 'hidden');
	const isRightVisible = derived(sidebar, ($sidebar) => $sidebar.right !== 'hidden');
	const isHeaderVisible = derived(sidebar, ($sidebar) => $sidebar.header !== 'hidden');
	const isFooterVisible = derived(sidebar, ($sidebar) => $sidebar.footer !== 'hidden');
	const isMobileLayout = derived(screenSize, ($size) => $size === ScreenSize.SM);
	const isTabletLayout = derived(screenSize, ($size) => $size === ScreenSize.MD);
	const isDesktopLayout = derived(screenSize, ($size) => $size === ScreenSize.LG || $size === ScreenSize.XL);

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
		const currentSize = get(screenSize);
		const currentMode = get(mode);

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
		if (get(isInitialized) || typeof window === 'undefined') {
			return;
		}

		// Set up ResizeObserver for screen size changes
		resizeObserver = new ResizeObserver(() => {
			if (get(screenSize)) {
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
		isMobileLayout,
		isTabletLayout,
		isDesktopLayout,

		// Functions
		toggleSidebar,
		handleSidebarToggle,
		initialize,
		destroy
	};
};

// Create and export stores
const stores = createSidebarStores();

// Export individual stores with their full store interface
export const sidebarState = {
	subscribe: stores.sidebar.subscribe,
	set: stores.sidebar.set
};

export const userPreferredState = {
	subscribe: stores.userPreferred.subscribe,
	set: stores.userPreferred.set
};

// Export derived values
export const isLeftVisible = { subscribe: stores.isLeftVisible.subscribe };
export const isRightVisible = { subscribe: stores.isRightVisible.subscribe };
export const isHeaderVisible = { subscribe: stores.isHeaderVisible.subscribe };
export const isFooterVisible = { subscribe: stores.isFooterVisible.subscribe };
export const isMobileLayout = { subscribe: stores.isMobileLayout.subscribe };
export const isTabletLayout = { subscribe: stores.isTabletLayout.subscribe };
export const isDesktopLayout = { subscribe: stores.isDesktopLayout.subscribe };

// Export functions
export const toggleSidebar = stores.toggleSidebar;
export const handleSidebarToggle = stores.handleSidebarToggle;

// Initialize the sidebar manager
if (typeof window !== 'undefined') {
	stores.initialize();
}
