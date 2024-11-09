/**
 * @file src/stores/sidebarStore.ts
 * @description Manages the sidebar and responsive layout states
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
 */

import { screenSizeManager } from './screenSizeStore';
import { ScreenSize } from './screenSizeStore';
import { collectionState } from './collectionStore';

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

class SidebarManager {
	private resizeObserver: ResizeObserver | null = null;

	// State declaration
	$state = {
		sidebar: {
			left: this.getDefaultLeftState(),
			right: 'hidden',
			pageheader: 'hidden',
			pagefooter: 'hidden',
			header: 'hidden',
			footer: 'hidden'
		} as SidebarState,
		userPreferred: 'collapsed' as SidebarVisibility,
		isInitialized: false
	};

	// Computed values
	get $derived() {
		return {
			isLeftVisible: this.$state.sidebar.left !== 'hidden',
			isRightVisible: this.$state.sidebar.right !== 'hidden',
			isHeaderVisible: this.$state.sidebar.header !== 'hidden',
			isFooterVisible: this.$state.sidebar.footer !== 'hidden',
			isMobileLayout: screenSizeManager.$state.currentSize === ScreenSize.SM,
			isTabletLayout: screenSizeManager.$state.currentSize === ScreenSize.MD,
			isDesktopLayout: screenSizeManager.$state.currentSize === ScreenSize.LG || screenSizeManager.$state.currentSize === ScreenSize.XL
		};
	}

	// Get default left state based on screen size
	private getDefaultLeftState(): SidebarVisibility {
		const size = screenSizeManager.$state.currentSize;
		if (size === ScreenSize.SM) {
			return 'hidden';
		} else if (size === ScreenSize.MD) {
			return 'collapsed';
		} else {
			return 'full';
		}
	}

	// Toggle sidebar visibility
	toggleSidebar(side: keyof SidebarState, state: SidebarVisibility) {
		this.$state.sidebar[side] = state;
	}

	// Set user preferred state
	setUserPreferredState(state: SidebarVisibility) {
		this.$state.userPreferred = state;
	}

	// Handle sidebar toggle based on mode and screen size
	handleSidebarToggle() {
		const { currentSize } = screenSizeManager.$state;
		const currentMode = collectionState.$state.mode;

		if (currentSize === ScreenSize.SM) {
			this.handleMobileLayout(currentMode);
		} else if (currentSize === ScreenSize.MD) {
			this.handleTabletLayout(currentMode);
		} else {
			this.handleDesktopLayout(currentMode);
		}
	}

	private handleMobileLayout(mode: string) {
		const isViewMode = mode === 'view' || mode === 'media';
		this.$state.sidebar = {
			left: 'hidden',
			right: 'hidden',
			pageheader: isViewMode ? 'hidden' : 'full',
			pagefooter: isViewMode ? 'hidden' : 'full',
			header: 'hidden',
			footer: 'hidden'
		};
	}

	private handleTabletLayout(mode: string) {
		const isViewMode = mode === 'view' || mode === 'media';
		this.$state.sidebar = {
			left: isViewMode ? 'collapsed' : 'hidden',
			right: 'hidden',
			pageheader: isViewMode ? 'hidden' : 'full',
			pagefooter: isViewMode ? 'hidden' : 'full',
			header: 'hidden',
			footer: 'hidden'
		};
	}

	private handleDesktopLayout(mode: string) {
		const isViewMode = mode === 'view' || mode === 'media';
		this.$state.sidebar = {
			left: isViewMode ? 'full' : 'collapsed',
			right: isViewMode ? 'hidden' : 'full',
			pageheader: isViewMode ? 'hidden' : 'full',
			pagefooter: 'hidden',
			header: 'hidden',
			footer: 'hidden'
		};
	}

	// Initialize sidebar manager
	initialize() {
		if (this.$state.isInitialized || typeof window === 'undefined') {
			return;
		}

		// Set up ResizeObserver for screen size changes
		this.resizeObserver = new ResizeObserver(() => {
			if (screenSizeManager.$state.currentSize) {
				this.handleSidebarToggle();
			}
		});

		// Observe document body for size changes
		this.resizeObserver.observe(document.body);

		// Initial toggle
		this.handleSidebarToggle();

		this.$state.isInitialized = true;
	}

	// Cleanup method
	destroy() {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}
}

// Create and export singleton instance
export const sidebarManager = new SidebarManager();

// For backward compatibility with existing code that uses stores
export const sidebarState = {
	subscribe: (fn: (value: SidebarState) => void) => {
		fn(sidebarManager.$state.sidebar);
		return () => {
			sidebarManager.destroy();
		};
	},
	set: (value: SidebarState) => {
		sidebarManager.$state.sidebar = value;
	}
};

export const userPreferredState = {
	subscribe: (fn: (value: SidebarVisibility) => void) => {
		fn(sidebarManager.$state.userPreferred);
		return () => {};
	},
	set: (value: SidebarVisibility) => {
		sidebarManager.setUserPreferredState(value);
	}
};

// Export functions for backward compatibility
export const toggleSidebar = (side: keyof SidebarState, state: SidebarVisibility) => sidebarManager.toggleSidebar(side, state);

export const handleSidebarToggle = () => sidebarManager.handleSidebarToggle();

// Initialize the sidebar manager
if (typeof window !== 'undefined') {
	sidebarManager.initialize();
}
