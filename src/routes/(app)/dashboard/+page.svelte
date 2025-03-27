<!-- 
@file src/routes/(app)/dashboard/+page.svelte
@component
**This file sets up and displays the dashboard page. It provides a user-friendly interface for managing system resources and system messages**

```tsx
<Dashboard />
```

-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { dndzone } from 'svelte-dnd-action';
	import { userPreferences, type WidgetPreference } from '@root/src/stores/userPreferences.svelte';
	import { screenSize, type ScreenSize } from '@root/src/stores/screenSizeStore.svelte';
	import { theme } from '@root/src/stores/themeStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import CPUWidget from './widgets/CPUWidget.svelte';
	import DiskWidget from './widgets/DiskWidget.svelte';
	import MemoryWidget from './widgets/MemoryWidget.svelte';
	import Last5MediaWidget from './widgets/Last5MediaWidget.svelte';
	import UserActivityWidget from './widgets/UserActivityWidget.svelte';
	import SystemMessagesWidget from './widgets/SystemMessagesWidget.svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		data: { user: { id: string } };
	}

	let { data }: Props = $props();

	let items: WidgetPreference[] = $state([]);
	let dropdownOpen = $state(false);
	let gridElement: HTMLElement | undefined = $state();

	let cols = $derived($screenSize === 'sm' ? 2 : $screenSize === 'md' ? 3 : 4);

	const widgetComponents = {
		CPUWidget: { component: CPUWidget, name: 'CPU Usage' },
		DiskWidget: { component: DiskWidget, name: 'Disk Usage' },
		MemoryWidget: { component: MemoryWidget, name: 'Memory Usage' },
		Last5MediaWidget: { component: Last5MediaWidget, name: 'Last 5 Media' },
		UserActivityWidget: { component: UserActivityWidget, name: 'User Activity' },
		SystemMessagesWidget: { component: SystemMessagesWidget, name: 'System Messages' }
	};

	function resetGrid() {
		items = [];
		userPreferences.clearPreferences(data.user.id);
	}

	function remove(id: string) {
		items = items.filter((item) => item.id !== id);
		saveWidgets();
	}

	function saveWidgets() {
		userPreferences.setPreference(data.user.id, $screenSize, items);
	}

	function toggleSize(id: string) {
		items = items.map((item) => {
			if (item.id === id) {
				const isExpanded = item.w > 1 || item.h > 1;
				return {
					...item,
					w: isExpanded ? 1 : Math.min(item.max?.w ?? 2, 2),
					h: isExpanded ? 1 : Math.min(item.max?.h ?? 2, 2)
				};
			}
			return item;
		});
		saveWidgets();
	}

	function addNewItem(componentName: string) {
		const componentInfo = widgetComponents[componentName];
		if (componentInfo) {
			// Find the first available position
			let position = findFirstAvailablePosition();

			const newItem: WidgetPreference = {
				id: crypto.randomUUID(),
				component: componentName,
				label: componentInfo.name,
				x: position.x,
				y: position.y,
				w: 1,
				h: 1,
				min: { w: 1, h: 1 },
				max: { w: 2, h: 2 },
				movable: true,
				resizable: true
			};
			items = [...items, newItem];
			saveWidgets();
		}
		dropdownOpen = false;
	}

	function findFirstAvailablePosition() {
		const grid = Array(20)
			.fill(null)
			.map(() => Array(cols).fill(false));

		// Mark occupied positions
		items.forEach((item) => {
			for (let y = item.y; y < item.y + item.h; y++) {
				for (let x = item.x; x < item.x + item.w; x++) {
					if (y < grid.length && x < cols) {
						grid[y][x] = true;
					}
				}
			}
		});

		// Find first empty position
		for (let y = 0; y < grid.length; y++) {
			for (let x = 0; x < cols; x++) {
				if (!grid[y][x]) {
					return { x, y };
				}
			}
		}

		// Fallback to adding at the end
		return { x: 0, y: items.length };
	}

	function handleDndConsider(e: CustomEvent<{ items: WidgetPreference[] }>) {
		items = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent<{ items: WidgetPreference[] }>) {
		items = e.detail.items;
		// Update positions after drag
		items = items.map((item, index) => ({
			...item,
			x: index % cols,
			y: Math.floor(index / cols)
		}));
		saveWidgets();
	}

	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}

	onMount(async () => {
		await userPreferences.loadPreferences(data.user.id);
		const loadedItems = userPreferences[screenSize()];
		items = Array.isArray(loadedItems) ? loadedItems : [];
	});

	let currentTheme = $derived($theme);

	let availableWidgets = $derived(Object.keys(widgetComponents).filter((componentName) => !items.some((item) => item.component === componentName)));

	let canAddMoreWidgets = $derived(availableWidgets.length > 0);

	const dndOptions = {
		dragDisabled: false,
		dropTargetStyle: {
			outline: 'rgba(255, 255, 255, 0.3) solid 2px'
		},
		transformDraggedElement: (element: HTMLElement | undefined) => {
			if (element) {
				element.style.transform = 'rotate(5deg)';
			}
		}
	};
</script>

<div class="my-2 flex items-center justify-between gap-2">
	<!-- Page Title -->
	<div class="flex items-center">
		<PageTitle name="Dashboard" icon="bi:bar-chart-line" />
	</div>

	<!-- Back Button -->
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
			use:dndzone={{
				items,
				dragDisabled: false,
				dropTargetStyle: { outline: '2px solid var(--color-primary-500)' },
				transformDraggedElement: (element: HTMLElement | undefined) => {
					if (element) {
						element.style.transform = 'rotate(5deg)';
					}
				}
			}}
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
					"
				>
					<div class="absolute right-1 top-1 z-10 flex gap-1">
						<button
							onclick={() => toggleSize(item.id)}
							class="btn-icon"
							aria-label="Toggle Widget Size"
							title={item.w > 1 || item.h > 1 ? 'Shrink' : 'Expand'}
						>
							<iconify-icon icon={item.w > 1 || item.h > 1 ? 'mdi:arrow-collapse' : 'mdi:arrow-expand'} width="16"></iconify-icon>
						</button>
						<button onclick={() => remove(item.id)} class="btn-icon" aria-label="Remove Widget">✕</button>
					</div>
					<div class="h-full w-full rounded-md border border-surface-500 bg-surface-100 p-2 shadow-2xl dark:bg-surface-700">
						{#if widgetComponents[item.component]}
							{@const SvelteComponent = widgetComponents[item.component].component}
							<SvelteComponent label={item.label} {currentTheme} />
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
