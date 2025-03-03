<!--
@file: /src/components/Dropdown.svelte
@component: 
**Dropdown component that allows selection from a list of items. It supports custom styling, item modification, and an optional icon.**
A customizable dropdown component that allows selection from a list of items. It supports custom styling, item modification, and an optional icon.
-->

<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	// Define props using $props
	let {
		items, // Array of selectable items
		selected = items[0], // Currently selected item, default to first item
		label = '', // Optional label for the dropdown
		modifier = (input: any) => input, // Function to modify how items are displayed
		class: className = '', // Custom class for the dropdown container
		show = true // Whether to show the dropdown
	} = $props<{
		items: any[];
		selected?: any;
		label?: string;
		modifier?: (input: any) => any;
		class?: string;
		show?: boolean;
	}>();

	// State for dropdown expansion and selected item
	let expanded = $state(false);
	let currentSelected = $state(selected);

	// Derived state for filtered items
	let filteredItems = $derived(items.filter((item: any) => item !== currentSelected));

	// Toggle dropdown expansion
	function toggleExpanded() {
		expanded = !expanded;
	}

	// Handle item selection
	function selectItem(item: any) {
		currentSelected = item;
		expanded = false;
	}

	// Effect to update currentSelected when the selected prop changes
	$effect(() => {
		currentSelected = selected;
	});
</script>

<!-- Dropdown container -->
<div class={twMerge('bg-surface-500 overflow-hidden', className)} class:hidden={!show}>
	<!-- Dropdown button -->
	<button
		onclick={toggleExpanded}
		class="preset-filled-tertiary-500 btn dark:preset-tonal-primary border-primary-500 border"
		aria-label="Toggle Dropdown"
		class:selected={expanded}
	>
		{currentSelected || label}
	</button>
</div>

<!-- Dropdown content -->
{#if expanded}
	<!-- Dropdown header -->
	<div class="text-tertiary-500 dark:text-primary-500 mb-3 border-b text-center">Choose your Widget</div>

	<!-- Dropdown items -->
	<div class="flex flex-wrap items-center justify-center gap-2">
		{#each filteredItems as item}
			<button
				onclick={() => selectItem(item)}
				class="preset-filled-warning-500 btn hover:preset-filled-secondary-500 dark:preset-outline-warning relative"
				aria-label={modifier(item)}
			>
				<span class="text-surface-700 dark:text-white">{modifier(item)}</span>
			</button>
		{/each}
	</div>
{/if}
