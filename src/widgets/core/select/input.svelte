<!--
@file src/widgets/core/select/input.svelte
@component
**Select Widget Input Component**
-->

<script lang="ts">
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app } from '@src/stores/store.svelte';
	import type { SelectOption } from './types';

	interface Props {
		field: any;
		value: string | number | null | undefined | Record<string, any>;
		error?: string | null;
	}

	let { field, value = $bindable(), error }: Props = $props();

	const fieldId = $derived(field.db_fieldName);
	const LANGUAGE = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Local state to bind the select to
	let localValue = $state<string | number | null>(null);

	// Normalize options
	const normalizedOptions = $derived(
		(field.options || []).map((opt: string | SelectOption) => {
			if (typeof opt === 'string') {
				return { label: opt, value: opt };
			}
			return opt;
		})
	);

	// Sync localValue from parent value
	$effect(() => {
		const parentVal = value;
		let extracted: string | number | null = null;

		if (field.translated && typeof parentVal === 'object' && parentVal !== null) {
			extracted = (parentVal as Record<string, any>)[LANGUAGE] ?? null;
		} else if (!field.translated && (typeof parentVal === 'string' || typeof parentVal === 'number')) {
			extracted = parentVal;
		}

		if (extracted !== localValue) {
			localValue = extracted;
		}
	});

	// Update parent value when localValue changes
	function updateParent(newVal: string | number | null) {
		if (field.translated) {
			if (!value || typeof value !== 'object') {
				value = {};
			}
			value = { ...(value as object), [LANGUAGE]: newVal };
		} else {
			value = newVal;
		}
	}
</script>

<div class="mb-4 w-full">
	<label for={fieldId} class="label text-black dark:text-primary-500 mb-1">
		<span>{field.label}</span>
		{#if field.required}
			<span class="text-error-500">*</span>
		{/if}
	</label>

	<select
		id={fieldId}
		bind:value={localValue}
		onchange={() => updateParent(localValue)}
		class="select w-full rounded border border-surface-500 dark:border-surface-400 bg-white dark:bg-surface-900"
		aria-invalid={!!error}
		aria-describedby={error ? `${fieldId}-error` : undefined}
	>
		<option value={null} disabled selected={localValue === null}>
			{field.placeholder || 'Select an option...'}
		</option>
		{#each normalizedOptions as option}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>

	{#if error}
		<p id={`${fieldId}-error`} class="mt-1 text-xs text-error-500" role="alert">{error}</p>
	{/if}
</div>
