/**
 * @file src/stores/UIStore.svelte.ts
 * @description Manages the UI element visibility states
 *
 * Features:
 * - UI element visibility management with Svelte stores
 * - Responsive layout updates based on screen size and collection mode
 * - Lazy initialization and cleanup
 * - Debug logging for state changes
 */

// Stores
import { store } from '@utils/reactivity.svelte';
import { mode } from './collectionStore.svelte';
import { screenSize, ScreenSize } from './screenSizeStore.svelte';

// System Logger
import { logger } from '@utils/logger.svelte';

// Types for UI visibility states
export type UIVisibility = 'hidden' | 'collapsed' | 'full';

// Interface for UI state
export interface UIState {
	leftSidebar: UIVisibility;
	rightSidebar: UIVisibility;
	pageheader: UIVisibility;
	pagefooter: UIVisibility;
	header: UIVisibility;
	footer: UIVisibility;
}

// Create base stores
const createUIStores = () => {
	let resizeObserver: ResizeObserver | null = null;
	let modeUnsubscribe: (() => void) | null = null;
	let screenSizeUnsubscribe: (() => void) | null = null;
	const initialSize = screenSize.value;

	// Tailored default state based on screen size and mode
	const getDefaultState = (size: ScreenSize, isViewMode: boolean): UIState => {
		// Mobile behavior (<768px) - Always hide sidebar on mobile to show FloatingNav
		if (size === ScreenSize.XS || size === ScreenSize.SM) {
			return {
				leftSidebar: 'hidden', // ALWAYS hidden on mobile regardless of mode
				rightSidebar: 'hidden',
				pageheader: isViewMode ? 'hidden' : 'full',
				pagefooter: isViewMode ? 'hidden' : 'full', // Show pagefooter on mobile when editing (Fields.svelte needs it)
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
				pagefooter: isViewMode ? 'hidden' : 'full', // Show pagefooter on tablet when editing too
				header: 'hidden',
				footer: 'hidden'
			};
		}

		// Desktop behavior (≥1024px)
		return {
			leftSidebar: isViewMode ? 'full' : 'collapsed',
			rightSidebar: isViewMode ? 'hidden' : 'full',
			pageheader: isViewMode ? 'hidden' : 'full',
			pagefooter: isViewMode ? 'hidden' : 'hidden', // Hide on desktop edit mode since RightSidebar shows detailed info
			header: 'hidden',
			footer: 'hidden'
		};
	};

	// Base stores with initial states
	const uiState = store<UIState>(getDefaultState(initialSize, mode.value === 'view' || mode.value === 'media'));
	const userPreferred = store<UIVisibility>('collapsed');
	const isInitialized = store(false);

	// Visibility stores (derived)
	const visibilityStores = {
		isLeftSidebarVisible: store(() => uiState.value.leftSidebar !== 'hidden'),
		isRightSidebarVisible: store(() => uiState.value.rightSidebar !== 'hidden'),
		isPageHeaderVisible: store(() => uiState.value.pageheader !== 'hidden'),
		isPageFooterVisible: store(() => uiState.value.pagefooter !== 'hidden'),
		isHeaderVisible: store(() => uiState.value.header !== 'hidden'),
		isFooterVisible: store(() => uiState.value.footer !== 'hidden')
	};

	// Batch update helper
	const batchUpdate = (newState: Partial<UIState>) => {
		uiState.update((current) => ({ ...current, ...newState }));
	};

	// Optimized layout handler with immediate response and smart diffing
	const isUpdating = store(false);
	let lastMode = mode.value; // Track last mode value

	function updateLayout() {
		if (isUpdating.value) return;
		isUpdating.value = true;

		try {
			const currentSize = screenSize.value;
			// Use lastMode instead of reading mode.value directly
			const isViewMode = lastMode === 'view' || lastMode === 'media';
			const newState = getDefaultState(currentSize, isViewMode);

			// Only update if state actually changes
			const prevState = uiState.value;
			const isDifferent = Object.keys(newState).some((key) => newState[key as keyof UIState] !== prevState[key as keyof UIState]);
			if (isDifferent) {
				requestAnimationFrame(() => {
					uiState.set(newState);
				});
				logger.debug('UIStore: Layout update', {
					screenSize: currentSize,
					mode: lastMode,
					newState,
					windowWidth: window.innerWidth
				});
			}
		} finally {
			isUpdating.value = false;
		}
	}

	// Debounced resize handler
	let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
	function debouncedUpdateLayout() {
		if (resizeTimeout) clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(() => {
			updateLayout();
			resizeTimeout = null;
		}, 100);
	}

	// Set up mode change handler
	const originalModeSet = mode.set;
	mode.set = (newMode) => {
		if (newMode === lastMode) return; // Skip if mode hasn't changed
		lastMode = newMode; // Update lastMode
		originalModeSet(newMode);
		// Use requestAnimationFrame to batch updates
		requestAnimationFrame(updateLayout);
	};

	// Initial layout update
	updateLayout();

	// Toggle individual UI element visibility
	function toggleUIElement(element: keyof UIState, state: UIVisibility) {
		batchUpdate({ [element]: state });
	}

	// Lazy initialization
	let initPromise: Promise<void> | null = null;
	function initialize() {
		if (isInitialized.value || typeof window === 'undefined') {
			return Promise.resolve();
		}

		if (!initPromise) {
			initPromise = new Promise<void>((resolve) => {
				const setup = () => {
					if (resizeObserver) return;

					// Use both resize observer and window resize listener for better reliability
					resizeObserver = new ResizeObserver(() => {
						if (screenSize.value) {
							debouncedUpdateLayout();
						}
					});

					resizeObserver.observe(document.body);

					// Add direct resize listener as fallback
					window.addEventListener('resize', debouncedUpdateLayout);
					screenSizeUnsubscribe = screenSize.subscribe(updateLayout);

					updateLayout();
					isInitialized.set(true);
					logger.debug('UIStore: Initialized');
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

	// Cleanup
	function destroy() {
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
		if (modeUnsubscribe) {
			modeUnsubscribe();
			modeUnsubscribe = null;
		}
		if (screenSizeUnsubscribe) {
			screenSizeUnsubscribe();
			screenSizeUnsubscribe = null;
		}
		window.removeEventListener('resize', debouncedUpdateLayout);
		if (resizeTimeout) {
			clearTimeout(resizeTimeout);
			resizeTimeout = null;
		}
		initPromise = null;
		logger.debug('UIStore: Destroyed');
	}

	return {
		// Base stores
		uiState,
		userPreferred,
		isInitialized,

		// Derived visibility stores
		...visibilityStores,

		// Functions
		toggleUIElement,
		updateLayout,
		initialize,
		destroy
	};
};

// Create and export the UI state manager
export const uiStateManager = createUIStores();

// Export individual stores
export const userPreferredState = {
	subscribe: uiStateManager.userPreferred.subscribe,
	set: uiStateManager.userPreferred.set,
	update: uiStateManager.userPreferred.update
};

// Export functions
export const toggleUIElement = uiStateManager.toggleUIElement;
export const handleUILayoutToggle = uiStateManager.updateLayout;

// Auto-initialize (client-side only)
if (typeof window !== 'undefined') {
	uiStateManager.initialize();
}

// This state will be controlled by widgets to show/hide special header buttons.
const headerOptions = $state({
	showMore: false
});

// Centralized headerController for Widgets to use this to request special UI element
export const headerController = {
	get options() {
		return headerOptions;
	},
	// Sets the visibility of the 'Show More' (...) button in the headerEdit/RightSidebar.
	setShowMore(visible: boolean) {
		headerOptions.showMore = visible;
	}
};
