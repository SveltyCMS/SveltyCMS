<!-- 
 @src/routes/api/cms.ts src/components/ui/dropdown.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Dropdown Primitive
-->

<script lang="ts">
import { cn } from '@utils/cn';
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
	class: className = '',
	position = 'bottom',
	trigger: triggerSnippet,
	children,
	option: optionSnippet
}: Props = $props();

let isOpen = $state(false);

function handleSelect(opt: Option) {
	if (opt.disabled) return;
	value = opt.value;
	onchange?.(opt.value);
	if (closeOnSelect) isOpen = false;
}
</script>

<Popover bind:open={isOpen} {position} class={cn("w-56 p-2", className)}>
	{#snippet trigger()}
		{#if triggerSnippet}
			{@render triggerSnippet()}
		{/if}
	{/snippet}

	<div class="flex flex-col gap-1">
		{#if children}
			{@render children()}
		{:else}
			{#each options as opt (opt.value)}
				{@const selected = value === opt.value}
				<button
					type="button"
					class={cn(
						"w-full text-left px-3 py-2 flex items-center gap-3 rounded-lg transition-colors",
						selected ? "bg-primary-500/10 text-primary-500 font-bold" : "hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-700 dark:text-surface-300",
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
</Popover>
