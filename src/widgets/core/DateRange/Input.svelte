<!--
@file src/widgets/core/DateRange/Input.svelte
@component
**DateRange Widget Input Component**

Provides an interface for selecting a date range (start and end) using native HTML date inputs.
Part of the Three Pillars Architecture for widget system.

@example
<DateRangeInput bind:value={rangeValue} {field} />

#### Props
- `field: FieldType` - Widget field definition with metadata
- `value: DateRangeWidgetData | null | undefined` - { start: string, end: string } (bindable)
- `error: string | null | undefined` - Validation error message

#### Features
- Dual native date pickers
- Automatic validation (Start <= End)
- ISO 8601 UTC normalization
- Required field support
- Accessible with ARIA labels
-->

<script lang="ts">
	import { validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@src/utils/utils';
	import type { FieldType } from './';

	let {
		field,
		value = $bindable(),
		error
	}: { field: FieldType; value: { start: string; end: string } | null | undefined | Record<string, any>; error?: string | null } = $props();

	const fieldName = $derived(getFieldName(field));
	// Handle input changes
	function handleInput(type: 'start' | 'end', e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const dateStr = input.value;

		if (!value) value = { start: '', end: '' };

		if (dateStr) {
			try {
				const date = new Date(dateStr);

				// Ensure value object exists before assignment
				if (!value) value = { start: '', end: '' };

				// Assign properties safely to the reactive value
				if (type === 'start') {
					(value as { start: string; end: string }).start = date.toISOString();
				} else {
					(value as { start: string; end: string }).end = date.toISOString();
				}

				// Validate range
				validateRange();
			} catch {
				// Invalid date, ignore
			}
		} else {
			if (!value) value = { start: '', end: '' };
			if (type === 'start') {
				(value as { start: string; end: string }).start = '';
			} else {
				(value as { start: string; end: string }).end = '';
			}
		}
	}

	function validateRange() {
		if (!(value?.start && value?.end)) return;
		const start = new Date(value.start);
		const end = new Date(value.end);

		if (start > end) {
			validationStore.setError(fieldName, 'End date must be after start date.');
		} else {
			validationStore.clearError(fieldName);
		}
	}

	// derived values for inputs (needs YYYY-MM-DD)
	const startDateInput = $derived(value?.start ? value.start.split('T')[0] : '');
	const endDateInput = $derived(value?.end ? value.end.split('T')[0] : '');
</script>

<div class="mb-4 w-full">
	<div class="flex gap-2">
		<!-- Start Date -->
		<div class="flex-1">
			<label for={`${field.db_fieldName}_start`} class="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1">Start</label>
			<div
				class="flex w-full overflow-hidden rounded border border-surface-400 dark:border-surface-600 focus-within:ring-1 focus-within:ring-primary-500"
			>
				<input
					type="date"
					id={`${field.db_fieldName}_start`}
					name={`${field.db_fieldName}_start`}
					value={startDateInput}
					oninput={(e) => handleInput('start', e)}
					required={field.required}
					class="input w-full flex-1 rounded-none border-none bg-white font-medium text-black outline-none focus:ring-0 dark:bg-surface-900 dark:text-primary-500"
					aria-label="Start Date"
				>
			</div>
		</div>

		<!-- End Date -->
		<div class="flex-1">
			<label for={`${field.db_fieldName}_end`} class="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1">End</label>
			<div
				class="flex w-full overflow-hidden rounded border border-surface-400 dark:border-surface-600 focus-within:ring-1 focus-within:ring-primary-500"
			>
				<input
					type="date"
					id={`${field.db_fieldName}_end`}
					name={`${field.db_fieldName}_end`}
					value={endDateInput}
					oninput={(e) => handleInput('end', e)}
					required={field.required}
					class="input w-full flex-1 rounded-none border-none bg-white font-medium text-black outline-none focus:ring-0 dark:bg-surface-900 dark:text-primary-500"
					aria-label="End Date"
				>
			</div>
		</div>
	</div>

	{#if error}
		<p class="mt-1 text-xs text-error-500" role="alert">{error}</p>
	{/if}
</div>
