<!-- 
 @src/routes/api/cms.ts src/components/ui/tags.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Tags Primitive
-->

<script lang="ts">
import { cn } from '@utils/cn';
import Badge from './badge.svelte';
import { fade, scale } from 'svelte/transition';

interface Props {
	tags?: string[];
	placeholder?: string;
	allowDuplicates?: boolean;
	validation?: (tag: string) => boolean;
	onchange?: (tags: string[]) => void;
	maxTags?: number;
	disabled?: boolean;
	variant?: 'filled' | 'tonal' | 'outlined' | 'glass';
	color?: 'primary' | 'secondary' | 'tertiary' | 'surface' | 'success' | 'warning' | 'error';
	class?: string;
	label?: string;
}

let {
	tags = $bindable([]),
	placeholder = 'Add tag...',
	allowDuplicates = false,
	validation,
	onchange,
	maxTags,
	disabled = false,
	variant = 'tonal',
	color = 'surface',
	class: className = '',
	label
}: Props = $props();

let inputValue = $state('');
let inputElement = $state<HTMLInputElement>();
const id = Math.random().toString(36).substring(7);

function addTag(tag: string) {
	if (disabled || !tag.trim()) return;
	if (maxTags && tags.length >= maxTags) return;
	
	const trimmed = tag.trim();
	if (!allowDuplicates && tags.includes(trimmed)) {
		inputValue = '';
		return;
	}
	
	if (validation && !validation(trimmed)) return;

	tags = [...tags, trimmed];
	inputValue = '';
	onchange?.(tags);
}

function removeTag(index: number) {
	if (disabled) return;
	tags = tags.filter((_, i) => i !== index);
	onchange?.(tags);
}

function handleKeydown(e: KeyboardEvent) {
	if (disabled) return;
	
	if (e.key === 'Enter' || e.key === ',') {
		e.preventDefault();
		addTag(inputValue);
	} else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
		removeTag(tags.length - 1);
	}
}
</script>

<div class="flex flex-col gap-1.5 w-full">
	{#if label}
		<label for={id} class="block text-sm font-bold text-surface-700 dark:text-surface-300 ml-1">
			{label}
		</label>
	{/if}

	<div
		class={cn(
			'flex flex-wrap items-center gap-2 p-2 border rounded-xl transition-all duration-200 focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500/50',
			'bg-surface-50 dark:bg-surface-900 border-surface-200 dark:border-surface-700 font-sans',
			disabled && 'opacity-50 cursor-not-allowed grayscale',
			className
		)}
		onclick={() => inputElement?.focus()}
		role="presentation"
	>
		{#each tags as tag, i (tag + i)}
			<div in:scale={{ duration: 150 }} out:fade={{ duration: 100 }}>
				<Badge
					preset={variant as any}
					color={color}
					class="flex items-center gap-1.5 pl-2 pr-1 py-0.5 group"
				>
					<span>{tag}</span>
					{#if !disabled}
						<button
							type="button"
							class="btn-icon btn-icon-sm hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors"
							onclick={(e) => { e.stopPropagation(); removeTag(i); }}
							aria-label={`Remove ${tag}`}
						>
							<iconify-icon icon="mdi:close" width="14"></iconify-icon>
						</button>
					{/if}
				</Badge>
			</div>
		{/each}

		<input
			bind:this={inputElement}
			{id}
			type="text"
			bind:value={inputValue}
			{placeholder}
			{disabled}
			class="flex-1 bg-transparent border-none focus:ring-0 min-w-[120px] text-sm py-1"
			onkeydown={handleKeydown}
			onblur={() => inputValue.trim() && addTag(inputValue)}
		/>
	</div>
</div>
