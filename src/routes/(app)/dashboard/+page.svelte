<!-- 
@file src/routes/(app)/dashboard/+page.svelte
@description This file sets up and displays the dashboard page. It provides a user-friendly interface for managing system resources and system messages.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { userPreferences, type WidgetPreference } from '@stores/userPreferences';
	import { screenSize, type ScreenSize } from '@stores/screenSizeStore';
	import { theme } from '@stores/themeStore';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import CPUWidget from './widgets/CPUWidget.svelte';
	import DiskWidget from './widgets/DiskWidget.svelte';
	import MemoryWidget from './widgets/MemoryWidget.svelte';
	import Last5MediaWidget from './widgets/Last5MediaWidget.svelte';
	import UserActivityWidget from './widgets/UserActivityWidget.svelte';
	import SystemMessagesWidget from './widgets/SystemMessagesWidget.svelte';

	// Svelte-grid
	import { fade } from 'svelte/transition';
	import Grid, { GridItem } from 'svelte-grid-extended';

	export let data: { user: { id: string } };

	let items: WidgetPreference[] = [];
	let dropdownOpen = false;
	let gridElement: HTMLElement;

	$: itemSize = $screenSize === 'sm' ? { width: 150, height: 150 } : $screenSize === 'md' ? { width: 200, height: 200 } : { width: 250, height: 250 };

	$: cols = $screenSize === 'sm' ? 2 : $screenSize === 'md' ? 3 : 4;

	function resetGrid() {
		items = [];
		userPreferences.clearPreferences(data.user.id);
	}

	function remove(id: string) {
		console.log('Removing widget with id:', id);
		items = items.filter((item) => item.id !== id);
		saveWidgets();
	}

	function saveWidgets() {
		console.log('Saving widgets:', items);
		userPreferences.setPreference(data.user.id, $screenSize, items);
	}

	const widgetComponents = {
		CPUWidget: { component: CPUWidget, name: 'CPU Usage' },
		DiskWidget: { component: DiskWidget, name: 'Disk Usage' },
		MemoryWidget: { component: MemoryWidget, name: 'Memory Usage' },
		Last5MediaWidget: { component: Last5MediaWidget, name: 'Last 5 Media' },
		UserActivityWidget: { component: UserActivityWidget, name: 'User Activity' },
		SystemMessagesWidget: { component: SystemMessagesWidget, name: 'System Messages' }
	};

	function findEmptySpace(gridWidth: number, gridHeight: number): { x: number; y: number } | null {
		const grid = Array(gridHeight)
			.fill(null)
			.map(() => Array(gridWidth).fill(false));

		// Mark occupied spaces
		items.forEach((item) => {
			for (let y = item.y; y < item.y + item.h; y++) {
				for (let x = item.x; x < item.x + item.w; x++) {
					if (y < gridHeight && x < gridWidth) {
						grid[y][x] = true;
					}
				}
			}
		});

		// Find first empty space
		for (let y = 0; y < gridHeight; y++) {
			for (let x = 0; x < gridWidth; x++) {
				if (!grid[y][x]) {
					return { x, y };
				}
			}
		}

		return null; // No empty space found
	}

	function addNewItem(componentName: string) {
		const componentInfo = widgetComponents[componentName];
		if (componentInfo) {
			const gridWidth = Math.floor(gridElement.clientWidth / itemSize.width);
			const gridHeight = Math.floor(gridElement.clientHeight / itemSize.height);
			const emptySpace = findEmptySpace(gridWidth, gridHeight);

			if (emptySpace) {
				const newItem: WidgetPreference = {
					id: crypto.randomUUID(),
					component: componentName,
					label: componentInfo.name,
					x: emptySpace.x,
					y: emptySpace.y,
					w: 1,
					h: 1,
					min: { w: 1, h: 1 },
					max: { w: 2, h: 2 },
					movable: true,
					resizable: true
				};
				items = [...items, newItem];
				saveWidgets();
			} else {
				console.warn('No empty space available for new widget');
			}
		} else {
			console.error('Component not found:', componentName);
		}
		dropdownOpen = false;
	}

	function handleLayoutChange(event: CustomEvent) {
		if (Array.isArray(event.detail)) {
			items = event.detail.map((item) => ({
				...items.find((i) => i.id === item.id),
				...item
			}));
			saveWidgets();
		}
	}

	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}

	onMount(async () => {
		await userPreferences.loadPreferences(data.user.id);
		const loadedItems = $userPreferences[$screenSize];
		items = Array.isArray(loadedItems) ? loadedItems : [];
	});

	$: currentTheme = $theme;

	$: availableWidgets = Object.keys(widgetComponents).filter((componentName) => !items.some((item) => item.component === componentName));

	$: canAddMoreWidgets = availableWidgets.length > 0 && items.length < cols * Math.floor(gridElement?.clientHeight / itemSize.height || 0);
</script>

<div class="my-2 flex items-center justify-between gap-2">
	<!-- Page Title -->
	<div class="flex items-center">
		<PageTitle name="Dashboard" icon="bi:bar-chart-line" />
	</div>

	<!-- Back Button -->
	<button on:click={() => history.back()} class="variant-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20" />
	</button>
</div>

<div class="my-2 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
	<div class="mt-2 flex w-full justify-around gap-2 sm:ml-auto sm:mt-0 sm:w-auto sm:flex-row">
		{#if canAddMoreWidgets}
			<div class="relative">
				<button
					on:click={toggleDropdown}
					type="button"
					class="variant-filled-tertiary btn gap-2 !text-white dark:variant-filled-primary"
					aria-haspopup="true"
					aria-expanded={dropdownOpen}
				>
					<iconify-icon icon="carbon:add-filled" width="24" class="text-white" />
					Add
				</button>
				{#if dropdownOpen}
					<div
						class="absolute right-0 z-10 mt-2 w-48 divide-y divide-gray-200 rounded border border-gray-300 bg-white shadow-lg dark:divide-gray-600 dark:border-gray-700 dark:bg-gray-800"
						aria-label="Add Widget Menu"
					>
						{#each availableWidgets as componentName}
							<button
								on:click={() => addNewItem(componentName)}
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
		<button class="variant-filled-warning btn" on:click={resetGrid}>Reset All</button>
	</div>
</div>

<div class="relative h-screen" bind:this={gridElement}>
	{#if items && items.length > 0}
		<Grid {cols} {itemSize} on:change={handleLayoutChange}>
			{#each items as item (item.id)}
				<GridItem
					id={item.id}
					x={item.x}
					y={item.y}
					w={item.w}
					h={item.h}
					min={item.min}
					max={item.max}
					movable={item.movable}
					resizable={item.resizable}
				>
					<div transition:fade={{ duration: 300 }} class="relative h-full w-full">
						<div class="absolute right-1 top-1 z-10">
							<button on:click={() => remove(item.id)} class="btn-icon" aria-label="Remove Widget">✕</button>
						</div>
						<div class="h-full w-full rounded-md border border-surface-500 bg-surface-100 p-2 shadow-2xl dark:bg-surface-700">
							{#if widgetComponents[item.component]}
								<svelte:component this={widgetComponents[item.component].component} label={item.label} {currentTheme} />
							{:else}
								<div>Widget not found: {item.component}</div>
							{/if}
						</div>
					</div>
				</GridItem>
			{/each}
		</Grid>
	{:else}
		<p class="text-tertiary-500 dark:text-primary-500">No widgets added yet. Use the "Add" button to add widgets.</p>
	{/if}
</div>
