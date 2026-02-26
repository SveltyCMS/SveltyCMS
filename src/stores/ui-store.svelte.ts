/**
 * @file src/stores/ui-store.svelte.ts
 * @description UI visibility management using Svelte 5 runes
 *
 * Features:
 * - Class-based singleton with $state properties
 * - Single $effect.root for controlled updates
 * - Manual override timer for sidebar toggles
 *
 * Usage:
 * - ui.state - Current UIState object
 * - ui.toggle(element, visibility) - Toggle UI element
 * - ui.forceUpdate() - Force layout recalculation
 * - ui.setRouteContext(ctx) - Set special route context
 */

import { untrack } from 'svelte';
import { mode } from './collection-store.svelte';
import { ScreenSize, screen } from './screen-size-store.svelte';

// Types for UI visibility states
export type UIVisibility = 'hidden' | 'collapsed' | 'full';

// Interface for UI state
export interface UIState {
	chatPanel: UIVisibility;
	footer: UIVisibility;
	header: UIVisibility;
	leftSidebar: UIVisibility;
	pagefooter: UIVisibility;
	pageheader: UIVisibility;
	rightSidebar: UIVisibility;
}

/**
 * UIStore - Manages UI element visibility based on screen size and mode
 */
class UIStore {
	// Core reactive state
	state = $state<UIState>({
		leftSidebar: 'full',
		rightSidebar: 'hidden',
		pageheader: 'full',
		pagefooter: 'hidden',
		header: 'hidden',
		footer: 'hidden',
		chatPanel: 'hidden'
	});

	// Route context for special layouts
	routeContext = $state({
		isImageEditor: false,
		isCollectionBuilder: false
	});

	// UI toggles
	manualOverrideActive = $state(false);
	headerShowMore = $state(false);
	isSearchVisible = $state(false);
	userPreferred = $state<UIVisibility>('collapsed');

	// Internal state
	private manualTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly effectCleanup?: () => void;

	// Computed visibility getters
	get isLeftSidebarVisible(): boolean {
		return this.state.leftSidebar !== 'hidden';
	}

	get isRightSidebarVisible(): boolean {
		return this.state.rightSidebar !== 'hidden';
	}

	get isPageHeaderVisible(): boolean {
		return this.state.pageheader !== 'hidden';
	}

	get isPageFooterVisible(): boolean {
		return this.state.pagefooter !== 'hidden';
	}

	get isHeaderVisible(): boolean {
		return this.state.header !== 'hidden';
	}

	get isFooterVisible(): boolean {
		return this.state.footer !== 'hidden';
	}

	get isChatPanelVisible(): boolean {
		return this.state.chatPanel !== 'hidden';
	}

	constructor() {
		if (typeof window === 'undefined') {
			return;
		}

		// Single effect root watches size + mode changes
		this.effectCleanup = $effect.root(() => {
			$effect(() => {
				const size = screen.size;
				const currentMode = mode.value;
				// Track route context changes to trigger updates
				const CTX = this.routeContext.isImageEditor || this.routeContext.isCollectionBuilder;
				void CTX;

				untrack(() => {
					if (!this.manualOverrideActive) {
						this.updateFromContext(size, currentMode);
					}
				});
			});
		});
	}

	/**
	 * Updates UI state based on screen size and current mode
	 */
	private updateFromContext(size: ScreenSize, currentMode: string): void {
		const isViewMode = currentMode === 'view' || currentMode === 'media';

		// Special routes
		if (this.routeContext.isImageEditor) {
			this.state = {
				...this.state,
				leftSidebar: 'collapsed',
				rightSidebar: 'hidden',
				pageheader: 'full',
				pagefooter: 'full',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}

		if (this.routeContext.isCollectionBuilder) {
			// Collection builder should respect screen size for sidebar
			let sidebarState: UIVisibility = 'full';
			if (size === ScreenSize.XS || size === ScreenSize.SM) {
				sidebarState = 'hidden';
			} else if (size === ScreenSize.MD) {
				sidebarState = 'collapsed';
			}

			this.state = {
				...this.state,
				leftSidebar: sidebarState,
				rightSidebar: 'hidden',
				pageheader: 'hidden', // No HeaderEdit in collection builder
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}

		const showPageHeader = ['edit', 'create', 'modify', 'media'].includes(currentMode);

		// Mobile
		if (size === ScreenSize.XS || size === ScreenSize.SM) {
			this.state = {
				...this.state,
				leftSidebar: 'hidden',
				rightSidebar: 'hidden',
				pageheader: showPageHeader ? 'full' : 'hidden',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}

		// Tablet
		if (size === ScreenSize.MD) {
			this.state = {
				...this.state,
				leftSidebar: isViewMode ? 'collapsed' : 'hidden',
				rightSidebar: 'hidden',
				pageheader: showPageHeader ? 'full' : 'hidden',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}

		// Desktop
		this.state = {
			...this.state,
			leftSidebar: isViewMode ? 'full' : 'collapsed',
			rightSidebar: isViewMode ? 'hidden' : 'full',
			pageheader: showPageHeader ? 'full' : 'hidden',
			pagefooter: 'hidden',
			header: 'hidden',
			footer: 'hidden'
		};
	}

	/**
	 * Toggle a UI element's visibility
	 */
	toggle(element: keyof UIState, visibility: UIVisibility): void {
		this.state[element] = visibility;

		// Prevent auto-updates for 600ms after manual toggle
		if (element === 'leftSidebar' || element === 'rightSidebar') {
			this.manualOverrideActive = true;

			if (this.manualTimer) {
				clearTimeout(this.manualTimer);
			}
			this.manualTimer = setTimeout(() => {
				this.manualOverrideActive = false;
				this.manualTimer = null;
			}, 600);
		}
	}

	/**
	 * Set route context for special layouts
	 */
	setRouteContext(ctx: { isImageEditor?: boolean; isCollectionBuilder?: boolean }): void {
		for (const key in ctx) {
			if (!Object.hasOwn(ctx, key)) {
				continue;
			}
			const k = key as keyof typeof ctx;
			if (this.routeContext[k] !== ctx[k]) {
				this.routeContext[k] = ctx[k] ?? false; // Fallback to false if undefined
			}
		}
	}

	/**
	 * Force a layout update
	 */
	forceUpdate(): void {
		this.updateFromContext(screen.size, mode.value);
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		if (this.manualTimer) {
			clearTimeout(this.manualTimer);
			this.manualTimer = null;
		}
		this.effectCleanup?.();
	}
}

// Singleton instance - the main export
export const ui = new UIStore();

// Backward compatibility exports for theme branch components
export function toggleUIElement(element: keyof UIState, visibility: UIVisibility): void {
	ui.toggle(element, visibility);
}

// Compatibility export for uiStateManager - wraps ui instance
export const uiStateManager = {
	get state() {
		return ui.state;
	},
	get uiState() {
		return { value: ui.state };
	},
	toggle: ui.toggle.bind(ui),
	show: (element: keyof UIState) => ui.toggle(element, 'full'),
	hide: (element: keyof UIState) => ui.toggle(element, 'hidden')
};

// Compatibility export for userPreferredState - wraps ui.state
export const userPreferredState = {
	get leftSidebar() {
		return ui.state.leftSidebar;
	},
	get rightSidebar() {
		return ui.state.rightSidebar;
	},
	get pageheader() {
		return ui.state.pageheader;
	},
	set(state: UIVisibility) {
		// No-op or map to something?
		// Theme branch likely set a preference.
		ui.userPreferred = state;
	}
};

export const setRouteContext = ui.setRouteContext.bind(ui);
