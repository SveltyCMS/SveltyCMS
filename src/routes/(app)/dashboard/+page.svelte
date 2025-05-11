<!-- 
@file src/routes/(app)/dashboard/+page.svelte
@component
**This file sets up and displays the dashboard page. It provides a user-friendly interface for managing system resources and system messages**

@example
<Dashboard />

## Features
- Collection builder
- GraphQL API
- Image editor
- Dashboard
- Market Place
- Widget Management
- Theme Management
- Settings
- Access Management
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	// Import the dndzone directive
	import { dndzone } from 'svelte-dnd-action';
	import { userPreferences, type WidgetPreference } from '@root/src/stores/userPreferences.svelte';
	import { screenSize } from '@root/src/stores/screenSizeStore.svelte';
	import { theme } from '@root/src/stores/themeStore.svelte';

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
	// Bind to the grid container element (optional, might not be strictly needed for dndzone itself)
	let gridElement: HTMLElement | undefined = $state();

	// Derived state for number of grid columns based on screen size store
	let cols = $derived($screenSize === 'sm' ? 2 : $screenSize === 'md' ? 3 : 4);

	// Mapping from string identifier to component info, including sizing
	const widgetComponents: Record<
		string,
		{ component: any; name: string; defaultW: number; defaultH: number; validSizes: { w: number; h: number }[] }
	> = {
		CPUWidget: {
			component: CPUWidget,
			name: 'CPU Usage',
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
			defaultW: 2,
			defaultH: 2,
			validSizes: [
				{ w: 1, h: 1 },
				{ w: 2, h: 2 },
				{ w: cols, h: 1 },
				{ w: cols, h: 2 }
			]
		} // Example: Can span full width based on current cols
	};

	// Function to reset the grid layout
	function resetGrid() {
		items = []; // Clear local state
		userPreferences.clearPreferences(data.user.id); // Clear saved preferences
		// No need to call saveWidgets here as preferences are cleared
	}

	// Function to remove a widget by id
	function remove(id: string) {
		items = items.filter((item) => item.id !== id);
		saveWidgets(); // Save preferences after removing a widget
	}

	// Function to save the current items layout to user preferences
	function saveWidgets() {
		// Recalculate x, y coordinates based on the current order of items in the array
		// This maps the linear array order to grid positions based on the number of columns
		const itemsToSave = items.map((item, index) => ({
			...item,
			x: index % cols, // Calculate grid column (0-indexed)
			y: Math.floor(index / cols) // Calculate grid row (0-indexed)
		}));
		// Save the updated items array for the current screen size and user
		userPreferences.setPreference(data.user.id, $screenSize, itemsToSave);
	}

	// Function to cycle through the predefined valid sizes for a widget
	function cycleSize(id: string) {
		items = items.map((item) => {
			if (item.id === id) {
				const currentSize = { w: item.w, h: item.h };
				const componentConfig = widgetComponents[item.component];

				// If no valid sizes defined, handle a basic toggle or do nothing
				if (!componentConfig || !componentConfig.validSizes || componentConfig.validSizes.length === 0) {
					console.warn(`No valid sizes defined for widget: ${item.component}. Cannot cycle size.`);
					// Optional: Implement a default 1x1 toggle if no valid sizes are found
					// const newW = item.w > 1 || item.h > 1 ? 1 : componentConfig?.defaultW ?? 1;
					// const newH = item.w > 1 || item.h > 1 ? 1 : componentConfig?.defaultH ?? 1;
					// return { ...item, w: newW, h: newH };
					return item; // No change if no valid sizes
				}

				// Find the index of the current size in the valid sizes list
				const currentIndex = componentConfig.validSizes.findIndex((size) => size.w === currentSize.w && size.h === currentSize.h);

				// Calculate the index of the next size, wrapping around
				const nextIndex = (currentIndex + 1) % componentConfig.validSizes.length;
				const nextSize = componentConfig.validSizes[nextIndex];

				// Ensure the next size does not exceed the current number of grid columns for width
				const finalW = Math.min(nextSize.w, cols);
				const finalH = nextSize.h; // Height is not limited by columns

				return {
					...item,
					w: finalW,
					h: finalH
					// x, y are based on order and will be recalculated on save/finalize
					// We don't need to change them here as the grid reflows
				};
			}
			return item;
		});
		saveWidgets(); // Save preferences after resizing
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
				// Adding to the end of the array means it will appear at the bottom of the grid flow initially
				x: 0,
				y: items.length,
				w: componentInfo.defaultW, // Use default width from config
				h: componentInfo.defaultH, // Use default height from config
				min: { w: 1, h: 1 }, // Define minimum size (adjust as needed)
				max: { w: cols, h: Infinity }, // Define maximum size (max width is limited by columns)
				movable: true, // Keep this flag, conceptual for dndzone
				resizable: true // Keep this flag, conceptual for button resizing
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
		// We don't save here, only on finalize
	}

	// svelte-dnd-action handler: Called when the drag and drop action is finalized (item is dropped)
	function handleDndFinalize(e: CustomEvent<{ items: DashboardWidgetConfig[] }>) {
		// Update the local state with the final order
		items = e.detail.items;
		// Recalculate x, y based on the new order *after* the drag is complete
		// This is key to mapping the list reorder back to the grid position
		items = items.map((item, index) => ({
			...item,
			x: index % cols, // Calculate grid column based on index
			y: Math.floor(index / cols) // Calculate grid row based on index
		}));
		saveWidgets(); // Save the final layout preferences
	}

	// Function to toggle the visibility of the add widget dropdown
	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}

	// On component mount, load user preferences for the current screen size
	onMount(async () => {
		await userPreferences.loadPreferences(data.user.id);
		const loadedItems = userPreferences[$screenSize()];

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
					resizable: item.resizable ?? true, // Default resizable (conceptual here)
					// Ensure defaultW/H and validSizes exist on the item for the cycleSize function
					defaultW: widgetComponents[item.component]?.defaultW || item.w || 1,
					defaultH: widgetComponents[item.component]?.defaultH || item.h || 1,
					validSizes: widgetComponents[item.component]?.validSizes || [{ w: item.w || 1, h: item.h || 1 }] // Use defined valid sizes or current size as only option
				}))
			: [];

		// After loading, recalculate x,y based on the current loaded order and cols, then save
		// This handles cases where cols might change between saves/loads
		saveWidgets();
	});

	// Derived state for the current theme
	let currentTheme = $derived($theme);

	// Derived state for widgets that haven't been added yet
	let availableWidgets = $derived(Object.keys(widgetComponents).filter((componentName) => !items.some((item) => item.component === componentName)));

	// Derived state indicating if there are widgets available to add
	let canAddMoreWidgets = $derived(availableWidgets.length > 0);

	// svelte-dnd-action options and customizations
	const dndOptions = {
		dragDisabled: false, // Keep dragging enabled
		dropTargetStyle: {
			outline: 'rgba(255, 255, 255, 0.3) solid 2px' // Visual style for potential drop areas
		},
		// Custom transformation during drag (keeps the slight rotation)
		transformDraggedElement: (element: HTMLElement | undefined) => {
			if (element) {
				element.style.transform = 'rotate(5deg)';
				element.style.cursor = 'grabbing'; // Change cursor while grabbing
			}
		},
		// Create a placeholder element visually representing where the item will drop
		createPlaceholder: (node: HTMLElement) => {
			const placeholder = document.createElement('div');
			placeholder.className = 'bg-primary-300 dark:bg-primary-700 border border-dashed border-primary-500 rounded-md opacity-50';
			// Optionally match the size of the dragging item (complex with dynamic grids, simple placeholder is often sufficient)
			placeholder.style.width = node.offsetWidth + 'px';
			placeholder.style.height = node.offsetHeight + 'px';
			return placeholder;
		}
	};

	// Helper function for the size cycling button title
	function getValidSizesText(validSizes: { w: number; h: number }[]) {
		if (!validSizes || validSizes.length === 0) return 'No size options';
		return validSizes.map((size) => `${size.w}x${size.h}`).join(' / ');
	}
</script>

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
								class="block w-full px-4 py-2 text-left hover:bg-gray-200 dark:hover:bg-gray-700"
							>
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

<div class="relative min-h-screen p-4" bind:this={gridElement}>
	{#if items && items.length > 0}
		<div
			class="grid gap-4"
			style="grid-template-columns: repeat({cols}, minmax(0, 1fr));"
			use:dndzone={{ items, ...dndOptions }}
			onconsider={handleDndConsider}
			onfinalize={handleDndFinalize}
		>
			{#each items as item (item.id)}
				<div
					transition:fade={{ duration: 300 }}
					class="relative cursor-grab active:cursor-grabbing"
					style="
						grid-column: {item.x + 1} / span {item.w};
						grid-row: {item.y + 1} / span {item.h};
						/* Optional: Add min size styles based on grid units and item.min */
						/* Adjust row height base (e.g., 100px) and gap based on your CSS */
						min-width: calc((100% / {cols}) * {item.min?.w ?? 1} - 16px); /* Example min-width */
						min-height: calc(100px * {item.min?.h ?? 1} - 16px); /* Example min-height */
					"
				>
					<div class="absolute right-1 top-1 z-10 flex gap-1">
						<button
							onclick={() => cycleSize(item.id)}
							class="btn-icon"
							aria-label="Cycle Widget Size"
							title={`Cycle size: ${getValidSizesText(widgetComponents[item.component]?.validSizes || [])}`}
						>
							<iconify-icon icon="mdi:resize" width="16"></iconify-icon>
						</button>
						<button onclick={() => remove(item.id)} class="btn-icon" aria-label="Remove Widget">✕</button>
					</div>
					<div class="h-full w-full rounded-md border border-surface-500 bg-surface-100 p-2 shadow-2xl dark:bg-surface-700" style="overflow: auto;">
						{#if widgetComponents[item.component]}
							{@const SvelteComponent = widgetComponents[item.component].component}
							<SvelteComponent label={item.label} {currentTheme} {data} />
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
