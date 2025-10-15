<script lang="ts">
	import { getFieldName } from '@src/utils/utils';
	import { validationStore } from '@stores/store.svelte';
	import type { DateRangeWidgetData, FieldType } from './';

	let { field, value, error }: { field: FieldType; value: DateRangeWidgetData | null | undefined; error?: string | null } = $props();

	const fieldName = getFieldName(field);

	// Use local state for each input field.
	let startInput = $state('');
	let endInput = $state('');

	// Track touch state for better UX
	let startTouched = $state(false);
	let endTouched = $state(false);

	// Effect 1: When the parent `value` prop changes, update our local inputs.
	$effect(() => {
		startInput = value?.start?.substring(0, 10) ?? '';
		endInput = value?.end?.substring(0, 10) ?? '';
	});

	// Effect 2: When local inputs change, update the parent `value` prop with validation.
	$effect(() => {
		const start = startInput ? new Date(startInput).toISOString() : null;
		const end = endInput ? new Date(endInput).toISOString() : null;

		// Only update if the values are valid and different from the current prop value.
		if (start !== value?.start || end !== value?.end) {
			// Validate date range logic
			if (start && end) {
				const startDate = new Date(start);
				const endDate = new Date(end);

				if (startDate > endDate) {
					validationStore.setError(fieldName, 'Start date must be before or equal to end date');
					return;
				}
			}

			// Clear validation errors if dates are valid
			validationStore.clearError(fieldName);

			// Only set value if we have valid data or if clearing the value
			if ((start && end) || (!start && !end)) {
				value = start && end ? { start, end } : null;
			}
		}
	});

	// Handle input changes with validation
	function handleStartInput() {
		startTouched = true;
		validateRange();
	}

	function handleEndInput() {
		endTouched = true;
		validateRange();
	}

	// Validate the date range
	function validateRange() {
		if (!startInput || !endInput) {
			if (field.required && (!startInput || !endInput)) {
				validationStore.setError(fieldName, 'Both start and end dates are required');
			} else {
				validationStore.clearError(fieldName);
			}
			return;
		}

		try {
			const startDate = new Date(startInput);
			const endDate = new Date(endInput);

			if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
				validationStore.setError(fieldName, 'Invalid date format');
				return;
			}

			if (startDate > endDate) {
				validationStore.setError(fieldName, 'Start date must be before or equal to end date');
			} else {
				validationStore.clearError(fieldName);
			}
		} catch (e) {
			validationStore.setError(fieldName, 'Invalid date format');
		}
	}

	// Handle blur events for final validation
	function handleStartBlur() {
		startTouched = true;
		if (field.required && !startInput) {
			validationStore.setError(fieldName, 'Start date is required');
		}
	}

	function handleEndBlur() {
		endTouched = true;
		if (field.required && !endInput) {
			validationStore.setError(fieldName, 'End date is required');
		}
	}

	// Quick date presets
	function setToday() {
		const today = new Date().toISOString().substring(0, 10);
		startInput = today;
		endInput = today;
		startTouched = true;
		endTouched = true;
	}

	function setThisWeek() {
		const today = new Date();
		const startOfWeek = new Date(today);
		startOfWeek.setDate(today.getDate() - today.getDay());
		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setDate(startOfWeek.getDate() + 6);

		startInput = startOfWeek.toISOString().substring(0, 10);
		endInput = endOfWeek.toISOString().substring(0, 10);
		startTouched = true;
		endTouched = true;
	}

	function setThisMonth() {
		const today = new Date();
		const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
		const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

		startInput = startOfMonth.toISOString().substring(0, 10);
		endInput = endOfMonth.toISOString().substring(0, 10);
		startTouched = true;
		endTouched = true;
	}
</script>

<div class="input-container">
	<!-- Date Range Inputs -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3">
		<div class="flex-1">
			<label for="{field.db_fieldName}-start" class="label">
				Start Date
				{#if field.required}
					<span class="ml-1 text-red-500">*</span>
				{/if}
			</label>
			<input
				type="date"
				id="{field.db_fieldName}-start"
				name="{field.db_fieldName}-start"
				bind:value={startInput}
				oninput={handleStartInput}
				onblur={handleStartBlur}
				required={field.required}
				class="input"
				class:invalid={error}
				class:touched={startTouched}
				aria-label="Start date"
				aria-invalid={!!error}
				aria-describedby={error ? `${field.db_fieldName}-error` : field.helper ? `${field.db_fieldName}-helper` : undefined}
				aria-required={field.required}
				data-testid="date-range-start"
			/>
		</div>

		<div class="flex items-center justify-center">
			<span class="select-none text-lg font-medium text-gray-400" aria-hidden="true">→</span>
		</div>

		<div class="flex-1">
			<label for="{field.db_fieldName}-end" class="label">
				End Date
				{#if field.required}
					<span class="ml-1 text-red-500">*</span>
				{/if}
			</label>
			<input
				type="date"
				id="{field.db_fieldName}-end"
				name="{field.db_fieldName}-end"
				bind:value={endInput}
				oninput={handleEndInput}
				onblur={handleEndBlur}
				required={field.required}
				class="input"
				class:invalid={error}
				class:touched={endTouched}
				aria-label="End date"
				aria-invalid={!!error}
				aria-describedby={error ? `${field.db_fieldName}-error` : field.helper ? `${field.db_fieldName}-helper` : undefined}
				aria-required={field.required}
				data-testid="date-range-end"
			/>
		</div>
	</div>

	<!-- Quick Presets -->
	<div class="mt-3 flex flex-wrap gap-2">
		<button type="button" onclick={setToday} class="preset-button" aria-label="Set date range to today"> Today </button>
		<button type="button" onclick={setThisWeek} class="preset-button" aria-label="Set date range to this week"> This Week </button>
		<button type="button" onclick={setThisMonth} class="preset-button" aria-label="Set date range to this month"> This Month </button>
	</div>

	<!-- Helper Text -->
	{#if field.helper}
		<div id={`${field.db_fieldName}-helper`} class="helper-text">
			{field.helper}
		</div>
	{/if}

	<!-- Error Message -->
	{#if error}
		<p id={`${field.db_fieldName}-error`} class="error-message" role="alert" aria-live="polite">
			{error}
		</p>
	{/if}
</div>

<style lang="postcss">
    @reference "tailwindcss";
    @reference "tailwindcss";
	.input-container {
		position: relative;
		padding-bottom: 1.5rem;
	}

	.label {
		@apply mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300;
	}

	.input {
		@apply w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm;
		@apply bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100;
		@apply focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500;
		@apply transition-all duration-200;
		@apply disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500;
	}

	.input:hover:not(:disabled):not(.invalid) {
		@apply border-gray-400;
	}

	.input.invalid {
		@apply border-red-500 focus:border-red-500 focus:ring-red-500;
	}

	.input.touched:not(.invalid) {
		@apply border-green-500 focus:border-green-500 focus:ring-green-500;
	}

	/* Hide the default date picker icon in webkit browsers */
	.input::-webkit-calendar-picker-indicator {
		@apply cursor-pointer opacity-60 hover:opacity-100;
	}

	/* Firefox date picker styling */
	.input::-moz-focus-inner {
		border: 0;
	}

	.preset-button {
		@apply px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400;
		@apply rounded-md bg-gray-100 dark:bg-gray-700;
		@apply border border-gray-300 dark:border-gray-600;
		@apply hover:bg-gray-200 dark:hover:bg-gray-600;
		@apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1;
		@apply transition-colors duration-150;
		@apply cursor-pointer select-none;
	}

	.preset-button:hover {
		@apply text-gray-800 dark:text-gray-200;
	}

	.helper-text {
		@apply mt-2 text-sm text-gray-600 dark:text-gray-400;
	}

	.error-message {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		text-align: center;
		font-size: 0.75rem;
		color: #ef4444;
		margin-top: 0.5rem;
	}

	/* Responsive design improvements */
	@media (max-width: 640px) {
		.input-container .flex {
			flex-direction: column;
			gap: 1rem;
		}

		.input-container .flex > div:not(:last-child) {
			margin-bottom: 0.5rem;
		}
	}
</style>
