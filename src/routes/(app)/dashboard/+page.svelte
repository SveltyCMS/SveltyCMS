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
	import { fade } from 'svelte/transition';

	// Import the dndzone directive
	import { dndzone } from 'svelte-dnd-action';

	// Stores
	import { systemPreferences, type WidgetPreference } from '@stores/systemPreferences.svelte';
	import { screenSize } from '@stores/screenSizeStore.svelte';
	import { theme } from '@stores/themeStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import CPUWidget from './widgets/CPUWidget.svelte';
	import DiskWidget from './widgets/DiskWidget.svelte';
	import MemoryWidget from './widgets/MemoryWidget.svelte';
	import Last5MediaWidget from './widgets/Last5MediaWidget.svelte';
	import UserActivityWidget from './widgets/UserActivityWidget.svelte';
	import SystemMessagesWidget from './widgets/SystemMessagesWidget.svelte';

	interface Props {
		data: { user: { id: string } };
	}

	let { data }: Props = $props();

	// Define the structure for our widget items in the state
	type DashboardWidgetConfig = WidgetPreference & {
		component: string; // String identifier for the widget component
		label: string; // Display label for the widget
		defaultW: number; // Default width when added
		defaultH: number; // Default height when added
		validSizes: { w: number; h: number }[]; // Array of valid sizes for cycling/selection
	};

	// State variable to hold the list of dashboard items
	let items: DashboardWidgetConfig[] = $state([]);
	// State for controlling the add widget dropdown visibility
	let dropdownOpen = $state(false);
	// Bind to the grid container element
	let gridElement: HTMLElement | undefined = $state();

	// Derived state for number of grid columns based on screen size store
	let cols = $derived($screenSize === 'sm' ? 2 : $screenSize === 'md' ? 3 : 4);

	// Mapping from string identifier to component info, including sizing and icon
	const widgetComponents: Record<
		string,
		{ component: any; name: string; icon: string; defaultW: number; defaultH: number; validSizes: { w: number; h: number }[] }
	> = {
		CPUWidget: {
			component: CPUWidget,
			name: 'CPU Usage',
			icon: 'mdi:cpu-64-bit',
			defaultW: 2,
			defaultH: 2,
			validSizes: [
				{ w: 1, h: 1 },
				{ w: 2, h: 2 }
			]
		},
		DiskWidget: {
			component: DiskWidget,
			name: 'Disk Usage',
			icon: 'mdi:harddisk',
			defaultW: 1,
			defaultH: 1,
			validSizes: [
				{ w: 1, h: 1 },
				{ w: 2, h: 2 }
			]
		},
		MemoryWidget: {
			component: MemoryWidget,
			name: 'Memory Usage',
			icon: 'mdi:memory',
			defaultW: 1,
			defaultH: 1,
			validSizes: [
				{ w: 1, h: 1 },
				{ w: 2, h: 2 }
			]
		},
		Last5MediaWidget: {
			component: Last5MediaWidget,
			name: 'Last 5 Media',
			icon: 'mdi:image-multiple',
			defaultW: 2,
			defaultH: 2,
			validSizes: [
				{ w: 1, h: 1 },
				{ w: 2, h: 2 },
				{ w: 2, h: 1 },
				{ w: 1, h: 2 }
			]
		},
		UserActivityWidget: {
			component: UserActivityWidget,
			name: 'User Activity',
			icon: 'mdi:account-group',
			defaultW: 2,
			defaultH: 1,
			validSizes: [
				{ w: 1, h: 1 },
				{ w: 2, h: 1 },
				{ w: 1, h: 2 },
				{ w: 2, h: 2 }
			]
		},
		SystemMessagesWidget: {
			component: SystemMessagesWidget,
			name: 'System Messages',
			icon: 'mdi:message-alert',
			defaultW: 2,
			defaultH: 2,
			validSizes: [
				{ w: 1, h: 1 },
				{ w: 2, h: 1 },
				{ w: 1, h: 2 },
				{ w: 2, h: 2 }
			]
		}
	};

	// Function to reset the grid layout
	function resetGrid() {
		items = []; // Clear local state
		systemPreferences.clearPreferences(data.user.id); // Clear saved preferences
	}

	// Function to remove a widget by id
	function remove(id: string) {
		items = items.filter((item) => item.id !== id);
		saveWidgets(); // Save preferences after removing a widget
	}

	// Function to save the current items layout to user preferences
	async function saveWidgets() {
		// Recalculate positions to ensure no overlaps
		const itemsToSave = organizeWidgetGrid();
		// Save the updated items array for the current screen size and user
		await systemPreferences.setPreference(data.user.id, $screenSize, itemsToSave);
	}

	// Function to organize widgets in a grid layout with no overlaps
	function organizeWidgetGrid() {
		// Create a grid representation to track occupied cells
		const grid: boolean[][] = [];
		const maxCols = cols;

		// Initialize grid with empty cells
		for (let i = 0; i < 100; i++) {
			// Arbitrarily large number of rows
			grid[i] = [];
			for (let j = 0; j < maxCols; j++) {
				grid[i][j] = false; // false means the cell is free
			}
		}

		// Organize items without overlaps
		const organizedItems = [...items].map((item) => ({ ...item }));

		organizedItems.forEach((item) => {
			// Cap width to prevent overflow
			item.w = Math.min(item.w, maxCols);

			// Find next available position
			let placed = false;
			let row = 0;

			while (!placed) {
				for (let col = 0; col <= maxCols - item.w; col++) {
					// Check if we can place the widget here
					let canPlace = true;
					for (let r = 0; r < item.h; r++) {
						for (let c = 0; c < item.w; c++) {
							if (grid[row + r][col + c]) {
								canPlace = false;
								break;
							}
						}
						if (!canPlace) break;
					}

					// If we can place it, mark these cells as occupied
					if (canPlace) {
						for (let r = 0; r < item.h; r++) {
							for (let c = 0; c < item.w; c++) {
								grid[row + r][col + c] = true;
							}
						}

						// Update item position
						item.x = col;
						item.y = row;
						placed = true;
						break;
					}
				}

				if (!placed) row++; // Try next row if can't place in current row
			}
		});

		return organizedItems;
	}

	// Function to add a new widget to the dashboard
	function addNewItem(componentName: string) {
		const componentInfo = widgetComponents[componentName];
		if (componentInfo) {
			const newItem: DashboardWidgetConfig = {
				id: crypto.randomUUID(), // Generate a unique ID
				component: componentName,
				label: componentInfo.name,
				// Initial x, y are placeholders; they will be set correctly by saveWidgets
				x: 0,
				y: 0,
				w: componentInfo.defaultW, // Use default width from config
				h: componentInfo.defaultH, // Use default height from config
				min: { w: 1, h: 1 }, // Define minimum size
				max: { w: cols, h: Infinity }, // Define maximum size (max width is limited by columns)
				movable: true, // Keep this flag, conceptual for dndzone
				resizable: true, // Keep this flag, conceptual for manual resizing
				defaultW: componentInfo.defaultW,
				defaultH: componentInfo.defaultH,
				validSizes: componentInfo.validSizes
			};
			items = [...items, newItem]; // Add the new item to the state array
			saveWidgets(); // Save preferences after adding a widget
		}
		dropdownOpen = false; // Close the dropdown after adding
	}

	// svelte-dnd-action handler: Called when the order of items is being considered (e.g., during drag)
	function handleDndConsider(e: CustomEvent<{ items: DashboardWidgetConfig[] }>) {
		// Update the local state with the potential new order
		items = e.detail.items;
	}

	// svelte-dnd-action handler: Called when the drag and drop action is finalized (item is dropped)
	function handleDndFinalize(e: CustomEvent<{ items: DashboardWidgetConfig[] }>) {
		// Update the local state with the final order
		items = e.detail.items;
		// Save the final layout with reorganized positions
		saveWidgets();
	}

	// Function to toggle the visibility of the add widget dropdown
	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}

	let preferencesLoaded = $state(false);

	// On component mount, load user preferences for the current screen size
	onMount(async () => {
		const MAX_RETRIES = 10;
		let retryCount = 0;

		async function loadWithRetry() {
			try {
				await systemPreferences.loadPreferences(data.user.id);
				const preferencesState = $systemPreferences as any;
				const loadedItems = preferencesState?.[$screenSize];

				// Ensure loaded items are an array and map them to our type, adding defaults if necessary
				items = Array.isArray(loadedItems)
					? loadedItems.map((item) => ({
							...item,
							// Ensure essential properties exist, using defaults from widgetComponents if available
							component: item.component, // Ensure component string is present
							label: item.label || widgetComponents[item.component]?.name || 'Unknown Widget', // Ensure label
							x: item.x ?? 0, // Default x if missing
							y: item.y ?? 0, // Default y if missing
							w: item.w || widgetComponents[item.component]?.defaultW || 1, // Use saved w, or default, or 1
							h: item.h || widgetComponents[item.component]?.defaultH || 1, // Use saved h, or default, or 1
							min: item.min || { w: 1, h: 1 }, // Default min
							// Max width should be capped by current cols, max height can be high
							max: item.max ? { w: Math.min(item.max.w, cols), h: item.max.h } : { w: cols, h: Infinity }, // Default max capped by cols
							movable: item.movable ?? true, // Default movable
							resizable: item.resizable ?? true, // Default resizable
							// Ensure defaultW/H and validSizes exist on the item for widget info
							defaultW: widgetComponents[item.component]?.defaultW || item.w || 1,
							defaultH: widgetComponents[item.component]?.defaultH || item.h || 1,
							validSizes: widgetComponents[item.component]?.validSizes || [{ w: item.w || 1, h: item.h || 1 }]
						}))
					: [];
			} catch (error) {
				if (retryCount < MAX_RETRIES && error instanceof Error && error.message.includes('Database adapter not initialized')) {
					retryCount++;
					await new Promise((resolve) => setTimeout(resolve, 500 * retryCount)); // Exponential backoff
					return loadWithRetry();
				}
				console.error('Failed to load preferences:', error);
				// Fallback to empty items if preferences can't be loaded
				items = [];
				throw error;
			}
		}

		try {
			await loadWithRetry();
		} catch (error) {
			console.error('Final load attempt failed:', error);
		}
		preferencesLoaded = true;
	});

	// Derived state for the current theme
	let currentTheme = $derived($theme);

	// Derived state for widgets that haven't been added yet
	let availableWidgets = $derived(Object.keys(widgetComponents).filter((componentName) => !items.some((item) => item.component === componentName)));

	// Derived state indicating if there are widgets available to add
	let canAddMoreWidgets = $derived(availableWidgets.length > 0);

	// Enhanced drag & drop options with better visual feedback and accessibility
	let isDragging = $state(false);
	let draggedItemId = $state<string | null>(null);

	const dndOptions = {
		dragDisabled: false,
		dropTargetStyle: {
			outline: '2px dashed rgba(var(--color-primary-500), 0.5)',
			backgroundColor: 'rgba(var(--color-primary-500), 0.1)'
		},
		transformDraggedElement: (element: HTMLElement | undefined) => {
			if (element) {
				element.style.transform = 'rotate(3deg) scale(1.02)';
				element.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
				element.style.cursor = 'grabbing';
				element.style.zIndex = '100';
				element.setAttribute('aria-grabbed', 'true');
			}
		},
		createPlaceholder: (node: HTMLElement) => {
			const placeholder = document.createElement('div');
			placeholder.className = 'bg-primary-300/50 dark:bg-primary-700/50 border-2 border-dashed border-primary-500 rounded-lg';
			placeholder.style.width = node.offsetWidth + 'px';
			placeholder.style.height = node.offsetHeight + 'px';
			placeholder.setAttribute('aria-hidden', 'true');
			return placeholder;
		},
		onDragStart: (event: { detail: { item: DashboardWidgetConfig } }) => {
			isDragging = true;
			draggedItemId = event.detail.item.id;
		},
		onDragEnd: () => {
			isDragging = false;
			draggedItemId = null;
		}
	};

	// Accessibility enhancements for keyboard navigation
	function handleKeyDown(e: KeyboardEvent, item: DashboardWidgetConfig) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			// Simulate drag start for keyboard users
			isDragging = true;
			draggedItemId = item.id;
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ') && isDragging) {
			e.preventDefault();
			// Simulate drop for keyboard users
			isDragging = false;
			draggedItemId = null;
			saveWidgets(); // Persist the new order
		}
	}
</script>

<div class="dashboard-container flex h-screen flex-col">
	<div class="my-2 flex items-center justify-between gap-2">
		<div class="flex items-center">
			<PageTitle name="Dashboard" icon="bi:bar-chart-line" />
		</div>
		<button onclick={() => history.back()} aria-label="Back" class="variant-outline-primary btn-icon">
			<iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon>
		</button>
	</div>

	<div class="my-2 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
		<div class="mt-2 flex w-full justify-around gap-2 sm:ml-auto sm:mt-0 sm:w-auto sm:flex-row">
			{#if canAddMoreWidgets}
				<div class="relative">
					<button
						onclick={toggleDropdown}
						type="button"
						aria-haspopup="true"
						aria-expanded={dropdownOpen}
						class="variant-filled-tertiary btn gap-2 !text-white dark:variant-filled-primary"
					>
						<iconify-icon icon="carbon:add-filled" width="24" class="text-white"></iconify-icon>
						Add
					</button>
					{#if dropdownOpen}
						<div
							class="absolute right-0 z-10 mt-2 w-48 divide-y divide-gray-200 rounded border border-gray-300 bg-white shadow-lg dark:divide-gray-600 dark:border-gray-700 dark:bg-gray-800"
							aria-label="Add Widget Menu"
						>
							{#each availableWidgets as componentName}
								<button
									onclick={() => addNewItem(componentName)}
									type="button"
									class="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-gray-200 dark:hover:bg-gray-700"
								>
									<iconify-icon icon={widgetComponents[componentName].icon} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
									{widgetComponents[componentName].name}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			<button class="variant-filled-warning btn" onclick={resetGrid}>Reset All</button>
		</div>
	</div>

	<div class="relative flex-1 overflow-auto p-4" bind:this={gridElement}>
		{#if !preferencesLoaded}
			<p class="text-center text-tertiary-500 dark:text-primary-500">Loading dashboard preferences...</p>
		{:else if items && items.length > 0}
			<div
				class="grid gap-2"
				style="grid-template-columns: repeat({cols}, minmax(0, 1fr));"
				use:dndzone={{ items, ...dndOptions }}
				onconsider={handleDndConsider}
				onfinalize={handleDndFinalize}
				role="grid"
				aria-label="Dashboard widgets grid"
				aria-live="polite"
				aria-relevant="additions removals"
			>
				{#each items as item (item.id)}
					<div
						transition:fade={{ duration: 300 }}
						class="relative cursor-grab active:cursor-grabbing"
						style="
							grid-column: {item.x + 1} / span {item.w};
							grid-row: {item.y + 1} / span {item.h};
							min-width: calc((100% / {cols}) * {item.min?.w ?? 1} - 16px);
							min-height: calc(100px * {item.min?.h ?? 1} - 16px);
							opacity: {draggedItemId === item.id ? 0.5 : 1};
						"
						role="gridcell"
						aria-label={widgetComponents[item.component]?.name || 'Widget'}
						aria-describedby={`widget-${item.id}-desc`}
						tabindex="0"
						onkeydown={(e) => handleKeyDown(e, item)}
						onkeyup={handleKeyUp}
						data-dragging={draggedItemId === item.id}
					>
						<span id={`widget-${item.id}-desc`} class="sr-only"> Press space or enter to move this widget </span>
						<div>
							{#if widgetComponents[item.component]}
								{@const SvelteComponent = widgetComponents[item.component].component}
								<SvelteComponent label={item.label} {currentTheme} {data} on:close={() => remove(item.id)} />
							{:else}
								<div>Widget not found: {item.component}</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-center text-tertiary-500 dark:text-primary-500">No widgets added yet. Use the "Add" button to add widgets.</p>
		{/if}
	</div>
</div>
