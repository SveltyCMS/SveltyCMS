import 'clsx';
import { m as mode } from './collectionStore.svelte.js';
import { S as ScreenSize, s as screen } from './screenSizeStore.svelte.js';
class UIStore {
	// Core reactive state
	state = {
		leftSidebar: 'full',
		rightSidebar: 'hidden',
		pageheader: 'full',
		pagefooter: 'hidden',
		header: 'hidden',
		footer: 'hidden'
	};
	// Route context for special layouts
	routeContext = { isImageEditor: false, isCollectionBuilder: false };
	// UI toggles
	manualOverrideActive = false;
	headerShowMore = false;
	isSearchVisible = false;
	userPreferred = 'collapsed';
	// Internal state
	manualTimer = null;
	effectCleanup;
	// Computed visibility getters
	get isLeftSidebarVisible() {
		return this.state.leftSidebar !== 'hidden';
	}
	get isRightSidebarVisible() {
		return this.state.rightSidebar !== 'hidden';
	}
	get isPageHeaderVisible() {
		return this.state.pageheader !== 'hidden';
	}
	get isPageFooterVisible() {
		return this.state.pagefooter !== 'hidden';
	}
	get isHeaderVisible() {
		return this.state.header !== 'hidden';
	}
	get isFooterVisible() {
		return this.state.footer !== 'hidden';
	}
	constructor() {
		if (typeof window === 'undefined') return;
		this.effectCleanup = () => {};
	}
	updateFromContext(size, currentMode) {
		const isViewMode = currentMode === 'view' || currentMode === 'media';
		if (this.routeContext.isImageEditor) {
			this.state = {
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
			let sidebarState = 'full';
			if (size === ScreenSize.XS || size === ScreenSize.SM) {
				sidebarState = 'hidden';
			} else if (size === ScreenSize.MD) {
				sidebarState = 'collapsed';
			}
			this.state = {
				leftSidebar: sidebarState,
				rightSidebar: 'hidden',
				pageheader: 'hidden',
				// No HeaderEdit in collection builder
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}
		const showPageHeader = ['edit', 'create', 'modify', 'media'].includes(currentMode);
		if (size === ScreenSize.XS || size === ScreenSize.SM) {
			this.state = {
				leftSidebar: 'hidden',
				rightSidebar: 'hidden',
				pageheader: showPageHeader ? 'full' : 'hidden',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}
		if (size === ScreenSize.MD) {
			this.state = {
				leftSidebar: isViewMode ? 'collapsed' : 'hidden',
				rightSidebar: 'hidden',
				pageheader: showPageHeader ? 'full' : 'hidden',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}
		this.state = {
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
	toggle(element, visibility) {
		this.state[element] = visibility;
		if (element === 'leftSidebar' || element === 'rightSidebar') {
			this.manualOverrideActive = true;
			if (this.manualTimer) clearTimeout(this.manualTimer);
			this.manualTimer = setTimeout(() => {
				this.manualOverrideActive = false;
				this.manualTimer = null;
			}, 600);
		}
	}
	/**
	 * Set route context for special layouts
	 */
	setRouteContext(ctx) {
		for (const key in ctx) {
			const k = key;
			if (this.routeContext[k] !== ctx[k]) {
				this.routeContext[k] = ctx[k] ?? false;
			}
		}
	}
	/**
	 * Force a layout update
	 */
	forceUpdate() {
		this.updateFromContext(screen.size, mode.value);
	}
	/**
	 * Cleanup resources
	 */
	destroy() {
		if (this.manualTimer) {
			clearTimeout(this.manualTimer);
			this.manualTimer = null;
		}
		this.effectCleanup?.();
	}
}
const ui = new UIStore();
({
	toggle: ui.toggle.bind(ui)
});
ui.setRouteContext.bind(ui);
export { ui as u };
//# sourceMappingURL=UIStore.svelte.js.map
