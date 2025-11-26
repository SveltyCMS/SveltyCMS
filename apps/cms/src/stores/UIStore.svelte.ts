/**
 * @file src/stores/UIStore.svelte.ts
 * @description Manages the UI element visibility states
 *
 * Features:
 * - UI element visibility management
 * - Responsive layout updates based on screen size and collection mode
 * - Lazy initialization and cleanup
 * - Debug logging for state changes
 */

// Stores
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
	let modeUnsubscribe: (() => void) | null = null;
	let screenSizeUnsubscribe: (() => void) | null = null;
	const initialSize = screenSize.value;

	let routeContext = $state({ isImageEditor: false });

	function setRouteContext(context: { isImageEditor: boolean }) {
		if (routeContext.isImageEditor !== context.isImageEditor) {
			routeContext = context;
			logger.debug('UIStore: Route context updated', context);
			updateLayout();
		}
	}

	// Tailored default state based on screen size and mode
	// Note: Feature routes (e.g., Image Editor) explicitly override header/footer states locally.
	const getDefaultState = (size: ScreenSize, isViewMode: boolean): UIState => {
		// Tailored default state for the image editor route
		if (routeContext.isImageEditor) {
			return {
				leftSidebar: 'hidden',
				rightSidebar: 'hidden',
				pageheader: 'full',
				pagefooter: 'full',
				header: 'hidden',
				footer: 'hidden'
			};
		}

		// Determine if we should show the collection header (HeaderEdit)
		// Show in edit, create, modify, media modes (exclude view as EntryList has its own header)
		const isCollectionMode = ['edit', 'create', 'modify', 'media'].includes(mode.value);

		// Mobile behavior (<768px) - Always hide sidebars; keep page header/footer hidden by default
		if (size === ScreenSize.XS || size === ScreenSize.SM) {
			return {
				leftSidebar: 'hidden', // ALWAYS hidden on mobile regardless of mode
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
	// Start with view mode as default, will be updated by mode changes
	const initialIsViewMode = true;
	logger.debug('UIStore: Initializing', { initialIsViewMode, initialSize });

	let uiState = $state<UIState>(getDefaultState(initialSize, initialIsViewMode));
	let userPreferred = $state<UIVisibility>('collapsed');
	let isInitialized = $state(false);

	// Batch update helper
	const batchUpdate = (newState: Partial<UIState>) => {
		uiState = { ...uiState, ...newState };
	};

	// Optimized layout handler with immediate response and smart diffing
	let isUpdating = $state(false);

	// Prevent updateLayout from overriding recent manual sidebar toggles (layout resize triggers)
	let manualOverrideUntil = 0;

	function updateLayout() {
		if (isUpdating) return;
		isUpdating = true;

		try {
			const currentSize = screenSize.value;
			// Get mode from collectionStore via dynamic import (already loaded by now)
			let isViewMode = true; // Default to view mode
			try {
				// Access mode synchronously if already loaded
				const collectionStore = (globalThis as any).__collectionStore_mode;
				if (collectionStore) {
					isViewMode = collectionStore === 'view' || collectionStore === 'media';
				}
			} catch {
				// Fallback to view mode
			}
			const newState = getDefaultState(currentSize, isViewMode);

			logger.debug('UIStore: updateLayout called', {
				currentSize,
				isViewMode,
				manualOverrideActive: Date.now() < manualOverrideUntil
			});

			// If within manual override window, preserve current sidebar states
			const now = Date.now();
			const prevState = uiState;
			if (now < manualOverrideUntil) {
				logger.debug('UIStore: Manual override active, preserving sidebar states');
				newState.leftSidebar = prevState.leftSidebar;
				newState.rightSidebar = prevState.rightSidebar;
			}

			// Only update if state actually changes
			const isDifferent = Object.keys(newState).some((key) => newState[key as keyof UIState] !== prevState[key as keyof UIState]);
			// logger.debug('UIStore: State comparison', {
			// 	prevState,
			// 	newState,
			// 	isDifferent
			// });

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

	// Toggle individual UI element visibility
	function toggleUIElement(element: keyof UIState, state: UIVisibility) {
		batchUpdate({ [element]: state });
		// Activate manual override briefly to avoid resize-driven resets
		if (element === 'leftSidebar' || element === 'rightSidebar') {
			manualOverrideUntil = Date.now() + 600; // ~0.6s window
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

					// Use both resize observer and window resize listener for better reliability
					resizeObserver = new ResizeObserver(() => {
						if (screenSize) {
							debouncedUpdateLayout();
						}
					});

					resizeObserver.observe(document.body);

					// Add direct resize listener as fallback
					window.addEventListener('resize', debouncedUpdateLayout);
					// Note: screenSize is a rune, so we use $effect for reactive updates instead of subscribe

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
		// Clean up effect root if it exists
		if (effectRoot) {
			effectRoot();
			effectRoot = undefined;
		}
		initPromise = null;
		logger.trace('UIStore: Destroyed');
	}

	return {
		// Base state accessors - wrapped in objects with .value for backward compatibility
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

		// Derived visibility - wrapped in objects with .value
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

	// Set up mode tracking using $effect.root() for module-level reactivity
	if (typeof window !== 'undefined') {
		effectRoot = $effect.root(() => {
			$effect(() => {
				const currentMode = mode.value;
				logger.debug(`UIStore: Detected mode change to '${currentMode}', updating layout.`);
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
	// Register callback with collectionStore to avoid circular dependency
	import('./collectionStore.svelte').then(({ setUILayoutUpdateCallback }) => {
		setUILayoutUpdateCallback(() => uiStateManager.updateLayout());
	});
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
