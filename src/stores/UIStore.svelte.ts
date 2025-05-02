/**
 * @file src/stores/UIStore.svelte.ts
 * @description Manages UI visibility states with Svelte 5 runes
 * 
 * Features:
 * - Responsive UI element visibility management
 * - Reactive updates based on screen size and collection mode
 * - Automatic cleanup through Svelte 5 effect system
 * - Floating navigation for mobile/tablet views
 */

import { screenSize, ScreenSize } from './screenSizeStore.svelte';
import { mode } from './collectionStore.svelte';
import { store } from '@utils/reactivity.svelte';
import { logger } from '@utils/logger.svelte';

// Types for UI visibility states
export type UIVisibility = 'hidden' | 'collapsed' | 'full';

export const UIVisibility = {
	HIDDEN: 'hidden',
	COLLAPSED: 'collapsed',
	FULL: 'full'
} as const;

// Interface for UI state
export interface UIState {
	leftSidebar: UIVisibility;
	rightSidebar: UIVisibility;
	pageheader: UIVisibility;
	pagefooter: UIVisibility;
	header: UIVisibility;
	footer: UIVisibility;
}

// Creates and manages UI stores with reactive updates
const createUIStores = () => {
	// Create reactive stores
	const uiState = store<UIState>({
		leftSidebar: 'collapsed',
		rightSidebar: 'hidden',
		pageheader: 'full',
		pagefooter: 'full',
		header: 'hidden',
		footer: 'hidden'
	});

	// Calculates default UI state based on screen size and view mode
	const getDefaultState = (size: ScreenSize, isViewMode: boolean): UIState => {
		// Debug log current state
		logger.debug('UIStore: Calculating default state', {
			screenSize: ScreenSize[size],
			isViewMode
		});

		// Mobile behavior (<768px)
		if (size === ScreenSize.XS || size === ScreenSize.SM) {
			return {
				leftSidebar: 'hidden',
				rightSidebar: 'hidden',
				pageheader: isViewMode ? 'hidden' : 'full',
				pagefooter: isViewMode ? 'hidden' : 'full',
				header: 'hidden',
				footer: 'hidden'
			};
		}

		// Tablet behavior (768-1023px)
		if (size === ScreenSize.MD) {
			return {
				leftSidebar: isViewMode ? 'collapsed' : 'hidden',
				rightSidebar: 'hidden',
				pageheader: isViewMode ? 'hidden' : 'full',
				pagefooter: isViewMode ? 'hidden' : 'full',
				header: 'hidden',
				footer: 'hidden'
			};
		}

		// Desktop behavior (≥1024px)
		return {
			leftSidebar: isViewMode ? 'full' : 'collapsed',
			rightSidebar: isViewMode ? 'hidden' : 'full',
			pageheader: isViewMode ? 'hidden' : 'full',
			pagefooter: isViewMode ? 'hidden' : 'full',
			header: 'hidden',
			footer: 'hidden'
		};
	};

	// Updates layout based on current screen size and mode
	const updateLayout = () => {
		const currentSize = screenSize.value;
		const isViewMode = mode.value === 'view' || mode.value === 'media';

		const newState = getDefaultState(currentSize, isViewMode);

		// Use requestAnimationFrame for smooth transitions
		if (typeof window !== 'undefined') {
			requestAnimationFrame(() => {
				uiState.set(newState);
			});
		} else {
			uiState.set(newState);
		}

		logger.debug('UIStore: Layout update', {
			screenSize: ScreenSize[currentSize],
			mode: mode.value,
			newState
		});
	};

	// Set up event listeners for screen size and mode changes
	let unsubscribeScreenSize: (() => void) | null = null;
	let unsubscribeMode: (() => void) | null = null;

	if (typeof window !== 'undefined') {
		unsubscribeScreenSize = screenSize.subscribe(updateLayout);
		unsubscribeMode = mode.subscribe(updateLayout);
	}

	// Cleanup function
	const cleanup = () => {
		if (unsubscribeScreenSize) unsubscribeScreenSize();
		if (unsubscribeMode) unsubscribeMode();
	};


	// Derived visibility stores
	const isLeftSidebarVisible = store(() => uiState.value.leftSidebar !== 'hidden');
	const isRightSidebarVisible = store(() => uiState.value.rightSidebar !== 'hidden');
	const isPageHeaderVisible = store(() => uiState.value.pageheader !== 'hidden');
	const isPageFooterVisible = store(() => uiState.value.pagefooter !== 'hidden');
	const isHeaderVisible = store(() => uiState.value.header !== 'hidden');
	const isFooterVisible = store(() => uiState.value.footer !== 'hidden');

	// Mobile/tablet detection
	const isMobile = store(() => {
		const size = screenSize.value;
		return size === ScreenSize.XS || size === ScreenSize.SM || size === ScreenSize.MD;
	});

	// Updates a specific UI element's visibility state
	const toggleUIElement = (element: keyof UIState, state: UIVisibility) => {
		uiState.update(current => ({ ...current, [element]: state }));
	};

	// Cycles an element through its visibility states: full -> collapsed -> hidden -> full
	const handleUILayoutToggle = (element: keyof UIState) => {
		const current = uiState.value[element];
		const next = current === 'full' ? 'collapsed' : current === 'collapsed' ? 'hidden' : 'full';
		toggleUIElement(element, next);
	};

	//Toggles the left sidebar between full and collapsed states
	const toggleLeftSidebar = () => {
		const currentState = uiState.value.leftSidebar;
		const newState = currentState === 'full' ? 'collapsed' : 'full';

		toggleUIElement('leftSidebar', newState);
	};

	// Initializes UI state (for SSR compatibility)
	const initialize = () => {
		if (typeof window === 'undefined') return;
		updateLayout();
	};

	return {
		// Cleanup function
		cleanup,

		// Base store
		uiState,

		// Derived visibility stores
		isLeftSidebarVisible,
		isRightSidebarVisible,
		isPageHeaderVisible,
		isPageFooterVisible,
		isHeaderVisible,
		isFooterVisible,
		isMobile,

		// Functions
		toggleUIElement,
		handleUILayoutToggle,
		toggleLeftSidebar,
		updateLayout,
		initialize
	};
};

// Create and export the UI state manager
export const uiStateManager = createUIStores();

// Export individual stores and functions 
export const {
	uiState,
	isLeftSidebarVisible,
	isRightSidebarVisible,
	isPageHeaderVisible,
	isPageFooterVisible,
	isHeaderVisible,
	isFooterVisible,
	isMobile,
	toggleUIElement,
	handleUILayoutToggle,
	toggleLeftSidebar
} = uiStateManager;

// Auto-initialize (client-side only)
if (typeof window !== 'undefined') {
	uiStateManager.initialize();
}