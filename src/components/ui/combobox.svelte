<!-- 
 @src/routes/api/cms.ts src/components/ui/combobox.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Combobox Primitive
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
	// Snippets
	option?: Snippet<[{ item: Option, selected: boolean, active: boolean }]>;
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
	option: optionSnippet
}: Props = $props();

let searchTerm = $state('');
let isOpen = $state(false);
let activeIndex = $state(-1);
let listElement = $state<HTMLElement>();
let inputElement = $state<HTMLInputElement>();

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

	if (!searchTerm.trim()) return baseOptions;
	const term = searchTerm.toLowerCase();
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
	isOpen = false;
	onchange?.(value);
}

function handleKeydown(e: KeyboardEvent) {
	if (disabled) return;
	
	if (e.key === 'ArrowDown') {
		e.preventDefault();
		isOpen = true;
		activeIndex = (activeIndex + 1) % filteredOptions.length;
	} else if (e.key === 'ArrowUp') {
		e.preventDefault();
		isOpen = true;
		activeIndex = (activeIndex - 1 + filteredOptions.length) % filteredOptions.length;
	} else if (e.key === 'Enter') {
		e.preventDefault();
		if (isOpen && activeIndex >= 0) {
			selectOption(filteredOptions[activeIndex]);
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
		if (matched) searchTerm = matched.label;
		else if (allowCustom) searchTerm = String(value);
	}
});

const id = Math.random().toString(36).substring(7);
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
				"input w-full pr-10 transition-all duration-200 rounded-xl",
				"focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
				isOpen && "rounded-b-none",
				error && "border-error-500 ring-error-500/20 focus:border-error-500 focus:ring-error-500/20",
				disabled && "opacity-50 cursor-not-allowed"
			)}
			onfocus={() => (isOpen = true)}
			onkeydown={handleKeydown}
			oninput={() => (isOpen = true)}
		/>
		
		<button
			type="button"
			class="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-50 hover:opacity-100 transition-opacity"
			onclick={toggleDropdown}
			{disabled}
			aria-label={isOpen ? "Close selection" : "Open selection"}
			aria-expanded={isOpen}
		>
			<iconify-icon 
				icon="mdi:chevron-down" 
				width="20" 
				class={cn("transition-transform duration-200", isOpen && "rotate-180")}
			></iconify-icon>
		</button>
	</div>

	{#if error}
		<p class="text-xs text-error-500 ml-1 font-medium">{error}</p>
	{/if}

	{#if isOpen && !disabled}
		<div
			bind:this={listElement}
			class="absolute z-50 w-full mt-0 border border-t-0 rounded-b-xl shadow-2xl bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700 max-h-60 overflow-y-auto"
			transition:slide={{ duration: 150 }}
		>
			{#if filteredOptions.length > 0}
				{#each filteredOptions as opt, i (opt.value)}
					{@const active = i === activeIndex}
					{@const selected = opt.value === value}
					
					<button
						type="button"
						class={cn(
							"w-full text-left px-4 py-2 flex items-center gap-3 transition-colors",
							active ? "bg-primary-500/10" : "hover:bg-surface-100 dark:hover:bg-surface-700/50",
							selected && "text-primary-500 font-bold"
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
			{:else}
				<div class="px-4 py-3 text-sm text-surface-500 italic">
					No results found
				</div>
			{/if}
		</div>
	{/if}
</div>
