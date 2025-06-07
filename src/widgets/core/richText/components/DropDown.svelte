<!--
@file: /src/components/Dropdown.svelte
@description: An improved dropdown component that displays the currently selected item and properly handles icons
-->

<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	import { onMount } from 'svelte';

	// Define props using $props
	let {
		items = [], // Array of selectable items
		label = '', // Optional label for the dropdown
		icon = undefined, // Optional icon for the dropdown button
		class: className = '', // Custom class for the dropdown container
		show = true, // Whether to show the dropdown
		active = $bindable('') // Currently active dropdown ID
	} = $props();

	let expanded = $state(false);
	let dropdownRef = $state<HTMLDivElement>();
	let dropdownId = $state(`dropdown-${Math.random().toString(36).substring(2, 9)}`);

	// Get active item based on items with active: true
	function getActiveItem() {
		return items.find((item) => item.active && item.active());
	}

	// Toggle dropdown expansion
	function toggleExpanded(e: MouseEvent) {
		e.stopPropagation();

		// Close any other open dropdown
		if (active !== dropdownId && active !== '') {
			active = '';
		}

		expanded = !expanded;
		if (expanded) {
			active = dropdownId;
		} else {
			active = '';
		}
	}

	// Handle item selection
	function selectItem(item: any, e: MouseEvent) {
		e.stopPropagation();
		if (item.onClick) {
			item.onClick();
		}
		expanded = false;
		active = '';
	}

	// Effect to handle closing when active changes
	$effect(() => {
		if (active !== dropdownId) {
			expanded = false;
		}
	});

	// Add global click event listener to close dropdown when clicking outside
	onMount(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef && !dropdownRef.contains(event.target as Node) && expanded) {
				expanded = false;
				active = '';
			}
		};

		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Get display text for button
	function getButtonText() {
		const activeItem = getActiveItem();
		if (activeItem) {
			return activeItem.name || activeItem.title || '';
		}
		return label;
	}

	// Get button icon
	function getButtonIcon() {
		if (icon) return icon;

		const activeItem = getActiveItem();
		return activeItem?.icon || undefined;
	}
</script>

<!-- Dropdown container -->
<div class={twMerge('relative', className)} class:hidden={!show} bind:this={dropdownRef}>
	<!-- Dropdown button -->
	<button
		onclick={toggleExpanded}
		class="variant-filled-tertiary btn flex w-fit items-center dark:variant-ghost-primary"
		aria-expanded={expanded}
		aria-controls={`dropdown-content-${dropdownId}`}
	>
		{#if getButtonIcon()}
			<iconify-icon icon={getButtonIcon()} width="22" class="mr-1"></iconify-icon>
		{/if}
		<span class="hidden sm:inline">{getButtonText()}</span>
	</button>

	<!-- Dropdown content -->
	{#if expanded}
		<div
			id={`dropdown-content-${dropdownId}`}
			class="absolute z-20 mt-1 w-fit min-w-full overflow-auto rounded-md bg-white shadow-lg dark:bg-gray-800"
		>
			<!-- Dropdown items -->
			{#each items as item}
				<button
					onclick={(e) => selectItem(item, e)}
					class="flex w-full items-center px-4 py-2 text-left text-surface-700 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
					class:active={item.active && item.active()}
				>
					{#if item.icon}
						<span class="mr-2">
							<iconify-icon icon={item.icon} width="18"></iconify-icon>
						</span>
					{/if}
					<span>{item.name || item.title || ''}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	button.active {
		color: rgb(0, 255, 123);
	}
</style>
