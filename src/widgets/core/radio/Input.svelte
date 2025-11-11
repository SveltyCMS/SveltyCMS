<!--
@file src/widgets/core/radio/Input.svelte
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
	import type { FieldType } from './';
	import type { RadioProps } from './types';

	let {
		field,
		value = $bindable(),
		error
	}: { field: FieldType & RadioProps; value?: string | number | null | undefined; error?: string | null } = $props();

	const fieldId = field.db_fieldName;
</script>

<div class="mb-4">
	<fieldset class="rounded border border-surface-500 p-2 dark:border-surface-400" aria-describedby={error ? `${fieldId}-error` : undefined}>
		<!-- Legend -->
		<legend
			class="mx-auto block w-fit px-2 text-center text-sm font-normal text-surface-700 dark:text-surface-300"
			style="background:none;border:none;"
		>
			{field.legend || 'Select one option'}
		</legend>

		<!-- Radio options -->
		<div class="flex flex-col gap-y-2">
			{#each field.options || [] as option (option.value)}
				<label class="flex cursor-pointer items-center gap-2 text-base text-surface-800 dark:text-surface-200">
					<input
						type="radio"
						name={field.db_fieldName}
						bind:group={value}
						value={option.value}
						aria-checked={value === option.value}
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
		<p id={`${fieldId}-error`} class="mt-2 text-center text-xs text-error-500" role="alert">
			{error}
		</p>
	{/if}
</div>
