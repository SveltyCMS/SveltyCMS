<!--
@file src/widgets/core/Radio/Input.svelte
@component
**Radio Widget Input Component**

Provides single-choice selection interface using semantic HTML radio button groups.
Part of the Three Pillars Architecture for widget system.

@example
<RadioInput bind:value={selectedValue} field={fieldDefinition} />
Renders radio group with options from field.options array

### Props
- `field: FieldType` - Widget field definition with options array and validation
- `value: string | number | null | undefined` - Selected option value (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Semantic HTML**: Uses proper `<fieldset>` and `<legend>` for accessibility
- **Radio Button Groups**: Native HTML radio inputs with Svelte binding
- **Required Field Indicators**: Visual asterisk for mandatory fields
- **Flexible Options**: Supports string and numeric values from configuration
- **Error State Styling**: Visual error indication with accessible messaging
- **Responsive Layout**: Flexbox grid for optimal option arrangement
- **Tailwind Styling**: Modern design with utility-first CSS approach
- **Screen Reader Support**: Proper ARIA attributes and semantic markup
-->

<script lang="ts">
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app } from '@src/stores/store.svelte';

	import type { FieldType } from './';

	interface RadioProps {
		color?: string;
		legend?: string;
		options: Array<{ label: string; value: string | number }>;
	}

	let {
		field,
		value = $bindable(),
		error
	}: {
		field: FieldType & RadioProps;
		value?: string | number | null | undefined | Record<string, any>;
		error?: string | null;
	} = $props();

	const fieldId = $derived(field.db_fieldName);
	const _language = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Local state to bind the radio group to
	let localValue = $state<string | number | null>(null);

	// Sync localValue from parent value
	$effect(() => {
		const parentVal = value;
		let extracted: string | number | null = null;

		if (field.translated && typeof parentVal === 'object' && parentVal !== null) {
			extracted = (parentVal as Record<string, any>)[_language] ?? null;
		} else if (!field.translated && (typeof parentVal === 'string' || typeof parentVal === 'number')) {
			extracted = parentVal;
		}

		// Only update local if different to avoid loops (though primitives are safe-ish)
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
			value = { ...(value as object), [_language]: newVal };
		} else {
			value = newVal;
		}
	}
</script>

<div class="mb-4">
	<fieldset
		id={fieldId}
		class="rounded border border-surface-500 px-2 py-1 dark:border-surface-400"
		aria-describedby={error ? `${fieldId}-error` : undefined}
	>
		<!-- Legend -->
		<legend
			class="mx-auto block w-fit px-2 text-center text-sm font-normal text-surface-700 dark:text-surface-50"
			style="background:none;border:none;"
		>
			{field.legend || 'Select one option'}
		</legend>

		<!-- Radio options -->
		<div class="flex flex-col gap-y-2">
			{#each field.options || [] as option (option.value)}
				<label class="flex cursor-pointer items-center gap-2 text-base text-surface-800 dark:text-surface-50">
					<input
						type="radio"
						name={field.db_fieldName}
						group={localValue}
						value={option.value}
						onchange={() => updateParent(option.value)}
						aria-checked={localValue === option.value}
						aria-label={option.label}
						class={field.color ? `accent-${field.color}` : ''}
						style={field.color ? `accent-color: ${field.color}` : ''}
					/>
					<span>{option.label}</span>
				</label>
			{/each}
		</div>
	</fieldset>
	<!-- Error message -->
	{#if error}
		<p id={`${fieldId}-error`} class="mt-2 text-center text-xs text-error-500" role="alert">{error}</p>
	{/if}
</div>
