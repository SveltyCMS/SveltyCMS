/**
 * @file src/stores/UIStore.svelte.ts
 * @description Manages the UI element visibility states
 *
 * Features:
 * - UI element visibility management
 * - Responsive layout updates based on screen size and collection mode
 * - Lazy initialization and cleanup
 * - Optimized reactivity with consolidated effects
 * - Smart manual override handling
 */

// Stores
import { mode } from './collectionStore.svelte';
import { screenSize, ScreenSize } from './screenSizeStore.svelte';

// System Logger
import { logger } from '@utils/logger';

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
	const initialSize = screenSize.value;

	let routeContext = $state({ isImageEditor: false, isCollectionBuilder: false });

	function setRouteContext(context: { isImageEditor?: boolean; isCollectionBuilder?: boolean }) {
		const newContext = { ...routeContext, ...context };
		if (JSON.stringify(routeContext) !== JSON.stringify(newContext)) {
			routeContext = newContext;
			logger.debug('UIStore: Route context updated', newContext);
			updateLayout();
		}
	}

	// Tailored default state based on screen size and mode
	const getDefaultState = (size: ScreenSize, isViewMode: boolean): UIState => {
		// Special route: Image Editor
		if (routeContext.isImageEditor) {
			return {
				leftSidebar: 'collapsed',
				rightSidebar: 'hidden',
				pageheader: 'full',
				pagefooter: 'full',
				header: 'hidden',
				footer: 'hidden'
			};
		}

		// Special route: Collection Builder
		if (routeContext.isCollectionBuilder) {
			return {
				leftSidebar: 'collapsed',
				rightSidebar: 'hidden',
				pageheader: 'full',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
		}

		// Determine if we should show the collection header (HeaderEdit)
		// Show in edit, create, modify, media modes (exclude view as EntryList has its own header)
		const isCollectionMode = ['edit', 'create', 'modify', 'media'].includes(mode.value);

		// Mobile behavior (<768px)
		if (size === ScreenSize.XS || size === ScreenSize.SM) {
			return {
				leftSidebar: 'hidden', // Always hidden on mobile
				rightSidebar: 'hidden',
				pageheader: isCollectionMode ? 'full' : 'hidden',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
		}

		// Tablet behavior (768-1023px)
		if (size === ScreenSize.MD) {
			return {
				leftSidebar: isViewMode ? 'collapsed' : 'hidden',
				rightSidebar: 'hidden',
				pageheader: isCollectionMode ? 'full' : 'hidden',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
		}

		// Desktop behavior (≥1024px)
		return {
			leftSidebar: isViewMode ? 'full' : 'collapsed',
			rightSidebar: isViewMode ? 'hidden' : 'full',
			pageheader: isCollectionMode ? 'full' : 'hidden',
			pagefooter: 'hidden',
			header: 'hidden',
			footer: 'hidden'
		};
	};

	// Base state with Svelte 5 runes
	const initialMode = mode.value;
	const initialIsViewMode = initialMode === 'view' || initialMode === 'media';
	logger.debug('UIStore: Initializing with mode', { initialMode, initialIsViewMode, initialSize });

	let uiState = $state<UIState>(getDefaultState(initialSize, initialIsViewMode));
	let userPreferred = $state<UIVisibility>('collapsed');
	let isInitialized = $state(false);

	// ✅ OPTIMIZATION 1: Better manual override tracking
	let userManuallyToggledSidebar = $state(false);
	let manualToggleTimer: ReturnType<typeof setTimeout> | null = null;

	// Batch update helper
	const batchUpdate = (newState: Partial<UIState>) => {
		uiState = { ...uiState, ...newState };
	};

	// ✅ OPTIMIZATION 2: Simplified layout update logic
	let isUpdating = $state(false);

	function updateLayout() {
		if (isUpdating) return;

		// Skip if user just manually toggled
		if (userManuallyToggledSidebar) {
			logger.debug('UIStore: Skipping layout update - manual override active');
			return;
		}

		isUpdating = true;

		try {
			const currentSize = screenSize.value;
			const isViewMode = mode.value === 'view' || mode.value === 'media';
			const newState = getDefaultState(currentSize, isViewMode);

			// Only update if state actually changes
			const isDifferent = Object.keys(newState).some((key) => newState[key as keyof UIState] !== uiState[key as keyof UIState]);

			if (isDifferent) {
				requestAnimationFrame(() => {
					uiState = newState;
					logger.debug('UIStore: State updated', { newState });
				});
			}
		} finally {
			isUpdating = false;
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

	// Initial layout update
	updateLayout();

	// ✅ OPTIMIZATION 3: Improved toggle with timer cleanup
	function toggleUIElement(element: keyof UIState, state: UIVisibility) {
		batchUpdate({ [element]: state });

		// Set manual override flag for sidebars
		if (element === 'leftSidebar' || element === 'rightSidebar') {
			userManuallyToggledSidebar = true;

			// Clear existing timer
			if (manualToggleTimer) {
				clearTimeout(manualToggleTimer);
			}

			// Reset flag after animation completes
			manualToggleTimer = setTimeout(() => {
				userManuallyToggledSidebar = false;
				manualToggleTimer = null;
				logger.debug('UIStore: Manual override cleared');
			}, 600);
		}
	}

	// Lazy initialization
	let initPromise: Promise<void> | null = null;
	function initialize() {
		if (isInitialized || typeof window === 'undefined') {
			return Promise.resolve();
		}

		if (!initPromise) {
			initPromise = new Promise<void>((resolve) => {
				const setup = () => {
					if (resizeObserver) return;

					// Resize observer for body size changes
					resizeObserver = new ResizeObserver(() => {
						if (screenSize) {
							debouncedUpdateLayout();
						}
					});

					resizeObserver.observe(document.body);

					// Window resize listener as fallback
					window.addEventListener('resize', debouncedUpdateLayout);

					updateLayout();
					isInitialized = true;
					logger.trace('UIStore: Initialized');
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

		window.removeEventListener('resize', debouncedUpdateLayout);

		if (resizeTimeout) {
			clearTimeout(resizeTimeout);
			resizeTimeout = null;
		}

		if (manualToggleTimer) {
			clearTimeout(manualToggleTimer);
			manualToggleTimer = null;
		}

		// Clean up effect root if it exists
		if (effectRoot) {
			effectRoot();
			effectRoot = undefined;
		}

		initPromise = null;
		logger.trace('UIStore: Destroyed');
	}

	return {
		// Base state accessors
		uiState: {
			get value() {
				return uiState;
			},
			set value(newValue: UIState) {
				uiState = newValue;
			}
		},
		userPreferred: {
			get value() {
				return userPreferred;
			},
			set value(newValue: UIVisibility) {
				userPreferred = newValue;
			}
		},
		isInitialized: {
			get value() {
				return isInitialized;
			},
			set value(newValue: boolean) {
				isInitialized = newValue;
			}
		},

		// Derived visibility
		isLeftSidebarVisible: {
			get value() {
				return uiState.leftSidebar !== 'hidden';
			}
		},
		isRightSidebarVisible: {
			get value() {
				return uiState.rightSidebar !== 'hidden';
			}
		},
		isPageHeaderVisible: {
			get value() {
				return uiState.pageheader !== 'hidden';
			}
		},
		isPageFooterVisible: {
			get value() {
				return uiState.pagefooter !== 'hidden';
			}
		},
		isHeaderVisible: {
			get value() {
				return uiState.header !== 'hidden';
			}
		},
		isFooterVisible: {
			get value() {
				return uiState.footer !== 'hidden';
			}
		},

		// Functions
		toggleUIElement,
		updateLayout,
		initialize,
		destroy,
		setRouteContext
	};
};

// Create and export the UI state manager
let effectRoot: (() => void) | undefined;

export const uiStateManager = (() => {
	const manager = createUIStores();

	// ✅ OPTIMIZATION 4: Single consolidated effect for mode changes
	if (typeof window !== 'undefined') {
		effectRoot = $effect.root(() => {
			$effect(() => {
				const currentMode = mode.value;
				logger.debug(`UIStore: Mode changed to '${currentMode}', updating layout`);
				manager.updateLayout();
			});
		});
	}

	return manager;
})();

// Export individual store-like wrappers for backward compatibility
export const userPreferredState = {
	get value() {
		return uiStateManager.userPreferred.value;
	},
	set value(val: UIVisibility) {
		uiStateManager.userPreferred.value = val;
	},
	set(val: UIVisibility) {
		uiStateManager.userPreferred.value = val;
	}
};

// Export functions
export const toggleUIElement = uiStateManager.toggleUIElement;
export const handleUILayoutToggle = uiStateManager.updateLayout;
export const setRouteContext = uiStateManager.setRouteContext;

// Auto-initialize (client-side only)
if (typeof window !== 'undefined') {
	uiStateManager.initialize();
}

// Header options controller
const headerOptions = $state({
	showMore: false
});

export const headerController = {
	get options() {
		return headerOptions;
	},
	setShowMore(visible: boolean) {
		headerOptions.showMore = visible;
	}
};
