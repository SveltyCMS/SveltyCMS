<!--
@file src/components/ui/dropdown.svelte
@component
**SveltyCMS Dropdown Menu — WCAG 3.0 Ready**

Popover-based selection menu with configurable position, option highlighting,
check mark on selected item, optional search/filter for long lists, and
optional custom content via snippet.

### Props
- `value` (any): Bindable selected value.
- `options` (Option[]): Array of { label, value, icon?, disabled? }.
- `onchange` (function): Callback with selected value.
- `closeOnSelect` (boolean): Auto-close after selection (default: true).
- `searchable` (boolean): Show a search input to filter options (default: false).
- `position` (Placement): FloatingUI placement.
- `trigger` (Snippet): Trigger button/icon content.
- `children` (Snippet): Custom dropdown content (replaces options).
- `option` (Snippet): Custom option rendering.

### Features:
- wraps native Popover for floating position management
- selected item check mark and highlight
- optional search/filter for long option lists
- keyboard support via Popover
- full Svelte 5 runes: $props, $bindable, $derived, $state
-->

<script lang="ts">
import { cn } from '@utils/cn';
import Input from './input.svelte';
import Popover from './popover.svelte';
import type { Snippet } from 'svelte';

interface Option {
	label: string;
	value: any;
	icon?: string;
	disabled?: boolean;
}

interface Props {
	value?: any;
	options?: Option[];
	onchange?: (value: any) => void;
	closeOnSelect?: boolean;
	searchable?: boolean;
	searchPlaceholder?: string;
	emptyMessage?: string;
	showArrow?: boolean;
	class?: string;
	position?: 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'left-start' | 'left-end' | 'right' | 'right-start' | 'right-end';
	// Snippets
	trigger: Snippet;
	children?: Snippet; // Optional: custom content instead of options
	option?: Snippet<[{ item: Option, selected: boolean }]>;
}

let {
	value = $bindable(),
	options = [],
	onchange,
	closeOnSelect = true,
	searchable = false,
	searchPlaceholder = 'Search...',
	emptyMessage = 'No matches found',
	showArrow = false,
	class: className = '',
	position = 'bottom',
	trigger: triggerSnippet,
	children,
	option: optionSnippet
}: Props = $props();

let isOpen = $state(false);
let searchQuery = $state('');

const filteredOptions = $derived(
	searchable && searchQuery
		? options
				.filter((opt) => opt.label.toLowerCase().includes(searchQuery.toLowerCase()))
				.sort((a, b) => {
					const query = searchQuery.toLowerCase();
					const aLabel = a.label.toLowerCase();
					const bLabel = b.label.toLowerCase();

					// 1. Exact prefix match (e.g. "Af" → "Africa/...")
					const aStarts = aLabel.startsWith(query);
					const bStarts = bLabel.startsWith(query);
					if (aStarts && !bStarts) return -1;
					if (!aStarts && bStarts) return 1;

					// 2. Fragment match after slash (e.g. "Ber" → "Europe/Berlin")
					const aSlashStarts = aLabel.includes('/' + query);
					const bSlashStarts = bLabel.includes('/' + query);
					if (aSlashStarts && !bSlashStarts) return -1;
					if (!aSlashStarts && bSlashStarts) return 1;

					// 3. Alphabetical fallback
					return a.label.localeCompare(b.label);
				})
		: options
);

function handleSelect(opt: Option) {
	if (opt.disabled) return;
	value = opt.value;
	onchange?.(opt.value);
	searchQuery = '';
	if (closeOnSelect) isOpen = false;
}
</script>

<Popover bind:open={isOpen} {position} arrow={showArrow} class={cn("w-64 p-2", className)}>
	{#snippet trigger()}
		{#if triggerSnippet}
			{@render triggerSnippet()}
		{/if}
	{/snippet}

	<div class="flex flex-col gap-1">
		{#if searchable}
			<Input
					type="text"
					bind:value={searchQuery}
					placeholder={searchPlaceholder}
					inputClass="text-xs py-1 h-8"
					class="shrink-0"
				/>
		{/if}
		{#if children}
			{@render children()}
		{:else}
			<div class="max-h-64 overflow-y-auto -mx-2 -mb-2 px-2 pb-2 {searchable ? '' : ''}">
				{#if filteredOptions.length === 0}
					<p class="px-3 py-2 text-center text-xs text-surface-400">{emptyMessage}</p>
				{:else}
					{#each filteredOptions as opt (opt.value)}
						{const selected = value === opt.value}
						<button
							type="button"
							class={cn(
								"w-full text-start px-3 py-2 flex items-center gap-3 rounded transition-colors",
								selected ? "bg-tertiary-500 text-tertiary-950 dark:bg-primary-500/10 dark:text-primary-500 font-bold" : "hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-700 dark:text-surface-300",
								opt.disabled && "opacity-50 cursor-not-allowed"
							)}
							onclick={() => handleSelect(opt)}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelect(opt)}
							disabled={opt.disabled}
						>
							{#if optionSnippet}
								{@render optionSnippet({ item: opt, selected })}
							{:else}
								{#if opt.icon}
									<iconify-icon icon={opt.icon} width="18"></iconify-icon>
								{/if}
								<span class="flex-1 truncate text-sm">{opt.label}</span>
								{#if selected}
									<iconify-icon icon="mdi:check" width="16"></iconify-icon>
								{/if}
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</Popover>
