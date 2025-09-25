<!--
@file src/widgets/core/date/Input.svelte
@component
**Date Widget Input Component**

Provides native HTML date input with automatic ISO 8601 normalization.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<DateInput bind:value={dateValue} field={fieldDefinition} />
User selects date → automatically converts to ISO 8601 UTC format 

### Props
- `field: FieldType` - Widget field definition with metadata
- `value: string | null | undefined` - ISO 8601 date string (bindable)

### Features
- **Native Date Picker**: Uses browser's built-in date input for optimal UX
- **ISO 8601 Normalization**: Converts user input to standardized UTC format
- **Timezone Consistency**: Ensures data consistency across different user timezones
- **Svelte 5 Runes**: Modern reactive patterns with `$derived.by()` and `$props()`
- **Automatic Validation**: HTML5 date validation with required field support
-->

<script lang="ts">
	import type { FieldType } from './';

	// Accept `error` as a prop from the parent (string or null/undefined)
	let { field, value, error }: { field: FieldType; value: string | null | undefined; error?: string | null | undefined } = $props();

	// The native date input requires 'YYYY-MM-DD' format.
	// We derive this from our stored ISO string value.
	const inputValue = $derived.by(() => {
		if (!value) return '';
		// Safely extract just the date part from the ISO string
		return value.substring(0, 10);
	});

	// This function handles changes from the input and updates the parent `value`
	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		const dateStr = event.currentTarget.value;
		if (dateStr) {
			// Convert the 'YYYY-MM-DD' back to a full ISO string at UTC midnight.
			// This ensures data consistency regardless of user timezone.
			value = new Date(dateStr).toISOString();
		} else {
			value = null; // Clear the value if the input is empty
		}
	}
</script>

<div class="input-container">
	<input
		type="date"
		id={field.db_fieldName}
		name={field.db_fieldName}
		required={field.required}
		value={inputValue}
		oninput={handleInput}
		class="input"
		class:invalid={error}
		aria-invalid={!!error}
		aria-describedby={error ? `${field.db_fieldName}-error` : undefined}
	/>

	{#if error}
		<p id={`${field.db_fieldName}-error`} class="error-message" role="alert">
			{error}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		position: relative;
		padding-bottom: 1.5rem; /* Make space for the error message */
	}
	.input.invalid {
		border-color: #ef4444; /* Example error color */
	}
	.error-message {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		text-align: center;
		font-size: 0.75rem;
		color: #ef4444; /* Example error color */
	}
</style>
