<!--
@file src/widgets/core/Date/Input.svelte
@component
**Date Widget Input Component**

Provides native HTML date input with automatic ISO 8601 normalization.
Part of the Three Pillars Architecture for widget system.

@example
<DateInput bind:value={dateValue} {field} />

#### Props
- `field: FieldType` - Widget field definition with metadata
- `value: string | null | undefined` - ISO 8601 date string (bindable)
- `error: string | null | undefined` - Validation error message

#### Features
- Native date picker for optimal UX
- ISO 8601 normalization
- Timezone consistency
- Min/max date constraints
- Automatic validation
- Required field support
- Helper text support
- Accessible with ARIA labels
-->

<script lang="ts">
	import { getFieldName } from '@src/utils/utils';
	import { validationStore } from '@stores/store.svelte';
	import type { FieldType } from './';
	import { tokenTarget } from '@src/services/token/tokenTarget';

	interface Props {
		field: FieldType;
		value: string | null | undefined;
		error?: string | null | undefined;
	}

	let { field, value = $bindable(), error }: Props = $props();

	const fieldName = $derived(getFieldName(field));

	// Convert ISO string to YYYY-MM-DD format for native input

	const inputValue = $derived.by(() => {
		if (!value) return '';
		try {
			return value.substring(0, 10);
		} catch {
			return '';
		}
	});

	// Calculate minimum date constraint

	const minDate = $derived.by(() => {
		if (!field.minDate) return undefined;
		try {
			return new Date(field.minDate as string | Date).toISOString().substring(0, 10);
		} catch {
			return undefined;
		}
	});

	// Calculate maximum date constraint
	const maxDate = $derived.by(() => {
		if (!field.maxDate) return undefined;
		try {
			return new Date(field.maxDate as string | Date).toISOString().substring(0, 10);
		} catch {
			return undefined;
		}
	});

	// Handle date input change
	function handleInput(event: Event & { currentTarget: HTMLInputElement }): void {
		const dateStr = event.currentTarget.value;

		if (dateStr) {
			try {
				const selectedDate = new Date(dateStr);

				// Validate min date constraint
				if (field.minDate && selectedDate < new Date(field.minDate as string | Date)) {
					validationStore.setError(fieldName, `Date must be on or after ${new Date(field.minDate as string | Date).toLocaleDateString()}`);
					return;
				}

				// Validate max date constraint
				if (field.maxDate && selectedDate > new Date(field.maxDate as string | Date)) {
					validationStore.setError(fieldName, `Date must be on or before ${new Date(field.maxDate as string | Date).toLocaleDateString()}`);
					return;
				}

				// Convert to ISO string at UTC midnight
				value = selectedDate.toISOString();
				validationStore.clearError(fieldName);
			} catch (e) {
				validationStore.setError(fieldName, 'Invalid date format');
			}
		} else {
			value = null;
			if (field.required) {
				validationStore.setError(fieldName, 'This field is required');
			} else {
				validationStore.clearError(fieldName);
			}
		}
	}

	// Handle blur for final validation
	function handleBlur(): void {
		if (!value && field.required) {
			validationStore.setError(fieldName, 'This field is required');
		}
	}
</script>

<div class="relative space-y-1">
	<!-- Screen Reader Only Label -->
	<label for={field.db_fieldName} class="sr-only">
		{field.label}
		{#if field.required}
			<span>(required)</span>
		{/if}
	</label>

	<!-- Date Input -->
	<div class="relative w-full">
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
			use:tokenTarget={{
				name: field.db_fieldName,
				label: field.label,
				collection: (field as any).collection
			}}
			class="input"
			class:invalid={error}
			aria-invalid={!!error}
			aria-describedby={error ? `${field.db_fieldName}-error` : field.helper ? `${field.db_fieldName}-helper` : undefined}
			aria-required={field.required}
			data-testid="date-input"
		/>
	</div>

	<!-- Helper Text -->
	{#if field.helper && !error}
		<p id={`${field.db_fieldName}-helper`} class="text-xs text-gray-600 dark:text-gray-400">
			{field.helper}
		</p>
	{/if}

	<!-- Error Message -->
	{#if error}
		<p id={`${field.db_fieldName}-error`} class="text-xs text-error-500" role="alert" aria-live="polite">
			{error}
		</p>
	{/if}
</div>

<style>
	/* Screen reader only utility */
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
</style>
