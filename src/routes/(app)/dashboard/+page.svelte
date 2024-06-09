<script lang="ts">
	import { publicEnv } from '@root/config/public';

	// Components
	import PageTitle from '@src/components/PageTitle.svelte';
	import CPUWidget from './CPUWidget.svelte';
	import DiskWidget from './DiskWidget.svelte';
	import MemoryWidget from './MemoryWidget.svelte';
	import Last5MediaWidget from './Last5MediaWidget.svelte';
	import UserActivityWidget from './UserActivityWidget.svelte';
	import SystemMessagesWidget from './SystemMessagesWidget.svelte';

	// Svelte-grid
	import { fade } from 'svelte/transition';
	import Grid, { GridItem } from 'svelte-grid-extended';
	import { onMount } from 'svelte';

	type WidgetComponent =
		| typeof CPUWidget
		| typeof DiskWidget
		| typeof MemoryWidget
		| typeof Last5MediaWidget
		| typeof UserActivityWidget
		| typeof SystemMessagesWidget;

	type GridItemType = {
		id: string;
		x: number;
		y: number;
		w: number;
		h: number;
		min: { w: number; h: number };
		max: { w: number; h: number } | undefined;
		movable: boolean;
		resizable: boolean;
		component: WidgetComponent;
		label: string; // Added label property
	};

	let items: GridItemType[] = [];
	let dropdownOpen = false;

	const itemSize = { height: 40 };

	function resetGrid() {
		items = [];
	}

	function remove(id: string) {
		items = items.filter((i) => i.id !== id);
		saveWidgets();
	}

	function saveWidgets() {
		const serializedWidgets = gridController.save();
		localStorage.setItem('dashboardWidgets', JSON.stringify(serializedWidgets));
	}

	function loadWidgets() {
		const savedWidgets = localStorage.getItem('dashboardWidgets');
		if (savedWidgets) {
			items = JSON.parse(savedWidgets);
		}
	}

	let gridController;

	function addNewItem(componentType: WidgetComponent, label: string) {
		const newItem = {
			id: crypto.randomUUID(),
			x: 0,
			y: 0,
			w: 2,
			h: 5,
			min: { w: 1, h: 1 },
			max: undefined,
			movable: true,
			resizable: true,
			component: componentType,
			label // Added label property to the new item
		};
		items = [...items, newItem];
		saveWidgets();
		dropdownOpen = false; // Close the dropdown
	}

	onMount(() => {
		loadWidgets();
	});
</script>

<div class="my-2 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
	<PageTitle name="Dashboard" icon="clarity:dashboard-line" />
	<div class="mt-2 flex w-full justify-around gap-2 sm:ml-auto sm:mt-0 sm:w-auto sm:flex-row">
		<div class="relative">
			<button
				on:click={() => (dropdownOpen = !dropdownOpen)}
				type="button"
				class="variant-filled-tertiary btn gap-2 !text-white dark:variant-filled-primary"
			>
				<iconify-icon icon="carbon:add-filled" width="24" class="text-white" />
				Add
			</button>
			{#if dropdownOpen}
				<div
					class="absolute right-0 z-10 mt-2 w-48 divide-y divide-gray-200 rounded border border-gray-300 bg-white shadow-lg dark:divide-gray-600 dark:border-gray-700 dark:bg-gray-800"
				>
					<button
						on:click={() => addNewItem(CPUWidget, 'CPU')}
						type="button"
						class="block w-full px-4 py-2 text-left hover:bg-gray-200 dark:hover:bg-gray-700">ADD CPU</button
					>
					<button
						on:click={() => addNewItem(DiskWidget, 'Disk')}
						type="button"
						class="block w-full px-4 py-2 text-left hover:bg-gray-200 dark:hover:bg-gray-700">ADD DISK</button
					>
					<button
						on:click={() => addNewItem(MemoryWidget, 'Memory')}
						type="button"
						class="block w-full px-4 py-2 text-left hover:bg-gray-200 dark:hover:bg-gray-700">ADD MEMORY</button
					>
					<button
						on:click={() => addNewItem(Last5MediaWidget, 'Last 5 Media')}
						type="button"
						class="block w-full px-4 py-2 text-left hover:bg-gray-200 dark:hover:bg-gray-700">ADD LAST 5 MEDIA</button
					>
					<button
						on:click={() => addNewItem(UserActivityWidget, 'User Activity')}
						type="button"
						class="block w-full px-4 py-2 text-left hover:bg-gray-200 dark:hover:bg-gray-700">ADD USER ACTIVITY</button
					>
					<button
						on:click={() => addNewItem(SystemMessagesWidget, 'System Messages')}
						type="button"
						class="block w-full px-4 py-2 text-left hover:bg-gray-200 dark:hover:bg-gray-700">ADD SYSTEM MESSAGES</button
					>
				</div>
			{/if}
		</div>
		<button class="variant-filled-secondary btn" on:click={resetGrid}>Reset Grid</button>
	</div>
</div>

<div class="relative h-screen">
	<Grid {itemSize} cols={10} collision="push" bind:controller={gridController}>
		{#each items as item (item.id)}
			<div transition:fade={{ duration: 300 }}>
				<GridItem
					id={item.id}
					bind:x={item.x}
					bind:y={item.y}
					bind:w={item.w}
					bind:h={item.h}
					min={item.min}
					max={item.max}
					movable={item.movable}
					resizable={item.resizable}
				>
					<button on:pointerdown={(e) => e.stopPropagation()} on:click={() => remove(item.id)} class="btn-icon absolute right-0 z-20 text-black">
						✕
					</button>
					<div
						class="flex h-full w-full items-center justify-center rounded-md border border-surface-500 bg-surface-100 shadow-2xl dark:bg-surface-700"
					>
						<svelte:component this={item.component} label={item.label} />
					</div>
				</GridItem>
			</div>
		{/each}
	</Grid>
</div>
