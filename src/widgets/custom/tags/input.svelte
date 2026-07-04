<!--
@file src/widgets/custom/tags/input.svelte
@component
**Interactive Chip-based Tags Input**
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@src/utils/utils';
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { parse } from 'valibot';
	import type { FieldType } from './index';
	import { createValidationSchema } from './index';
	import Badge from '@components/ui/badge.svelte';

	interface Props {
		field: FieldType;
		value: string[] | null | undefined;
	}

	let { field, value = $bindable([]) }: Props = $props();

	let inputValue = $state('');
	let isTouched = $state(false);

	const fieldName = $derived(getFieldName(field));
	const validationError = $derived(validationStore.getError(fieldName));
	const validationSchema = $derived(createValidationSchema(field as any));

	function validate() {
		handleWidgetValidation(() => parse(validationSchema as any, value), {
			fieldName,
			updateStore: true,
			isTouched
		});
	}

	function addTag(tag: string) {
		const trimmed = tag.trim();
		if (!trimmed) return;

		const currentTags = Array.isArray(value) ? [...value] : [];

		// Duplicate check
		if (!field.allowDuplicates && currentTags.some(t =>
			field.caseSensitive ? t === trimmed : t.toLowerCase() === trimmed.toLowerCase()
		)) {
			inputValue = '';
			return;
		}

		// Max tags check
		const max = Number(field.maxTags);
		if (!isNaN(max) && max > 0 && currentTags.length >= max) {
			return;
		}

		value = [...currentTags, trimmed];
		inputValue = '';
		isTouched = true;
		validate();
	}

	function removeTag(index: number) {
		if (!Array.isArray(value)) return;
		value = value.filter((_, i) => i !== index);
		isTouched = true;
		validate();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addTag(inputValue);
		} else if (e.key === 'Backspace' && !inputValue && value && value.length > 0) {
			removeTag(value.length - 1);
		}
	}
</script>

<div class="space-y-2">
	<div
		role="button"
		tabindex="0"
		class="flex min-h-10.5 w-full flex-wrap items-center gap-2 rounded border border-surface-300 bg-surface-50 p-2 transition-all focus-within:ring-2 focus-within:ring-primary-500 dark:border-surface-600 dark:bg-surface-900 {validationError ? 'border-error-500' : ''}"
		onclick={() => document.getElementById(`${fieldName}-input`)?.focus()}
		onkeydown={(e) => { if (e.key === 'Enter') document.getElementById(`${fieldName}-input`)?.focus(); }}
	>
		{#if Array.isArray(value)}
			{#each value as tag, i (i)}
				<Badge variant="primary" size="sm" class="flex items-center gap-1 ps-2! pe-1! py-1!">
					{tag}
					<Button variant="ghost"
						type="button"
						onclick={(e: MouseEvent) => { e.stopPropagation(); removeTag(i); }}
						aria-label={`Remove tag ${tag}`}
					 class="p-0! min-w-0 hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-error-500">
						<iconify-icon icon="mdi:close" width="12"></iconify-icon>
					</Button>
				</Badge>
			{/each}
		{/if}

		<input aria-label="Search tags"
			id={`${fieldName}-input`}
			type="text"
			bind:value={inputValue}
			onkeydown={handleKeyDown}
			onblur={() => { isTouched = true; validate(); }}
			placeholder={value && value.length > 0 ? '' : (String(field.placeholder || '') || 'Add tag...')}
			class="bg-transparent border-none focus:ring-0 flex-1 min-w-30 p-0"
		/>
	</div>

	{#if validationError}
		<p class="text-xs text-error-500 animate-fade-in" role="alert">{validationError}</p>
	{/if}

	{#if field.maxTags && Array.isArray(value)}
		<p class="text-[10px] text-surface-400 text-end">
			{value.length} / {field.maxTags} tags
		</p>
	{/if}
</div>

<style>
	.animate-fade-in {
		animation: fadeIn 0.2s ease-out;
	}
	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
