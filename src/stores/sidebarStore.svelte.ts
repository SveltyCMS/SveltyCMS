/**
 * @file src/stores/sidebarStore.ts
 * @description Manages the sidebar and responsive layout states using Svelte stores
 * 
 * Features:	
 * - Sidebar state management with Svelte stores
 * - Responsive layout updates based on screen size and collection mode
 * - Lazy initialization and cleanup
 * 
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

// Create base stores
const createSidebarStores = () => {
	let resizeObserver: ResizeObserver | null = null;
	const initialSize = screenSize.value;

	// Memoized default state calculation
	const getDefaultState = (size: ScreenSize, isViewMode: boolean): SidebarState => {
		switch (size) {
			case ScreenSize.SM:
				return {
					left: 'hidden',
					right: 'hidden',
					pageheader: isViewMode ? 'hidden' : 'full',
					pagefooter: isViewMode ? 'hidden' : 'full',
					header: 'hidden',
					footer: 'hidden'
				};
			case ScreenSize.MD:
				return {
					left: isViewMode ? 'collapsed' : 'hidden',
					right: 'hidden',
					pageheader: isViewMode ? 'hidden' : 'full',
					pagefooter: isViewMode ? 'hidden' : 'full',
					header: 'hidden',
					footer: 'hidden'
				};
			default:
				return {
					left: isViewMode ? 'full' : 'collapsed',
					right: isViewMode ? 'hidden' : 'full',
					pageheader: isViewMode ? 'hidden' : 'full',
					pagefooter: isViewMode ? 'hidden' : 'full',
					header: 'hidden',
					footer: 'hidden'
				};
		}
	};

	// Base stores with initial states
	const sidebar = store<SidebarState>(getDefaultState(initialSize, mode.value === 'view' || mode.value === 'media'));
	const userPreferred = store<SidebarVisibility>('collapsed');
	const isInitialized = store(false);

	// Memoized visibility computations
	const visibilityStores = {
		left: store(() => sidebar.value.left !== 'hidden'),
		right: store(() => sidebar.value.right !== 'hidden'),
		header: store(() => sidebar.value.header !== 'hidden'),
		footer: store(() => sidebar.value.footer !== 'hidden')
	};

	// Batch update helper
	const batchUpdate = (newState: Partial<SidebarState>) => {
		sidebar.update(current => ({ ...current, ...newState }));
	};

	// Optimized layout handler
	function updateLayout() {
		const currentSize = screenSize.value;
		const isViewMode = mode.value === 'view' || mode.value === 'media';
		
		// Batch update the entire state at once
		sidebar.set(getDefaultState(currentSize, isViewMode));
	}

	// Toggle sidebar visibility with batched updates
	function toggleSidebar(side: keyof SidebarState, state: SidebarVisibility) {
		batchUpdate({ [side]: state });
	}

	// Lazy initialization
	let initPromise: Promise<void> | null = null;
	function initialize() {
		if (isInitialized.value || typeof window === 'undefined') {
			return Promise.resolve();
		}

		if (!initPromise) {
			initPromise = new Promise<void>((resolve) => {
				// Batch initial setup
				const setup = () => {
					if (resizeObserver) return;

					resizeObserver = new ResizeObserver(() => {
						if (screenSize.value) {
							requestAnimationFrame(updateLayout);
						}
					});

					resizeObserver.observe(document.body);
					updateLayout();
					isInitialized.set(true);
					resolve();
				};

				if (document.readyState === 'loading') {
					window.addEventListener('DOMContentLoaded', setup);
				} else {
					setup();
				}
			});
		}

		return initPromise;
	}

	// Cleanup method
	function destroy() {
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
		initPromise = null;
	}

	return {
		// Base stores
		sidebar,
		userPreferred,
		isInitialized,

		// Visibility stores
		isLeftVisible: visibilityStores.left,
		isRightVisible: visibilityStores.right,
		isHeaderVisible: visibilityStores.header,
		isFooterVisible: visibilityStores.footer,

		// Functions
		toggleSidebar,
		updateLayout,
		initialize,
		destroy
	};
};

// Create and export stores
export const sidebarState = createSidebarStores();

// Export individual stores with their full store interface
export const userPreferredState = {
	subscribe: sidebarState.userPreferred.subscribe,
	set: sidebarState.userPreferred.set,
	update: sidebarState.userPreferred.update
};

// Export functions
export const toggleSidebar = sidebarState.toggleSidebar;
export const handleSidebarToggle = sidebarState.updateLayout;

// Initialize the sidebar manager
if (typeof window !== 'undefined') {
	sidebarState.initialize();
}
