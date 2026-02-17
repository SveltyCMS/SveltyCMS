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
- Accessible with ARIA labels
-->

<script lang="ts">
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
	import { tokenTarget } from '@src/services/token/tokenTarget';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { app, validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@src/utils/utils';
	import type { FieldType } from './';

	interface Props {
		error?: string | null | undefined;
		field: FieldType;
		value: string | Record<string, string> | null | undefined;
	}

	let { field, value = $bindable(), error }: Props = $props();

	const fieldName = $derived(getFieldName(field));

	// Convert ISO string to YYYY-MM-DD format for native input

	const _language = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());
	const safeValue = $derived(field.translated ? ((value as Record<string, string>)?.[_language] ?? '') : ((value as string) ?? ''));

	const inputValue = $derived.by(() => {
		if (!safeValue) return '';
		try {
			return safeValue.substring(0, 10);
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
		let newValue: string | null = null;

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
				newValue = selectedDate.toISOString();
				validationStore.clearError(fieldName);
			} catch (_e) {
				validationStore.setError(fieldName, 'Invalid date format');
			}
		} else if (field.required) {
			validationStore.setError(fieldName, 'This field is required');
		} else {
			validationStore.clearError(fieldName);
		}

		// Update value based on translation status
		if (field.translated) {
			if (!value || typeof value !== 'object') {
				value = {};
			}
			value = { ...(value as any), [_language]: newValue };
		} else {
			value = newValue;
		}
	}

	// Handle blur for final validation
	function handleBlur(): void {
		if (!value && field.required) {
			validationStore.setError(fieldName, 'This field is required');
		}
	}
</script>

<div class="relative mb-4 min-h-10 w-full">
	<SystemTooltip title={error || ''} wFull={true}>
		<div class="flex w-full overflow-hidden rounded border border-surface-400 dark:border-surface-600" role="group">
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
				oninvalid={(e) => e.preventDefault()}
				use:tokenTarget={{
					name: field.db_fieldName,
					label: field.label,
					collection: (field as any).collection
				}}
				class="input w-full flex-1 rounded-none border-none bg-white font-medium text-black outline-none focus:ring-0 dark:bg-surface-900 dark:text-primary-500 {error
					? 'bg-error-500-10!'
					: ''}"
				aria-invalid={!!error}
				aria-describedby={error ? `${field.db_fieldName}-error` : field.helper ? `${field.db_fieldName}-helper` : undefined}
				aria-required={field.required}
				data-testid="date-input"
			>
		</div>
	</SystemTooltip>

	<!-- Screen Reader Only Label -->
	<label for={field.db_fieldName} class="sr-only">
		{field.label}
		{#if field.required}
			<span>(required)</span>
		{/if}
	</label>

	<!-- Error Message -->
	{#if error}
		<p id={`${field.db_fieldName}-error`} class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite">
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
		white-space: nowrap;
		border: 0;
		clip: rect(0, 0, 0, 0);
	}
</style>
