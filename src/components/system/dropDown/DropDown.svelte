<!--
@file: /src/components/Dropdown.svelte
@component: 
**Dropdown component that allows selection from a list of items. It supports custom styling, item modification, and an optional icon.**

@example
<Dropdown items={['Option 1', 'Option 2', 'Option 3']} />

#### Props
- `items` {string[]} - Array of selectable items
- `selected` {string} - Currently selected item
- `label` {string} - Optional label for the dropdown
- `modifier` {function} - Function to modify how items are displayed
- `icon` {string} - Optional icon for the dropdown
- `class` {string} - Custom class for the dropdown container

#### Features:
- Dropdown component that allows selection from a list of items
- Custom styling, item modification, and an optional icon
-->

<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	// Define props using $props
	let {
		items, // Array of selectable items
		selected = undefined, // Currently selected item, safer default
		label = '', // Optional label for the dropdown
		modifier = (input: string) => input, // Function to modify how items are displayed - Updated type
		// icon = undefined, // Optional icon for the dropdown
		class: className = '' // Custom class for the dropdown container
		// dropdownId = 'dropdown-' + Math.random().toString(36).substr(2, 9) // Unique ID for a11y
	} = $props<{
		items: string[]; // Updated type to string array
		selected?: string; // Updated type to string
		label?: string;
		modifier?: (input: string) => string; // Updated modifier type
		icon?: string | undefined;
		class?: string;
		ariaLabel?: string;
		dropdownId?: string;
	}>();

	// State for dropdown expansion and selected item
	let expanded = $state(false);
	let currentSelected = $state<string | undefined>(selected); // Explicitly type state

	// Derived state for filtered items
	let filteredItems = $derived(items.filter((item: string) => item !== currentSelected)); // Type explicitly defined

	// Toggle dropdown expansion
	function toggleExpanded() {
		expanded = !expanded;
	}

	// Handle item selection
	function selectItem(item: string) {
		// Updated parameter type
		currentSelected = item;
		expanded = false;
	}

	// Effect to update currentSelected when the selected prop changes
	$effect(() => {
		currentSelected = selected;
	});
</script>

<!-- Dropdown container -->
<div class={twMerge('bg-surface-500 overflow-hidden', className)}>
	<!-- Dropdown button -->
	<button
		onclick={toggleExpanded}
		class="preset-filled-tertiary-500 btn dark:preset-tonal-primary border-primary-500 border"
		aria-label={label || 'Toggle Dropdown'}
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
				aria-label={`Select ${modifier(item)}`}
			>
				<span class="text-surface-700 dark:text-white">{modifier(item)}</span>
			</button>
		{/each}
	</div>
{/if}
