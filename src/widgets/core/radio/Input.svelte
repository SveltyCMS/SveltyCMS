<!--
@file src/widgets/core/radio/Input.svelte
@component
**Radio Widget Input Component**

Provides single-choice selection interface using semantic HTML radio button groups.
Part of the Three Pillars Architecture for enterprise-ready widget system.

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

	let { field, value = $bindable(), error }: { field: FieldType & RadioProps; value?: string | number | null | undefined; error?: string | null } = $props();
</script>

<div class="radio-container" class:invalid={error}>
	<fieldset>
		<legend class="legend"
			>{field.label}{#if field.required}*{/if}</legend
		>

		<div class="options-wrapper">
			{#each (field.options || []) as option (option.value)}
				<label class="option">
					<input type="radio" name={field.db_fieldName} bind:group={value} value={option.value} />
					<span>{option.label}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>

<style lang="postcss">
	.radio-container.invalid .legend {
		color: #ef4444;
	}
	.legend {
		@apply mb-2 text-sm font-medium text-gray-800;
	}
	.options-wrapper {
		@apply flex flex-wrap gap-x-6 gap-y-2;
	}
	.option {
		@apply flex cursor-pointer items-center gap-2 text-sm;
	}
	.error-message {
		@apply mt-2 text-center text-xs text-error-500;
	}
</style>
