<script lang="ts">
	import type { FieldType } from './';

	let { field, value, error }: { field: FieldType; value: string | null | undefined; error?: string | null } = $props();

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

	// This function handles changes from the input and updates the parent `value`.
	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		const localDateStr = event.currentTarget.value;
		if (localDateStr) {
			// Convert the local datetime string from the input directly to a UTC ISO string.
			value = new Date(localDateStr).toISOString();
		} else {
			// Clear the value if the input is empty.
			value = null;
		}
	}
</script>

<div class="input-container">
	<input
		type="datetime-local"
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
	/* Styles are identical to the Date input component */
	.input-container {
		position: relative;
		padding-bottom: 1.5rem;
	}
	.input.invalid {
		border-color: #ef4444;
	}
	.error-message {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		text-align: center;
		font-size: 0.75rem;
		color: #ef4444;
	}
</style>
