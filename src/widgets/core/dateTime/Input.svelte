<script lang="ts">
	import { getFieldName } from '@src/utils/utils';
	import { validationStore } from '@stores/store.svelte';
	import type { DateTimeWidgetData, FieldType } from './';

	let { field, value, error }: { field: FieldType; value: DateTimeWidgetData | null | undefined; error?: string | null } = $props();

	const fieldName = getFieldName(field);

	// Track touch state for better UX
	let touched = $state(false);

	// Convert the stored UTC ISO string to the local 'YYYY-MM-DDTHH:mm' format required by the input.
	const inputValue = $derived.by(() => {
		if (!value) return '';
		try {
			// Create a date object from the UTC string.
			const date = new Date(value);
			// Get local timezone offset in minutes.
			const timezoneOffset = date.getTimezoneOffset();
			// Adjust the date by the offset to get the correct local time.
			const localDate = new Date(date.getTime() - timezoneOffset * 60 * 1000);
			// Return the local time as an ISO string, sliced to the minute.
			return localDate.toISOString().slice(0, 16);
		} catch {
			return '';
		}
	});

	// Debounced validation function
	let debounceTimeout: number | undefined;
	function validateInput() {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			if (field.required && !value) {
				validationStore.setError(fieldName, 'DateTime is required');
			} else if (value) {
				try {
					const date = new Date(value);
					if (isNaN(date.getTime())) {
						validationStore.setError(fieldName, 'Invalid date and time format');
					} else {
						validationStore.clearError(fieldName);
					}
				} catch {
					validationStore.setError(fieldName, 'Invalid date and time format');
				}
			} else {
				validationStore.clearError(fieldName);
			}
		}, 300);
	}

	// This function handles changes from the input and updates the parent `value`.
	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		touched = true;
		const localDateStr = event.currentTarget.value;
		if (localDateStr) {
			try {
				// Convert the local datetime string from the input directly to a UTC ISO string.
				const utcDate = new Date(localDateStr).toISOString();
				value = utcDate;
			} catch {
				value = null;
			}
		} else {
			// Clear the value if the input is empty.
			value = null;
		}
		validateInput();
	}

	// Handle blur events for final validation
	function handleBlur() {
		touched = true;
		validateInput();
	}

	// Quick datetime presets
	function setNow() {
		const now = new Date().toISOString();
		value = now;
		touched = true;
		validateInput();
	}

	function setTodayMorning() {
		const today = new Date();
		today.setHours(9, 0, 0, 0); // 9:00 AM
		value = today.toISOString();
		touched = true;
		validateInput();
	}

	function setTodayEvening() {
		const today = new Date();
		today.setHours(18, 0, 0, 0); // 6:00 PM
		value = today.toISOString();
		touched = true;
		validateInput();
	}

	function setTomorrowMorning() {
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		tomorrow.setHours(9, 0, 0, 0); // Tomorrow at 9:00 AM
		value = tomorrow.toISOString();
		touched = true;
		validateInput();
	}
</script>

<div class="input-container">
	<!-- DateTime Input -->
	<div class="flex flex-col gap-2">
		<input
			type="datetime-local"
			id={field.db_fieldName}
			name={field.db_fieldName}
			required={field.required}
			value={inputValue}
			oninput={handleInput}
			onblur={handleBlur}
			class="input"
			class:invalid={error}
			class:touched
			aria-label="Date and time"
			aria-invalid={!!error}
			aria-describedby={error ? `${field.db_fieldName}-error` : field.helper ? `${field.db_fieldName}-helper` : undefined}
			aria-required={field.required}
			data-testid="datetime-input"
		/>

		<!-- Quick Presets -->
		<div class="flex flex-wrap gap-2">
			<button type="button" onclick={setNow} class="preset-button" aria-label="Set to current date and time"> Now </button>
			<button type="button" onclick={setTodayMorning} class="preset-button" aria-label="Set to today at 9 AM"> Today 9 AM </button>
			<button type="button" onclick={setTodayEvening} class="preset-button" aria-label="Set to today at 6 PM"> Today 6 PM </button>
			<button type="button" onclick={setTomorrowMorning} class="preset-button" aria-label="Set to tomorrow at 9 AM"> Tomorrow 9 AM </button>
		</div>
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
	.input-container {
		position: relative;
		padding-bottom: 1.5rem;
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

	/* Hide the default datetime picker icon in webkit browsers */
	.input::-webkit-calendar-picker-indicator {
		@apply cursor-pointer opacity-60 hover:opacity-100;
	}

	/* Firefox datetime picker styling */
	.input::-moz-focus-inner {
		border: 0;
	}

	.preset-button {
		@apply px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400;
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
			gap: 0.5rem;
		}
	}
</style>
