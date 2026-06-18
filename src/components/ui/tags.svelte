<!--
@file src/components/ui/tags.svelte
@component
**SveltyCMS Tags Input — WCAG 3.0 Ready**

Multi-value tag input with Enter/comma to add, Backspace to remove, duplicate
detection, max tag limit, and configurable Badge preset/color.

### Props
- `tags` (string[]): Bindable array of tag values.
- `placeholder` (string): Input placeholder (default: 'Add tag...').
- `allowDuplicates` (boolean): Allow duplicate tags.
- `validation` (function): Custom tag validation callback.
- `maxTags` (number): Maximum number of tags allowed.
- `variant` ('filled' | 'tonal' | 'outlined' | 'glass'): Tag Badge preset.
- `color` ('primary' | 'secondary' | ...): Tag Badge color.
- `label` (string): Label text above the input.
- `onchange` (function): Callback with updated tags array.

### Features:
- Enter or comma to add, Backspace on empty to remove last
- scale-in/fade-out transitions on tag add/remove
- individual tag removal buttons with aria-label
- full Svelte 5 runes: $props, $bindable, $derived, $state
-->

<script lang="ts">
import { cn } from '@utils/cn';
import { generateId } from '@utils/id-generator';
import Badge from './badge.svelte';
import { fade, scale } from 'svelte/transition';
	import Button from '@components/ui/button.svelte';

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
const id = generateId('tags');

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
		<label for={id} class="block text-sm font-bold text-surface-700 dark:text-surface-300 ms-1">
			{label}
		</label>
	{/if}

	<div
		class={cn(
			'flex flex-wrap items-center gap-2 p-2 border rounded transition-all duration-200 focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-tertiary-500 dark:border-primary-500/50',
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
					class="flex items-center gap-1.5 ps-2 pe-1 py-0.5 group"
				>
					<span>{tag}</span>
					{#if !disabled}
						<Button variant="ghost"
							type="button"
							onclick={(e: MouseEvent) => { e.stopPropagation(); removeTag(i); }}
							aria-label={`Remove ${tag}`}
						 class="p-0! min-w-0 hover:bg-black/10 dark:hover:bg-white/10 rounded-full">
							<iconify-icon icon="mdi:close" width="14"></iconify-icon>
						</Button>
					{/if}
				</Badge>
			</div>
		{/each}

		<input aria-label="Input"
			bind:this={inputElement}
			{id}
			type="text"
			bind:value={inputValue}
			{placeholder}
			{disabled}
			class="flex-1 bg-transparent border-none focus:ring-0 min-w-30 text-sm py-1"
			onkeydown={handleKeydown}
			onblur={() => inputValue.trim() && addTag(inputValue)}
		/>
	</div>
</div>
