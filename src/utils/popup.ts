/**
 * @file src/utils/popup.ts
 * @description Popup/tooltip utility for Skeleton v4 migration
 *
 * This replaces the old Skeleton v2 `use:popup` action with a simpler
 * native implementation using CSS and data attributes.
 *
 * For complex popups, consider migrating to the Popover component from
 * @skeletonlabs/skeleton-svelte instead.
 *
 * Usage:
 * ```svelte
 * <script>
 *   import { popup } from '@utils/popup';
 * </script>
 *
 * <button use:popup={{ target: 'my-popup', event: 'hover' }}>Hover me</button>
 * <div data-popup="my-popup" class="card p-4">Popup content</div>
 * ```
 */

export interface PopupSettings {
	/** Target popup element ID (matches data-popup attribute) */
	target: string;
	/** Event type: 'hover', 'click', or 'focus' */
	event?: 'hover' | 'click' | 'focus' | 'focus-blur' | 'focus-click';
	/** Placement relative to trigger */
	placement?: 'top' | 'bottom' | 'left' | 'right';
	/** Close on outside click (for click events) */
	closeQuery?: string;
	/** State for programmatic control */
	state?: { close: () => void };
}

/**
 * Simple popup action that toggles visibility of a target element
 * This is a simplified replacement for Skeleton v2's popup action
 */
export function popup(node: HTMLElement, settings: PopupSettings) {
	const { target, event = 'hover', placement = 'bottom' } = settings;

	let popupElement: HTMLElement | null = null;
	let isOpen = false;

	function findPopup() {
		popupElement = document.querySelector(`[data-popup="${target}"]`);
		if (popupElement) {
			// Add base styles if not already styled
			if (!popupElement.style.position) {
				popupElement.style.position = 'absolute';
				popupElement.style.zIndex = '50';
			}
			popupElement.style.display = 'none';
		}
	}

	function show() {
		if (!popupElement) findPopup();
		if (!popupElement) return;

		isOpen = true;
		popupElement.style.display = 'block';
		positionPopup();
	}

	function hide() {
		if (!popupElement) return;
		isOpen = false;
		popupElement.style.display = 'none';
	}

	function toggle() {
		if (isOpen) {
			hide();
		} else {
			show();
		}
	}

	function positionPopup() {
		if (!popupElement) return;

		const triggerRect = node.getBoundingClientRect();
		const popupRect = popupElement.getBoundingClientRect();

		let top = 0;
		let left = 0;

		switch (placement) {
			case 'top':
				top = triggerRect.top - popupRect.height - 8;
				left = triggerRect.left + (triggerRect.width - popupRect.width) / 2;
				break;
			case 'bottom':
				top = triggerRect.bottom + 8;
				left = triggerRect.left + (triggerRect.width - popupRect.width) / 2;
				break;
			case 'left':
				top = triggerRect.top + (triggerRect.height - popupRect.height) / 2;
				left = triggerRect.left - popupRect.width - 8;
				break;
			case 'right':
				top = triggerRect.top + (triggerRect.height - popupRect.height) / 2;
				left = triggerRect.right + 8;
				break;
		}

		// Adjust for scroll
		top += window.scrollY;
		left += window.scrollX;

		// Keep within viewport
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		if (left < 8) left = 8;
		if (left + popupRect.width > viewportWidth - 8) {
			left = viewportWidth - popupRect.width - 8;
		}
		if (top < 8) top = 8;
		if (top + popupRect.height > viewportHeight + window.scrollY - 8) {
			top = viewportHeight + window.scrollY - popupRect.height - 8;
		}

		popupElement.style.top = `${top}px`;
		popupElement.style.left = `${left}px`;
	}

	function handleClickOutside(e: MouseEvent) {
		if (!popupElement) return;
		if (!node.contains(e.target as Node) && !popupElement.contains(e.target as Node)) {
			hide();
		}
	}

	// Set up event listeners based on event type
	if (event === 'hover') {
		node.addEventListener('mouseenter', show);
		node.addEventListener('mouseleave', hide);
	} else if (event === 'click') {
		node.addEventListener('click', toggle);
		document.addEventListener('click', handleClickOutside);
	} else if (event === 'focus' || event === 'focus-blur') {
		node.addEventListener('focus', show);
		node.addEventListener('blur', hide);
	} else if (event === 'focus-click') {
		node.addEventListener('focus', show);
		node.addEventListener('click', toggle);
		document.addEventListener('click', handleClickOutside);
	}

	// Initial popup finding
	findPopup();

	// Provide state control if requested
	if (settings.state) {
		settings.state.close = hide;
	}

	return {
		update(newSettings: PopupSettings) {
			// Re-find popup if target changed
			if (newSettings.target !== settings.target) {
				findPopup();
			}
		},
		destroy() {
			// Clean up event listeners
			node.removeEventListener('mouseenter', show);
			node.removeEventListener('mouseleave', hide);
			node.removeEventListener('click', toggle);
			node.removeEventListener('focus', show);
			node.removeEventListener('blur', hide);
			document.removeEventListener('click', handleClickOutside);
		}
	};
}

// Type is already exported via the interface declaration
