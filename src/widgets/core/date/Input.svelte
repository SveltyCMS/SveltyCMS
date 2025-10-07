<!--
@file src/widgets/core/date/Input.svelte
@component
**Date Widget Input Component**

Provides native HTML date input with automatic ISO 8601 normalization.
Part of the Three Pillars Architecture for widget system.

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
	import { getFieldName } from '@src/utils/utils';
	import { validationStore } from '@stores/store.svelte';
	import type { FieldType } from './';

	// Accept `error` as a prop from the parent (string or null/undefined)
	let { field, value, error }: { field: FieldType; value: string | null | undefined; error?: string | null | undefined } = $props();

	const fieldName = getFieldName(field);

	// The native date input requires 'YYYY-MM-DD' format.
	// We derive this from our stored ISO string value.
	const inputValue = $derived.by(() => {
		if (!value) return '';
		try {
			// Safely extract just the date part from the ISO string
			return value.substring(0, 10);
		} catch {
			return '';
		}
	});

	// Calculate min/max dates for constraints
	const minDate = $derived.by(() => {
		if (!field.minDate) return undefined;
		try {
			return new Date(field.minDate as string | Date).toISOString().substring(0, 10);
		} catch {
			return undefined;
		}
	});

	const maxDate = $derived.by(() => {
		if (!field.maxDate) return undefined;
		try {
			return new Date(field.maxDate as string | Date).toISOString().substring(0, 10);
		} catch {
			return undefined;
		}
	});

	// This function handles changes from the input and updates the parent `value`
	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		const dateStr = event.currentTarget.value;
		if (dateStr) {
			try {
				// Validate date constraints
				const selectedDate = new Date(dateStr);

				if (field.minDate && selectedDate < new Date(field.minDate as string | Date)) {
					validationStore.setError(fieldName, `Date must be on or after ${new Date(field.minDate as string | Date).toLocaleDateString()}`);
					return;
				}

				if (field.maxDate && selectedDate > new Date(field.maxDate as string | Date)) {
					validationStore.setError(fieldName, `Date must be on or before ${new Date(field.maxDate as string | Date).toLocaleDateString()}`);
					return;
				}

				// Convert the 'YYYY-MM-DD' back to a full ISO string at UTC midnight.
				// This ensures data consistency regardless of user timezone.
				value = selectedDate.toISOString();
				validationStore.clearError(fieldName);
			} catch (e) {
				validationStore.setError(fieldName, 'Invalid date format');
			}
		} else {
			value = null; // Clear the value if the input is empty
			if (field.required) {
				validationStore.setError(fieldName, 'This field is required');
			} else {
				validationStore.clearError(fieldName);
			}
		}
	}

	// Handle blur for final validation
	function handleBlur() {
		if (!value && field.required) {
			validationStore.setError(fieldName, 'This field is required');
		}
	}
</script>

<div class="input-container">
	<label for={field.db_fieldName} class="sr-only">
		{field.label}
		{#if field.required}
			<span class="sr-only">(required)</span>
		{/if}
	</label>

	<input
		type="date"
		id={field.db_fieldName}
		name={field.db_fieldName}
		required={field.required}
		value={inputValue}
		min={minDate}
		max={maxDate}
		oninput={handleInput}
		onblur={handleBlur}
		class="input"
		class:invalid={error}
		aria-invalid={!!error}
		aria-describedby={error ? `${field.db_fieldName}-error` : field.helper ? `${field.db_fieldName}-helper` : undefined}
		aria-required={field.required}
		data-testid="date-input"
	/>

	{#if field.helper}
		<div id={`${field.db_fieldName}-helper`} class="helper-text">
			{field.helper}
		</div>
	{/if}

	{#if error}
		<p id={`${field.db_fieldName}-error`} class="error-message" role="alert" aria-live="polite">
			{error}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		position: relative;
		padding-bottom: 1.5rem; /* Make space for the error message */
	}

	.input {
		@apply w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm;
		@apply bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100;
		@apply focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500;
		@apply transition-colors duration-200;
		@apply disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500;
	}

	.input.invalid {
		@apply border-red-500 focus:border-red-500 focus:ring-red-500;
	}

	.input:hover:not(:disabled) {
		@apply border-gray-400;
	}

	/* Hide the default date picker icon in webkit browsers */
	.input::-webkit-calendar-picker-indicator {
		@apply cursor-pointer opacity-60 hover:opacity-100;
	}

	/* Firefox date picker styling */
	.input::-moz-focus-inner {
		border: 0;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.helper-text {
		@apply mt-1 text-sm text-gray-600 dark:text-gray-400;
	}

	.error-message {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		text-align: center;
		font-size: 0.75rem;
		color: #ef4444;
		margin-top: 0.25rem;
	}
</style>
