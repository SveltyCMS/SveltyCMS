<!--
@file: /src/components/Dropdown.svelte
@component:
**Dropdown component that allows selection from a list of items. It supports custom styling, item modification, and an optional icon.**

### Props
- `items`: Array<any> - List of items to choose from.
- `selected`: any - Currently selected item (default: first item in `items`).
- `label`: string - Optional label for the dropdown button.
- `modifier`: (input: any) => any - Function to modify how items are displayed.
- `class`: string - Custom class for the dropdown container.

### Features
- **Customizable Items**: Accepts any array of items for selection.
- **Default Selection**: Automatically selects the first item if none is provided.
- **Item Modification**: Allows a function to modify item display.
- **Expandable Dropdown**: Toggles visibility of the item list.
-->

<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	// Define props using $props
	const {
		items, // Array of selectable items
		selected, // Currently selected item (no default here, handled dynamically)
		label = '', // Optional label for the dropdown
		modifier = (input: any) => input, // Function to modify how items are displayed
		class: className = '' // Custom class for the dropdown container
	} = $props();

	// --- STATE ---
	// State for dropdown expansion and selected item
	let expanded = $state(false);
	// Use $derived to reactively track selected prop changes
	let currentSelected = $derived(selected);

	// Effect to update currentSelected when the selected prop changes or to set initial default
	$effect(() => {
		if (selected !== undefined) {
			currentSelected = selected;
		} else if (items && items.length > 0) {
			currentSelected = items[0];
		} else {
			currentSelected = undefined; // No selected item or items available
		}
	});

	// Derived state for filtered items
	const filteredItems = $derived(items.filter((item: any) => item !== currentSelected));

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
<div class={twMerge('overflow-hidden bg-surface-500', className)}>
	<!-- Dropdown button -->
	<button
		onclick={toggleExpanded}
		class="variant-filled-tertiary btn dark:variant-ghost-primary"
		aria-label="Toggle Dropdown"
		class:selected={expanded}
	>
		{currentSelected || label}
	</button>
</div>

<!-- Dropdown content -->
{#if expanded}
	<!-- Dropdown header -->
	<div class="mb-3 border-b text-center text-tertiary-500 dark:text-primary-500">Choose your Widget</div>

	<!-- Dropdown items -->
	<div class="flex flex-wrap items-center justify-center gap-2">
		{#each filteredItems as item}
			<button
				onclick={() => selectItem(item)}
				class="variant-filled-warning btn relative hover:variant-filled-secondary dark:variant-outline-warning"
				aria-label={modifier(item)}
			>
				<span class="text-surface-700 dark:text-white">{modifier(item)}</span>
			</button>
		{/each}
	</div>
{/if}
