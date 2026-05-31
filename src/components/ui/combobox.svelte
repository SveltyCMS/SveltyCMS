<!--
@file src/components/ui/combobox.svelte
@component
**SveltyCMS Combobox — WCAG 3.0 Ready**

Searchable autocomplete dropdown with fuzzy filtering, keyboard navigation
(Arrow keys, Enter, Escape), custom option snippets, click-outside dismissal,
async loading, grouped options, configurable debounce, and clearable selection.

### Props
- `value` (any): Bindable selected value.
- `options` (Option[]): Array of { label, value, icon?, disabled?, group? }.
- `placeholder` (string): Input placeholder text.
- `disabled` (boolean): Disable interaction.
- `allowCustom` (boolean): Allow free-text values not in options.
- `label` (string): Accessible label.
- `error` (string): Error message with aria-describedby linkage.
- `class` (string): Additional CSS classes.
- `onchange` (function): Callback with selected value.
- `option` (Snippet): Custom option rendering.
- `clearable` (boolean): Show clear button when value is set (default: false).
- `hideEmptyState` (boolean): Hide dropdown when no results match (default: false).
- `groupBy` (function): Group items by a key for group headers.
- `debounceWait` (number): Debounce filter in ms (default: 0, no debounce).
- `loading` (boolean): Show loading spinner in dropdown.

### Snippets
- `option`: Custom per-option rendering with { item, selected, active }.
- `empty`: Custom empty state content (replaces default "No results found").

### Features:
- fuzzy search with scoring (exact > prefix > contains)
- auto-deduplication of duplicate option values
- group headers with non-selectable dividers
- configurable input debounce
- clearable selection with × button
- async loading indicator
- WCAG 3.0 ready with aria-expanded, aria-label, keyboard nav
- slide transition animation on dropdown
- full Svelte 5 runes: $props, $bindable, $derived, $state, $effect
-->

<script lang="ts">
import { cn } from '@utils/cn';
import { slide } from 'svelte/transition';
import { onMount, type Snippet } from 'svelte';

interface Option {
	label: string;
	value: any;
	icon?: string;
	disabled?: boolean;
}

interface Props {
	value?: any;
	options: Option[];
	placeholder?: string;
	disabled?: boolean;
	allowCustom?: boolean;
	class?: string;
	onchange?: (value: any) => void;
	label?: string;
	error?: string;
	// Phase 1 additions
	clearable?: boolean;
	hideEmptyState?: boolean;
	// Phase 2 additions
	groupBy?: (item: Option) => string;
	debounceWait?: number;
	loading?: boolean;
	// Snippets
	option?: Snippet<[{ item: Option, selected: boolean, active: boolean }]>;
	empty?: Snippet;
}

let {
	value = $bindable(),
	options = [],
	placeholder = 'Select...',
	disabled = false,
	allowCustom = false,
	class: className = '',
	onchange,
	label,
	error,
	// Phase 1
	clearable = false,
	hideEmptyState = false,
	// Phase 2
	groupBy,
	debounceWait = 0,
	loading = false,
	// Snippets
	option: optionSnippet,
	empty: emptySnippet
}: Props = $props();

let searchTerm = $state('');
let debouncedSearchTerm = $state('');
let isOpen = $state(false);
let activeIndex = $state(-1);
let listElement = $state<HTMLElement>();
let inputElement = $state<HTMLInputElement>();
let debounceTimer = $state<ReturnType<typeof setTimeout>>();

// Debounce search term
$effect(() => {
	if (debounceWait <= 0) {
		debouncedSearchTerm = searchTerm;
		return;
	}
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		debouncedSearchTerm = searchTerm;
	}, debounceWait);
	return () => {
		if (debounceTimer) clearTimeout(debounceTimer);
	};
});

// Effective search term for filtering
const effectiveSearch = $derived(
	debounceWait > 0 ? debouncedSearchTerm : searchTerm
);

// Fuzzy search logic with deduplication
const filteredOptions = $derived.by(() => {
	const uniqueMap = new Map();
	const baseOptions = options.filter(opt => {
		if (opt.value !== undefined && !uniqueMap.has(opt.value)) {
			uniqueMap.set(opt.value, true);
			return true;
		}
		return false;
	});

	if (!effectiveSearch.trim()) return baseOptions;
	const term = effectiveSearch.toLowerCase();
	return baseOptions
		.map(opt => {
			const label = opt.label.toLowerCase();
			let score = 0;
			if (label === term) score = 100;
			else if (label.startsWith(term)) score = 50;
			else if (label.includes(term)) score = 25;
			return { ...opt, score };
		})
		.filter(opt => opt.score > 0)
		.sort((a, b) => b.score - a.score);
});

// Grouped options when groupBy is provided
const groupedOptions = $derived.by(() => {
	if (!groupBy) return null;
	const groups = new Map<string, Option[]>();
	for (const opt of filteredOptions) {
		const key = groupBy(opt);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(opt);
	}
	return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
});

// Flatten grouped options for keyboard navigation indexing
const flatFilteredOptions = $derived.by(() => {
	if (!groupedOptions || !groupBy) return filteredOptions;
	const flat: Option[] = [];
	for (const group of groupedOptions) {
		flat.push(...group.items);
	}
	return flat;
});

$effect(() => {
	if (isOpen) {
		activeIndex = -1;
		inputElement?.focus();
	}
});

function selectOption(opt: Option) {
	if (opt.disabled) return;
	value = opt.value;
	searchTerm = opt.label;
	debouncedSearchTerm = opt.label;
	isOpen = false;
	onchange?.(value);
}

function handleClear() {
	value = undefined;
	searchTerm = '';
	debouncedSearchTerm = '';
	onchange?.(undefined);
	inputElement?.focus();
}

function handleKeydown(e: KeyboardEvent) {
	if (disabled) return;

	const optionsList = flatFilteredOptions;

	if (e.key === 'ArrowDown') {
		e.preventDefault();
		isOpen = true;
		activeIndex = optionsList.length > 0
			? (activeIndex + 1) % optionsList.length
			: -1;
	} else if (e.key === 'ArrowUp') {
		e.preventDefault();
		isOpen = true;
		activeIndex = optionsList.length > 0
			? (activeIndex - 1 + optionsList.length) % optionsList.length
			: -1;
	} else if (e.key === 'Enter') {
		e.preventDefault();
		if (isOpen && activeIndex >= 0 && activeIndex < optionsList.length) {
			selectOption(optionsList[activeIndex]);
		} else if (allowCustom && searchTerm) {
			value = searchTerm;
			isOpen = false;
			onchange?.(value);
		}
	} else if (e.key === 'Escape') {
		isOpen = false;
	}
}

function toggleDropdown() {
	if (disabled) return;
	isOpen = !isOpen;
}

function handleClickOutside(e: MouseEvent) {
	if (isOpen && inputElement && !inputElement.contains(e.target as Node) && listElement && !listElement.contains(e.target as Node)) {
		isOpen = false;
	}
}

onMount(() => {
	document.addEventListener('mousedown', handleClickOutside);
	return () => document.removeEventListener('mousedown', handleClickOutside);
});

// Sync input search term with value label
$effect(() => {
	if (value !== undefined) {
		const matched = options.find(o => o.value === value);
		if (matched) {
			searchTerm = matched.label;
			debouncedSearchTerm = matched.label;
		} else if (allowCustom) {
			searchTerm = String(value);
			debouncedSearchTerm = String(value);
		}
	}
});

const id = globalThis.crypto?.randomUUID?.() ?? `combo-${Math.random().toString(36).slice(2, 9)}`;
</script>

<div class={cn('relative w-full space-y-1.5', className)}>
	{#if label}
		<label for={id} class="block text-sm font-bold text-surface-700 dark:text-surface-300 ml-1">
			{label}
		</label>
	{/if}

	<div class="group relative">
		<input
			bind:this={inputElement}
			{id}
			type="text"
			bind:value={searchTerm}
			{placeholder}
			{disabled}
			class={cn(
				"input w-full transition-all duration-200 rounded-xl",
				"focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
				isOpen && "rounded-b-none",
				error && "border-error-500 ring-error-500/20 focus:border-error-500 focus:ring-error-500/20",
				disabled && "opacity-50 cursor-not-allowed",
				clearable && value !== undefined && !disabled ? "pr-20" : "pr-10"
			)}
			onfocus={() => (isOpen = true)}
			onkeydown={handleKeydown}
			oninput={() => (isOpen = true)}
			role="combobox"
			aria-expanded={isOpen}
			aria-autocomplete="list"
			aria-controls={`${id}-listbox`}
			aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
		/>

		<!-- Clear button -->
		{#if clearable && value !== undefined && !disabled}
			<button
				type="button"
				class="absolute right-9 top-1/2 -translate-y-1/2 p-1 opacity-50 hover:opacity-100 transition-opacity"
				onclick={handleClear}
				aria-label="Clear selection"
			>
				<iconify-icon icon="mdi:close-circle" width="18"></iconify-icon>
			</button>
		{/if}

		<!-- Chevron / loading -->
		<button
			type="button"
			class="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-50 hover:opacity-100 transition-opacity"
			onclick={toggleDropdown}
			{disabled}
			aria-label={isOpen ? "Close selection" : "Open selection"}
			aria-expanded={isOpen}
		>
			{#if loading}
				<iconify-icon
					icon="mdi:loading"
					width="20"
					class="animate-spin"
				></iconify-icon>
			{:else}
				<iconify-icon
					icon="mdi:chevron-down"
					width="20"
					class={cn("transition-transform duration-200", isOpen && "rotate-180")}
				></iconify-icon>
			{/if}
		</button>
	</div>

	{#if error}
		<p class="text-xs text-error-500 ml-1 font-medium">{error}</p>
	{/if}

	{#if isOpen && !disabled}
		<div
			bind:this={listElement}
			id={`${id}-listbox`}
			role="listbox"
			class="absolute z-50 w-full mt-0 border border-t-0 rounded-b-xl shadow-2xl bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700 max-h-60 overflow-y-auto"
			transition:slide={{ duration: 150 }}
		>
			<!-- Loading state -->
			{#if loading && filteredOptions.length === 0}
				<div class="flex items-center justify-center px-4 py-6 text-surface-400">
					<iconify-icon icon="mdi:loading" width="24" class="animate-spin mr-2"></iconify-icon>
					<span class="text-sm">Loading...</span>
				</div>

			<!-- Grouped options -->
			{:else if groupedOptions && groupBy}
				{#each groupedOptions as group}
					<div
						class="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-surface-400 dark:text-surface-500 bg-surface-50 dark:bg-surface-900/50 border-b border-surface-100 dark:border-surface-800"
						role="presentation"
					>
						{group.name}
					</div>
					{#each group.items as opt}
						{@const flatIndex = flatFilteredOptions.indexOf(opt)}
						{@const active = flatIndex === activeIndex}
						{@const selected = opt.value === value}

						<button
							type="button"
							id={`${id}-option-${flatIndex}`}
							role="option"
							aria-selected={selected}
							class={cn(
								"w-full text-left px-4 py-2 flex items-center gap-3 transition-colors",
								active ? "bg-primary-500/10" : "hover:bg-surface-100 dark:hover:bg-surface-700/50",
								selected && "text-primary-500 font-bold",
								opt.disabled && "opacity-50 cursor-not-allowed"
							)}
							onclick={() => selectOption(opt)}
							disabled={opt.disabled}
						>
							{#if optionSnippet}
								{@render optionSnippet({ item: opt, selected, active })}
							{:else}
								{#if opt.icon}
									<iconify-icon icon={opt.icon} width="18"></iconify-icon>
								{/if}
								<span class="flex-1 truncate">{opt.label}</span>
								{#if selected}
									<iconify-icon icon="mdi:check" width="18"></iconify-icon>
								{/if}
							{/if}
						</button>
					{/each}
				{/each}

			<!-- Flat options -->
			{:else if filteredOptions.length > 0}
				{#each filteredOptions as opt, i (opt.value)}
					{@const active = i === activeIndex}
					{@const selected = opt.value === value}

					<button
						type="button"
						id={`${id}-option-${i}`}
						role="option"
						aria-selected={selected}
						class={cn(
							"w-full text-left px-4 py-2 flex items-center gap-3 transition-colors",
							active ? "bg-primary-500/10" : "hover:bg-surface-100 dark:hover:bg-surface-700/50",
							selected && "text-primary-500 font-bold",
							opt.disabled && "opacity-50 cursor-not-allowed"
						)}
						onclick={() => selectOption(opt)}
						disabled={opt.disabled}
					>
						{#if optionSnippet}
							{@render optionSnippet({ item: opt, selected, active })}
						{:else}
							{#if opt.icon}
								<iconify-icon icon={opt.icon} width="18"></iconify-icon>
							{/if}
							<span class="flex-1 truncate">{opt.label}</span>
							{#if selected}
								<iconify-icon icon="mdi:check" width="18"></iconify-icon>
							{/if}
						{/if}
					</button>
				{/each}

			<!-- Empty state -->
			{:else if !hideEmptyState}
				{#if emptySnippet}
					{@render emptySnippet()}
				{:else}
					<div class="px-4 py-3 text-sm text-surface-500 italic text-center">
						No results found
					</div>
				{/if}

			<!-- Loading with existing results -->
			{#if loading && filteredOptions.length > 0}
				<div class="border-t border-surface-100 dark:border-surface-700 px-4 py-2 flex items-center justify-center text-surface-400">
					<iconify-icon icon="mdi:loading" width="16" class="animate-spin"></iconify-icon>
				</div>
			{/if}
			{/if}
		</div>
	{/if}
</div>
