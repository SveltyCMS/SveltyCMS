<!--
@file src/routes/(app)/dashboard/+page.svelte
@component
**This file sets up and displays the dashboard page. It provides a user-friendly interface for managing system resources and system messages**

@example
<Dashboard />

### Props
- `data` {object} - Object containing user data

### Features
- Displays widgets for CPU usage, disk usage, memory usage, last 5 media, user activity, and system messages
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { modeCurrent } from '@skeletonlabs/skeleton';
	import { flip } from 'svelte/animate';

	// Stores
	import { systemPreferences } from '@stores/systemPreferences.svelte';
	import { screenSize } from '@stores/screenSizeStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import CPUWidget from './widgets/CPUWidget.svelte';
	import DiskWidget from './widgets/DiskWidget.svelte';
	import MemoryWidget from './widgets/MemoryWidget.svelte';
	import Last5MediaWidget from './widgets/Last5MediaWidget.svelte';
	import UserActivityWidget from './widgets/UserActivityWidget.svelte';
	import SystemMessagesWidget from './widgets/SystemMessagesWidget.svelte';
	import LogsWidget from './widgets/LogsWidget.svelte';
	import Last5ContentWidget from './widgets/Last5ContentWidget.svelte';

	// Types
	type WidgetSize = '1/4' | '1/2' | '3/4' | 'full';
	type DropPosition = 'before' | 'after' | 'replace' | 'insert';
	type KeyboardDirection = 'up' | 'down' | 'left' | 'right';

	interface DashboardWidgetConfig {
		id: string;
		component: string;
		label: string;
		icon: string;
		size: WidgetSize;
		gridPosition: number;
	}

	interface DropIndicator {
		index: number;
		position: DropPosition;
	}

	interface DragState {
		item: DashboardWidgetConfig | null;
		element: HTMLElement | null;
		offset: { x: number; y: number };
		isActive: boolean;
	}

	interface KeyboardState {
		mode: boolean;
		selectedIndex: number | null;
		dropTarget: number | null;
	}

	// Constants
	const GRID_COLS = 4;
	const ROW_HEIGHT = 400;
	const GAP_SIZE = 16;
	const HEADER_HEIGHT = 60;

	// Props
	interface Props {
		data: { user: { id: string } };
	}
	let { data: pageData }: Props = $props();

	// Widget registry with improved type safety
	const widgetComponentRegistry = {
		CPUWidget: {
			component: CPUWidget,
			name: 'CPU Usage',
			icon: 'mdi:cpu-64-bit'
		},
		DiskWidget: {
			component: DiskWidget,
			name: 'Disk Usage',
			icon: 'mdi:harddisk'
		},
		MemoryWidget: {
			component: MemoryWidget,
			name: 'Memory Usage',
			icon: 'mdi:memory'
		},
		Last5ContentWidget: {
			component: Last5ContentWidget,
			name: 'Last 5 Content',
			icon: 'mdi:image-multiple'
		},
		Last5MediaWidget: {
			component: Last5MediaWidget,
			name: 'Last 5 Media',
			icon: 'mdi:image-multiple'
		},
		UserActivityWidget: {
			component: UserActivityWidget,
			name: 'User Activity',
			icon: 'mdi:account-group'
		},
		SystemMessagesWidget: {
			component: SystemMessagesWidget,
			name: 'System Messages',
			icon: 'mdi:message-alert'
		},
		LogsWidget: {
			component: LogsWidget,
			name: 'System Logs',
			icon: 'mdi:file-document-outline'
		}
	} as const;

	// State management with improved reactivity
	let items = $state<DashboardWidgetConfig[]>([]);
	let dropdownOpen = $state(false);
	let preferencesLoaded = $state(false);
	let previewSizes = $state<Record<string, WidgetSize>>({});

	// Drag and drop state
	let dragState = $state<DragState>({
		item: null,
		element: null,
		offset: { x: 0, y: 0 },
		isActive: false
	});

	let dropIndicator = $state<DropIndicator | null>(null);

	// Keyboard state
	let keyboardState = $state<KeyboardState>({
		mode: false,
		selectedIndex: null,
		dropTarget: null
	});

	// Grid update counter for reactive updates
	let gridUpdateCounter = $state(0);

	// Derived values using Svelte's reactive system
	let currentTheme = $derived($modeCurrent ? 'light' : 'dark');
	let availableWidgets = $derived(Object.keys(widgetComponentRegistry).filter((name) => !items.some((item) => item.component === name)));
	let canAddMoreWidgets = $derived(availableWidgets.length > 0);
	let filteredWidgets = $derived(
		availableWidgets.filter((name) =>
			name.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	// Track the current screen size
	let currentScreenSize = $screenSize;

	// UI state for error and layout switching hint
	let loadError = $state<string | null>(null);

	// Search state
	let searchQuery = $state('');
	let searchInput: HTMLInputElement | null = null;

	function handleDropdownOpen() {
		dropdownOpen = !dropdownOpen;
		if (dropdownOpen) {
			setTimeout(() => {
				if (searchInput) searchInput.focus();
			}, 10);
		} else {
			searchQuery = '';
		}
	}

	// Helper: Validate widgets
	function validateWidgets(widgets: any[]): DashboardWidgetConfig[] {
		return (widgets || []).filter((w) => w && w.id && w.component && w.size && typeof w.gridPosition === 'number');
	}

	// Event handling functions with improved error handling
	function getClientCoordinates(event: MouseEvent | TouchEvent): { x: number; y: number } {
		if ('touches' in event) {
			return {
				x: event.touches[0].clientX,
				y: event.touches[0].clientY
			};
		}
		return {
			x: event.clientX,
			y: event.clientY
		};
	}

	function isInteractiveElement(target: HTMLElement): boolean {
		return !!(target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a'));
	}

	function isInHeaderArea(event: MouseEvent | TouchEvent, element: HTMLElement): boolean {
		const coords = getClientCoordinates(event);
		const rect = element.getBoundingClientRect();
		const relativeY = coords.y - rect.top;
		return relativeY <= HEADER_HEIGHT;
	}

	// Drag and drop functions with improved state management
	function handleDragStart(event: MouseEvent | TouchEvent, item: DashboardWidgetConfig, element: HTMLElement) {
		if (isInteractiveElement(event.target as HTMLElement) || !isInHeaderArea(event, element)) {
			return;
		}

		event.preventDefault();
		const coords = getClientCoordinates(event);
		const rect = element.getBoundingClientRect();

		// Update drag state
		dragState = {
			item,
			element,
			offset: {
				x: coords.x - rect.left,
				y: coords.y - rect.top
			},
			isActive: true
		};

		// Apply drag styles using Svelte's style binding
		applyDragStyles(element, rect);

		// Add global event listeners
		addGlobalDragListeners();
	}

	function applyDragStyles(element: HTMLElement, rect: DOMRect) {
		element.style.cssText = `
			opacity: 0.8;
			transform: scale(1.02);
			z-index: 1000;
			position: fixed;
			pointer-events: none;
			width: ${rect.width}px;
			height: ${rect.height}px;
			box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
			transition: none;
		`;
	}

	function removeDragStyles(element: HTMLElement) {
		element.style.cssText = '';
	}

	function addGlobalDragListeners() {
		document.addEventListener('mousemove', handleDragMove);
		document.addEventListener('mouseup', handleDragEnd);
		document.addEventListener('touchmove', handleDragMove, { passive: false });
		document.addEventListener('touchend', handleDragEnd);
	}

	function removeGlobalDragListeners() {
		document.removeEventListener('mousemove', handleDragMove);
		document.removeEventListener('mouseup', handleDragEnd);
		document.removeEventListener('touchmove', handleDragMove);
		document.removeEventListener('touchend', handleDragEnd);
	}

	function handleDragMove(event: MouseEvent | TouchEvent) {
		if (!dragState.isActive || !dragState.element) return;

		event.preventDefault();
		const coords = getClientCoordinates(event);

		// Update dragged element position
		dragState.element.style.left = `${coords.x - dragState.offset.x}px`;
		dragState.element.style.top = `${coords.y - dragState.offset.y}px`;

		// Update drop indicator
		updateDropIndicator(coords);
	}

	function updateDropIndicator(coords: { x: number; y: number }) {
		// Find widget container under cursor
		const widgetContainer = findWidgetContainerAtCoords(coords);

		if (widgetContainer) {
			const targetIndex = parseInt(widgetContainer.getAttribute('data-grid-index') || '-1');
			if (targetIndex !== -1 && dragState.item && targetIndex !== items.findIndex((item) => item.id === dragState.item!.id)) {
				dropIndicator = { index: targetIndex, position: 'replace' };
				return;
			}
		}

		// Check for empty space
		const emptySpaceIndex = findEmptySpaceAtCoords(coords);
		if (emptySpaceIndex !== -1) {
			dropIndicator = { index: emptySpaceIndex, position: 'insert' };
			return;
		}

		dropIndicator = null;
	}

	function findWidgetContainerAtCoords(coords: { x: number; y: number }): HTMLElement | null {
		const containers = document.querySelectorAll('.widget-container');

		for (const container of containers) {
			const rect = container.getBoundingClientRect();
			if (coords.x >= rect.left && coords.x <= rect.right && coords.y >= rect.top && coords.y <= rect.bottom) {
				return container as HTMLElement;
			}
		}

		return null;
	}

	function findEmptySpaceAtCoords(coords: { x: number; y: number }): number {
		const gridContainer = document.querySelector('.responsive-dashboard-grid');
		if (!gridContainer || !dragState.item) return -1;

		const gridRect = gridContainer.getBoundingClientRect();
		const relativeX = coords.x - gridRect.left;
		const relativeY = coords.y - gridRect.top;

		const cellWidth = gridRect.width / 4;
		const cellHeight = ROW_HEIGHT + GAP_SIZE;

		const col = Math.floor(relativeX / cellWidth);
		const row = Math.floor(relativeY / cellHeight);
		const gridPosition = row * 4 + col;

		const isValidPosition = col >= 0 && col < 4 && row >= 0 && gridPosition >= 0 && gridPosition < 16;
		return isValidPosition ? gridPosition : -1;
	}

	function handleDragEnd() {
		if (!dragState.isActive || !dragState.item) return;

		// Reset dragged element styles
		if (dragState.element) {
			removeDragStyles(dragState.element);
		}

		// Handle drop
		if (dropIndicator && dragState.item) {
			performDrop(dragState.item, dropIndicator);
		}

		// Reset state
		dragState = {
			item: null,
			element: null,
			offset: { x: 0, y: 0 },
			isActive: false
		};
		dropIndicator = null;

		// Remove global event listeners
		removeGlobalDragListeners();
	}

	function performDrop(draggedItem: DashboardWidgetConfig, indicator: DropIndicator) {
		const draggedIndex = items.findIndex((item) => item.id === draggedItem.id);
		if (draggedIndex === -1) return;

		const newItems = [...items];
		const [draggedWidget] = newItems.splice(draggedIndex, 1);

		if (indicator.position === 'replace') {
			const targetIndex = indicator.index;

			if (targetIndex !== draggedIndex) {
				const [targetWidget] = newItems.splice(targetIndex > draggedIndex ? targetIndex - 1 : targetIndex, 1);
				const insertIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex;
				newItems.splice(insertIndex, 0, draggedWidget);
				newItems.splice(draggedIndex, 0, targetWidget);
			} else {
				newItems.splice(draggedIndex, 0, draggedWidget);
			}
		} else if (indicator.position === 'insert') {
			let newIndex = indicator.index;
			if (newIndex > draggedIndex) {
				newIndex--;
			}
			newItems.splice(newIndex, 0, draggedWidget);
		}

		items = newItems;
		items = recalculateGridPositions();
		gridUpdateCounter++;
		saveLayout();
	}

	// Widget management functions
	function resizeWidget(widgetId: string, newSize: WidgetSize) {
		const itemIndex = items.findIndex((item) => item.id === widgetId);
		if (itemIndex === -1) return;

		const updatedWidget: DashboardWidgetConfig = {
			...items[itemIndex],
			size: newSize
		};

		const newItems = [...items];
		newItems[itemIndex] = updatedWidget;
		items = newItems;
		items = recalculateGridPositions();
		gridUpdateCounter++;
		saveLayout();

		// Clear preview size when resize is complete
		previewSizes = { ...previewSizes };
		delete previewSizes[widgetId];
	}

	function handlePreviewSizeChange(widgetId: string, previewSize: WidgetSize) {
		const resizingIndex = items.findIndex((item) => item.id === widgetId);

		if (resizingIndex === -1) return;

		// Check if this is clearing the preview (previewSize matches current size)
		const currentItem = items[resizingIndex];
		if (previewSize === currentItem.size) {
			// Clear preview and restore original positions
			previewSizes = { ...previewSizes };
			delete previewSizes[widgetId];
			items = recalculateGridPositions();
		} else {
			// Update preview size
			previewSizes = { ...previewSizes, [widgetId]: previewSize };

			// Recalculate grid positions with the preview size
			const newItems = [...items];
			const originalSize = newItems[resizingIndex].size;
			newItems[resizingIndex] = { ...newItems[resizingIndex], size: previewSize };

			// Recalculate grid positions
			const recalculatedItems = recalculateGridPositionsWithItems(newItems);

			// Update items with new positions but keep original sizes
			items = recalculatedItems.map((item, index) => {
				if (item.id === widgetId) {
					return { ...item, size: originalSize }; // Keep original size for the actual widget
				}
				return item;
			});
		}

		gridUpdateCounter++;
	}

	function removeWidget(id: string) {
		items = items.filter((item) => item.id !== id);
		items = items.map((item, index) => ({ ...item, gridPosition: index }));
		items = recalculateGridPositions();
		saveLayout();
	}

	function resetGrid() {
		items = [];
		systemPreferences.clearPreferences(pageData.user.id);
		saveLayout();
	}

	function addNewWidget(componentName: string) {
		const componentInfo = widgetComponentRegistry[componentName as keyof typeof widgetComponentRegistry];
		if (!componentInfo) return;

		const newItem: DashboardWidgetConfig = {
			id: crypto.randomUUID(),
			component: componentName,
			label: componentInfo.name,
			icon: componentInfo.icon,
			size: componentName === 'LogsWidget' ? '1/2' : '1/4',
			gridPosition: items.length
		};

		items = [...items, newItem];
		items = recalculateGridPositions();
		saveLayout();
		dropdownOpen = false;
	}

	// Keyboard navigation functions
	function handleKeyDown(event: KeyboardEvent) {
		const navigationKeys = ['Tab', 'Enter', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
		const actionKeys = ['Escape', 'Delete', 'Backspace'];

		if (!keyboardState.mode && ![...navigationKeys, ...actionKeys].includes(event.key)) {
			return;
		}

		if ([...navigationKeys, ...actionKeys].includes(event.key)) {
			event.preventDefault();
		}

		switch (event.key) {
			case 'Tab':
				if (!keyboardState.mode) {
					keyboardState.mode = true;
					keyboardState.selectedIndex = 0;
				}
				break;

			case 'ArrowUp':
				handleArrowNavigation('up');
				break;

			case 'ArrowDown':
				handleArrowNavigation('down');
				break;

			case 'ArrowLeft':
				handleArrowNavigation('left');
				break;

			case 'ArrowRight':
				handleArrowNavigation('right');
				break;

			case 'Enter':
			case ' ':
				handleEnterSpace();
				break;

			case 'Escape':
				handleEscape();
				break;

			case 'Delete':
			case 'Backspace':
				handleDelete();
				break;
		}
	}

	function handleArrowNavigation(direction: KeyboardDirection) {
		if (!keyboardState.mode || keyboardState.selectedIndex === null) return;

		if (dragState.isActive) {
			moveKeyboardDropTarget(direction);
		} else {
			moveSelection(direction);
		}
	}

	function moveSelection(direction: KeyboardDirection) {
		if (keyboardState.selectedIndex === null) return;

		let newIndex = keyboardState.selectedIndex;
		const currentRow = Math.floor(keyboardState.selectedIndex / 4);
		const currentCol = keyboardState.selectedIndex % 4;

		switch (direction) {
			case 'up':
				newIndex = Math.max(0, (currentRow - 1) * 4 + currentCol);
				break;
			case 'down':
				newIndex = Math.min(items.length - 1, (currentRow + 1) * 4 + currentCol);
				break;
			case 'left':
				newIndex = Math.max(0, keyboardState.selectedIndex - 1);
				break;
			case 'right':
				newIndex = Math.min(items.length - 1, keyboardState.selectedIndex + 1);
				break;
		}

		if (newIndex < items.length) {
			keyboardState.selectedIndex = newIndex;
		}
	}

	function moveKeyboardDropTarget(direction: KeyboardDirection) {
		if (!dragState.isActive || keyboardState.dropTarget === null) return;

		let newTarget = keyboardState.dropTarget;

		switch (direction) {
			case 'up':
				newTarget = Math.max(0, keyboardState.dropTarget - 4);
				break;
			case 'down':
				newTarget = Math.min(items.length - 1, keyboardState.dropTarget + 4);
				break;
			case 'left':
				newTarget = Math.max(0, keyboardState.dropTarget - 1);
				break;
			case 'right':
				newTarget = Math.min(items.length - 1, keyboardState.dropTarget + 1);
				break;
		}

		if (newTarget !== keyboardState.dropTarget) {
			keyboardState.dropTarget = newTarget;
			dropIndicator = { index: newTarget, position: 'replace' };
		}
	}

	function handleEnterSpace() {
		if (!keyboardState.mode || keyboardState.selectedIndex === null) return;

		if (dragState.isActive) {
			confirmKeyboardDrop();
		} else {
			startKeyboardDrag(keyboardState.selectedIndex);
		}
	}

	function handleEscape() {
		if (dragState.isActive) {
			cancelKeyboardDrag();
		} else {
			exitKeyboardMode();
		}
	}

	function handleDelete() {
		if (keyboardState.mode && keyboardState.selectedIndex !== null && !dragState.isActive) {
			const widgetToRemove = items[keyboardState.selectedIndex];
			removeWidget(widgetToRemove.id);
			keyboardState.selectedIndex = Math.min(keyboardState.selectedIndex, items.length - 1);
		}
	}

	function startKeyboardDrag(widgetIndex: number) {
		if (widgetIndex < 0 || widgetIndex >= items.length) return;

		const widget = items[widgetIndex];
		dragState = {
			item: widget,
			element: null,
			offset: { x: 0, y: 0 },
			isActive: true
		};
		keyboardState.dropTarget = widgetIndex;
		dropIndicator = { index: widgetIndex, position: 'replace' };
	}

	function cancelKeyboardDrag() {
		dragState = {
			item: null,
			element: null,
			offset: { x: 0, y: 0 },
			isActive: false
		};
		keyboardState.dropTarget = null;
		dropIndicator = null;
	}

	function exitKeyboardMode() {
		keyboardState = {
			mode: false,
			selectedIndex: null,
			dropTarget: null
		};
	}

	function confirmKeyboardDrop() {
		if (!dragState.isActive || !dragState.item || keyboardState.dropTarget === null) return;

		const draggedIndex = items.findIndex((item) => item.id === dragState.item!.id);
		if (draggedIndex === -1) return;

		const newItems = [...items];
		const [draggedWidget] = newItems.splice(draggedIndex, 1);
		const targetIndex = keyboardState.dropTarget;

		if (targetIndex !== draggedIndex) {
			const [targetWidget] = newItems.splice(targetIndex > draggedIndex ? targetIndex - 1 : targetIndex, 1);
			const insertIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex;
			newItems.splice(insertIndex, 0, draggedWidget);
			newItems.splice(draggedIndex, 0, targetWidget);
		} else {
			newItems.splice(draggedIndex, 0, draggedWidget);
		}

		items = newItems;
		items = recalculateGridPositions();
		gridUpdateCounter++;
		saveLayout();

		// Reset keyboard drag state
		dragState = {
			item: null,
			element: null,
			offset: { x: 0, y: 0 },
			isActive: false
		};
		keyboardState.dropTarget = null;
		dropIndicator = null;
		keyboardState.selectedIndex = targetIndex;
	}

	// Utility functions
	function getColumnSpan(size: WidgetSize): number {
		const spanMap: Record<WidgetSize, number> = {
			'1/4': 1,
			'1/2': 2,
			'3/4': 3,
			full: 4
		};
		return spanMap[size] || 1;
	}

	function getAvailableSizes(componentName?: string): WidgetSize[] {
		if (componentName === 'LogsWidget') {
			return ['1/2', '3/4', 'full'];
		}
		return ['1/4', '1/2', '3/4', 'full'];
	}

	function recalculateGridPositions(): DashboardWidgetConfig[] {
		return recalculateGridPositionsWithItems(items);
	}

	function recalculateGridPositionsWithItems(itemsToProcess: DashboardWidgetConfig[]): DashboardWidgetConfig[] {
		const newItems = [...itemsToProcess];
		const grid = Array(20).fill(null); // 20 rows should be enough
		let maxRow = 0;

		// Place each widget in the grid
		newItems.forEach((item) => {
			const span = getColumnSpan(item.size);
			let placed = false;
			let row = 0;
			let col = 0;

			// Find the first available position
			while (!placed && row < 20) {
				col = 0;
				while (col + span <= 4 && !placed) {
					// Check if this position and the next columns are available
					let canPlace = true;
					for (let i = 0; i < span; i++) {
						if (grid[row * 4 + col + i] !== null) {
							canPlace = false;
							break;
						}
					}

					if (canPlace) {
						// Place the widget
						for (let i = 0; i < span; i++) {
							grid[row * 4 + col + i] = item.id;
						}
						item.gridPosition = row * 4 + col;
						placed = true;
						maxRow = Math.max(maxRow, row);
					} else {
						col++;
					}
				}
				if (!placed) row++;
			}

			// If we couldn't place it, put it at the end
			if (!placed) {
				item.gridPosition = (maxRow + 1) * 4;
				maxRow++;
			}
		});

		return newItems;
	}

	// Lifecycle and data management
	onMount(async () => {
		try {
			await systemPreferences.loadPreferences(pageData.user.id);

			// Get the current state from the store
			const currentState = systemPreferences.getState();

			const loadedWidgets = validateWidgets(currentState?.preferences || []);
			items = loadedWidgets.map((existingWidget, index) => {
				const componentInfo = widgetComponentRegistry[existingWidget.component as keyof typeof widgetComponentRegistry];
				let defaultSize: WidgetSize = '1/4';
				if (existingWidget.component === 'LogsWidget') defaultSize = '1/2';
				else {
					if (index === 1) defaultSize = '1/2';
					if (index === 2) defaultSize = '3/4';
					if (index === 3) defaultSize = 'full';
				}
				return {
					id: existingWidget.id || crypto.randomUUID(),
					component: existingWidget.component,
					label: existingWidget.label || componentInfo?.name || 'Unknown Widget',
					icon: existingWidget.icon || componentInfo?.icon || 'mdi:help-circle',
					size: existingWidget.size || defaultSize,
					gridPosition: index
				};
			});
			items = recalculateGridPositions();
			loadError = null;
		} catch (error) {
				items = [];
			loadError = 'Failed to load dashboard preferences. Please try again.';
		}
		preferencesLoaded = true;
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('click', handleClickOutside);
			removeGlobalDragListeners();
		};
	});

	// Handle clicking outside dropdown to close it
	function handleClickOutside(event: MouseEvent) {
		if (dropdownOpen) {
			const dropdown = document.querySelector('.widget-dropdown');
			const headerButton = document.querySelector('.widget-dropdown-button');
			const emptyStateButton = document.querySelector('.empty-state-add-button');

			if (
				dropdown &&
				!dropdown.contains(event.target as Node) &&
				(!headerButton || !headerButton.contains(event.target as Node)) &&
				(!emptyStateButton || !emptyStateButton.contains(event.target as Node))
			) {
				dropdownOpen = false;
				searchQuery = '';
			}
		}
	}

	async function saveLayout() {
		try {
			// Convert DashboardWidgetConfig to WidgetPreference format
			const widgetPreferences = items.map((item) => ({
				id: item.id,
				component: item.component,
				label: item.label,
				icon: item.icon,
				size: item.size,
				gridPosition: item.gridPosition,
				x: 0,
				y: 0,
				w: getColumnSpan(item.size),
				h: 1,
				movable: true,
				resizable: true
			}));
			await systemPreferences.setPreference(pageData.user.id, widgetPreferences);
		} catch (error) {
			console.error('Failed to save layout:', error);
		}
	}
</script>

<main
	class="dashboard-container m-0 flex w-full flex-col bg-surface-100 p-0 text-neutral-900 dark:bg-surface-900 dark:text-neutral-100"
	style="overflow-x: hidden; touch-action: pan-y;"
>
	<header class="my-2 flex items-center justify-between gap-2 border-b border-surface-200 px-4 py-2 dark:border-surface-700">
		<h1 class="sr-only">Dashboard</h1>
		<PageTitle name="Dashboard" icon="bi:bar-chart-line" />
		<div class="flex items-center gap-2">
			{#if keyboardState.mode}
				<div
					class="flex items-center gap-2 rounded-lg bg-primary-100 px-3 py-1 text-sm text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
				>
					<iconify-icon icon="mdi:keyboard" width="16"></iconify-icon>
					<span>Keyboard Mode: Arrow keys to navigate, Enter/Space to drag, Escape to exit</span>
				</div>
			{/if}
			{#if canAddMoreWidgets}
				<div class="relative">
					<button
						onclick={handleDropdownOpen}
						type="button"
						aria-haspopup="true"
						aria-expanded={dropdownOpen}
						class="widget-dropdown-button btn rounded-full bg-primary-500 px-5 py-2 shadow-lg text-white font-semibold flex items-center gap-2 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-primary-600 dark:hover:bg-primary-500"
						title="Add Widget"
					>
						<iconify-icon icon="carbon:add-filled" width="20"></iconify-icon>
						{#if $screenSize !== 'SM' && $screenSize !== 'XS'}
							<span>Add Widget</span>
						{/if}
					</button>
					{#if dropdownOpen}
						<div role="menu" class="widget-dropdown absolute right-0 z-30 mt-2 w-72 rounded-xl border border-gray-200 bg-white shadow-2xl dark:bg-surface-900 dark:border-gray-700">
							<div class="border-b border-gray-200 p-4 bg-gray-50 rounded-t-xl dark:border-gray-700 dark:bg-surface-800">
								<input
									bind:this={searchInput}
									type="text"
									class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:outline-none dark:border-gray-700 dark:bg-surface-800 dark:text-surface-100"
									placeholder="Search widgets..."
									bind:value={searchQuery}
									aria-label="Search widgets"
								/>
							</div>
							<div class="max-h-64 overflow-y-auto py-1 bg-white dark:bg-surface-900 rounded-b-xl">
								{#if filteredWidgets.length > 0}
									{#each filteredWidgets as widgetName}
										<button
											class="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors rounded-md"
											onclick={() => addNewWidget(widgetName)}
											type="button"
										>
											<iconify-icon icon={widgetComponentRegistry[widgetName]?.icon} width="20" class="text-primary-500 dark:text-primary-400" />
											<span class="ml-2">{widgetComponentRegistry[widgetName]?.name}</span>
										</button>
									{/each}
								{:else}
									<div class="px-4 py-2 text-sm text-gray-500">No widgets found.</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/if}
			<button class="variant-outline-warning btn" onclick={resetGrid}>Reset Layout</button>
			<button
				onclick={() => (keyboardState.mode = !keyboardState.mode)}
				class="variant-outline-primary btn gap-2 {keyboardState.mode
					? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
					: ''}"
				title="Toggle keyboard navigation mode"
			>
				<iconify-icon icon="mdi:keyboard" width="16"></iconify-icon>
				Keyboard
			</button>
			<button onclick={() => history.back()} aria-label="Back" class="variant-ghost-surface btn-icon">
				<iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon>
			</button>
		</div>
		{#if loadError}
			<div class="flex w-full items-center gap-2 rounded bg-error-100 p-2 text-error-700 dark:bg-error-900 dark:text-error-200">
				<iconify-icon icon="mdi:alert-circle" width="20"></iconify-icon>
				<span>{loadError}</span>
				<button class="btn-xs variant-outline-error btn ml-auto" onclick={() => location.reload()}>Retry</button>
			</div>
		{/if}
	</header>

	<div class="relative m-0 w-full p-0">
		<!-- Global drag overlay -->
		{#if dragState.isActive}
			<div class="pointer-events-none fixed inset-0 z-50 cursor-grabbing bg-black/5" style="touch-action: none;"></div>
		{/if}

		<!-- Keyboard instructions overlay -->
		{#if keyboardState.mode && !dragState.isActive}
			<div
				class="fixed bottom-4 left-4 z-40 rounded-lg bg-surface-800/90 p-4 text-sm text-surface-100 shadow-lg backdrop-blur-sm dark:bg-surface-900/90"
			>
				<div class="mb-2 font-semibold">Keyboard Controls:</div>
				<div class="space-y-1 text-xs">
					<div>• <kbd class="rounded bg-surface-700 px-1">Tab</kbd> - Enter/Exit keyboard mode</div>
					<div>• <kbd class="rounded bg-surface-700 px-1">↑↓←→</kbd> - Navigate widgets</div>
					<div>• <kbd class="rounded bg-surface-700 px-1">Enter</kbd> or <kbd class="rounded bg-surface-700 px-1">Space</kbd> - Start drag</div>
					<div>• <kbd class="rounded bg-surface-700 px-1">Escape</kbd> - Cancel/Exit</div>
					<div>• <kbd class="rounded bg-surface-700 px-1">Delete</kbd> - Remove widget</div>
				</div>
			</div>
		{/if}

		<!-- Keyboard drag instructions -->
		{#if keyboardState.mode && dragState.isActive}
			<div
				class="fixed bottom-4 left-4 z-40 rounded-lg bg-success-800/90 p-4 text-sm text-success-100 shadow-lg backdrop-blur-sm dark:bg-success-900/90"
			>
				<div class="mb-2 font-semibold">Dragging Widget:</div>
				<div class="space-y-1 text-xs">
					<div>• <kbd class="rounded bg-success-700 px-1">↑↓←→</kbd> - Move drop target</div>
					<div>• <kbd class="rounded bg-success-700 px-1">Enter</kbd> - Confirm drop</div>
					<div>• <kbd class="rounded bg-success-700 px-1">Escape</kbd> - Cancel drag</div>
				</div>
			</div>
		{/if}

		<section class="w-full px-1 py-4">
			{#if !preferencesLoaded}
				<div class="flex h-full items-center justify-center text-lg text-gray-500" role="status" aria-live="polite">Loading preferences...</div>
			{:else if items.length > 0}
				<div
					class="responsive-dashboard-grid relative grid w-full gap-4"
					role="grid"
					aria-label="Dashboard widgets grid"
					data-grid-update={gridUpdateCounter}
				>
					{#each items as item, index (item.id)}
						{@const SvelteComponent = widgetComponentRegistry[item.component as keyof typeof widgetComponentRegistry]?.component}
						{@const effectiveSize = previewSizes[item.id] || item.size}
						{@const columnSpan = getColumnSpan(effectiveSize)}

						<article
							class="widget-container grid-span-{columnSpan} group relative select-none overflow-hidden rounded-lg transition-all duration-200 ease-in-out {keyboardState.mode &&
							keyboardState.selectedIndex === index
								? 'ring-1 ring-primary-500'
								: ''} {dragState.isActive && keyboardState.dropTarget === index ? 'ring-1 ring-success-500' : ''}"
							data-widget-id={item.id}
							data-widget-size={item.size}
							data-column-span={columnSpan}
							data-grid-index={index}
							data-grid-update={gridUpdateCounter}
							aria-label={item.label}
							style="touch-action: none;"
							animate:flip={{ duration: 200 }}
						>
							{#if SvelteComponent}
								<!-- Drop indicator overlay -->
								{#if dropIndicator && dropIndicator.index === index}
									<div
										class="pointer-events-none absolute inset-0 z-20 animate-pulse rounded-lg border-4 border-dashed border-primary-500 bg-primary-50/60 shadow-lg transition-all duration-200 dark:border-primary-400 dark:bg-primary-900/30"
									>
										<div class="flex h-full items-center justify-center">
											<iconify-icon icon="mdi:swap-horizontal" width="24" class="animate-bounce text-primary-500 dark:text-primary-400"
											></iconify-icon>
										</div>
									</div>
								{/if}

								<SvelteComponent
									label={item.label}
									icon={item.icon}
									theme={currentTheme}
									widgetId={item.id}
									currentSize={item.size}
									availableSizes={getAvailableSizes(item.component)}
									onSizeChange={(newSize) => resizeWidget(item.id, newSize)}
									onPreviewSizeChange={(previewSize) => handlePreviewSizeChange(item.id, previewSize)}
									{ROW_HEIGHT}
									{GAP_SIZE}
									onCloseRequest={() => removeWidget(item.id)}
									draggable={true}
									onDragStart={(event, _dragItem, element) => handleDragStart(event, item, element)}
								/>
							{:else}
								<div
									class="flex h-full w-full items-center justify-center rounded-md border border-dashed border-error-500 bg-error-100 p-4 text-error-700"
								>
									Widget "{item.component}" not found.
								</div>
							{/if}
						</article>
					{/each}

					<!-- Empty space drop indicator -->
					{#if dropIndicator && dropIndicator.position === 'insert'}
						<div
							class="pointer-events-none absolute z-20 animate-pulse rounded-lg border-4 border-dashed border-success-500 bg-success-50/60 shadow-lg transition-all duration-200 dark:border-success-400 dark:bg-success-900/30"
							style="
								left: {(dropIndicator.index % 4) * (100 / 4)}%;
								top: {Math.floor(dropIndicator.index / 4) * (ROW_HEIGHT + GAP_SIZE)}px;
								width: {100 / 4}%;
								height: {ROW_HEIGHT}px;
								transform: translateX({GAP_SIZE / 2}px) translateY({GAP_SIZE / 2}px);
							"
						>
							<div class="flex h-full items-center justify-center">
								<iconify-icon icon="mdi:plus-circle" width="32" class="animate-bounce text-success-500 dark:text-success-400"></iconify-icon>
							</div>
						</div>
					{/if}
				</div>
			{:else if preferencesLoaded && items.length === 0}
				<div class="mx-auto flex h-[60vh] w-full flex-col items-center justify-center text-center" role="status" aria-live="polite">
					<div class="flex flex-col items-center px-10 py-12">
						<iconify-icon
							icon="mdi:view-dashboard-outline"
							width="80"
							class="mb-6 text-primary-400 drop-shadow-lg dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<p class="mb-2 text-2xl font-bold text-primary-700 dark:text-primary-200">Your Dashboard is Empty</p>
						<p class="mb-6 text-base text-surface-600 dark:text-surface-300">
							Click below to add your first widget and start personalizing your dashboard experience.
						</p>
						<button
							class="btn rounded-full bg-primary-500 px-6 py-3 text-lg font-semibold text-white shadow-lg transition-all duration-150 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-primary-600 dark:hover:bg-primary-500"
							onclick={() => (dropdownOpen = true)}
							aria-label="Add widget"
						>
							<iconify-icon icon="mdi:plus" width="22" class="mr-2" aria-hidden="true"></iconify-icon>
							Add Widget
						</button>
					</div>
				</div>
			{/if}
		</section>
	</div>
</main>

<style>
	/* Grid span classes for reliable reactivity */
	.grid-span-1 {
		grid-column: span 1;
	}

	.grid-span-2 {
		grid-column: span 2;
	}

	.grid-span-3 {
		grid-column: span 3;
	}

	.grid-span-4 {
		grid-column: span 4;
	}

	/* Responsive dashboard grid */
	.responsive-dashboard-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(1, minmax(0, 1fr));
	}
	@media (min-width: 640px) {
		.responsive-dashboard-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 1024px) {
		.responsive-dashboard-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
