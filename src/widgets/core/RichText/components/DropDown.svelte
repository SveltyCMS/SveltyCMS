<!--
@file: /src/components/Dropdown.svelte
@component
**An improved dropdown component that displays the currently selected item and properly handles icons**

### Props
- `items`: Array of selectable items
- `label`: Optional label for the dropdown
- `icon`: Optional icon for the dropdown button
- `class`: Custom class for the dropdown container
- `show`: Whether to show the dropdown
- `active`: Currently active dropdown ID

### Features
- Click to edit
- Enter to save
- Escape to cancel
-->

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	// Define props using Svelte 5 runes
	let {
		items = [], // Array of selectable items
		label = '', // Optional label for the dropdown
		icon = undefined, // Optional icon for the dropdown button
		class: className = '', // Custom class for the dropdown container
		show = true, // Whether to show the dropdown
		active = $bindable('') // Currently active dropdown ID
	} = $props();

	let expanded = $state(false);
	let dropdownRef: HTMLDivElement | undefined = $state();
	let buttonRef: HTMLButtonElement | undefined = $state();
	const dropdownId = $state(`dropdown-${Math.random().toString(36).substring(2, 9)}`);
	const listboxId = $derived(`${dropdownId}-menu`);
	let focusedIndex = $state(-1); // roving focus index when expanded
	const itemRefs: Array<HTMLButtonElement | null> = [];
	let _refresh = $state(0); // force re-render when selection changes

	// Action to capture each item's button element reference
	function captureItem(node: HTMLButtonElement, index: number) {
		itemRefs[index] = node;
		return {
			destroy() {
				// Clean up reference on removal
				if (itemRefs[index] === node) itemRefs[index] = null;
			}
		};
	}

	// Get active item based on items with active: true
	function getActiveItem() {
		return items.find((item) => item.active && item.active());
	}

	// Toggle dropdown expansion
	function open(expandToIndex: number | null = null) {
		if (expanded) return;
		// close other dropdowns
		if (active !== dropdownId && active !== '') active = '';
		expanded = true;
		active = dropdownId;
		// set initial focus index
		const activeItem = getActiveItem();
		let idx = expandToIndex ?? (activeItem ? items.findIndex((i) => i === activeItem) : 0);
		if (idx < 0) idx = 0;
		focusedIndex = idx;
		tick().then(() => itemRefs[focusedIndex]?.focus());
	}

	function close(focusButton = true) {
		if (!expanded) return;
		expanded = false;
		active = '';
		focusedIndex = -1;
		if (focusButton) buttonRef?.focus();
	}

	function toggleExpanded(e: Event) {
		e.stopPropagation();
		expanded ? close(true) : open();
	}

	// Handle item selection
	function selectItem(item: any, e: Event) {
		e.stopPropagation();
		if (item.onClick) item.onClick();
		_refresh++; // trigger recompute of button label/icon
		close(true);
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
				close(false);
			}
		};

		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Button label/icon reflect active item or fallback to provided label/icon
	function getButtonText() {
		const ai = getActiveItem();
		return (ai && (ai.name || ai.title)) || label;
	}

	function getButtonIcon() {
		const ai = getActiveItem();
		// If we have an active item with icon use it, else fallback to provided icon
		return ai?.icon || icon;
	}
</script>

<div class={twMerge('relative', className)} class:hidden={!show} bind:this={dropdownRef}>
	<button
		bind:this={buttonRef}
		onclick={toggleExpanded}
		onkeydown={(e) => {
			if (e.key === 'ArrowDown') {
				open(0);
				e.preventDefault();
			} else if (e.key === 'ArrowUp') {
				open(items.length - 1);
				e.preventDefault();
			} else if (e.key === 'Enter' || e.key === ' ') {
				open();
				e.preventDefault();
			}
		}}
		class="preset-filled-tertiary-500 btn flex w-fit items-center gap-1 rounded dark:preset-ghost-primary-500"
		aria-haspopup="true"
		aria-expanded={expanded}
		aria-controls={listboxId}
		id={`${dropdownId}-button`}
		aria-label={label || undefined}
	>
		{#if getButtonIcon()}
			<iconify-icon
				icon={getButtonIcon()}
				width="18"
				class={getActiveItem() ? 'text-tertiary-50 dark:text-tertiary-300' : 'text-surface-800 dark:text-surface-200'}
			></iconify-icon>
		{/if}
		<span class="hidden text-sm sm:inline" class:text-tertiary-50={!!getActiveItem()} class:text-surface-800={!getActiveItem()}
			>{getButtonText()}</span
		>
	</button>

	{#if expanded}
		<div
			id={listboxId}
			class="absolute z-20 mt-1 w-fit min-w-full overflow-auto rounded-md border border-surface-400/30 bg-surface-50/95 shadow-lg backdrop-blur-sm focus:outline-none dark:border-surface-300/20 dark:bg-surface-800/90"
			role="menu"
			tabindex="-1"
			aria-labelledby={`${dropdownId}-button`}
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					close(true);
					return;
				}
				const max = items.length - 1;
				if (e.key === 'ArrowDown') {
					focusedIndex = focusedIndex < max ? focusedIndex + 1 : 0;
					itemRefs[focusedIndex]?.focus();
					e.preventDefault();
				} else if (e.key === 'ArrowUp') {
					focusedIndex = focusedIndex > 0 ? focusedIndex - 1 : max;
					itemRefs[focusedIndex]?.focus();
					e.preventDefault();
				} else if (e.key === 'Home') {
					focusedIndex = 0;
					itemRefs[focusedIndex]?.focus();
					e.preventDefault();
				} else if (e.key === 'End') {
					focusedIndex = max;
					itemRefs[focusedIndex]?.focus();
					e.preventDefault();
				}
			}}
		>
			{#each items as item, i}
				<button
					use:captureItem={i}
					onclick={(e) => selectItem(item, e)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							selectItem(item, e);
							e.preventDefault();
						}
					}}
					class="flex w-full items-center gap-2 px-3 py-2 text-left text-surface-700 hover:bg-surface-200/70 focus:bg-tertiary-500/20 focus:outline-none dark:text-white dark:hover:bg-surface-600/60 dark:focus:bg-tertiary-400/25"
					class:active={item.active && item.active()}
					role="menuitem"
					tabindex={i === focusedIndex ? 0 : -1}
					aria-current={item.active && item.active() ? 'true' : undefined}
				>
					{#if item.active && item.active()}
						<iconify-icon icon="mdi:check" width="16" class="text-tertiary-600 dark:text-tertiary-400"></iconify-icon>
					{:else if item.icon}
						<iconify-icon icon={item.icon} width="18"></iconify-icon>
					{/if}
					<span class="whitespace-nowrap text-sm">{item.name || item.title || ''}</span>
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
