<script lang="ts">
	import type { FieldType, DateRangeWidgetData } from './';

	let { field, value, error }: { field: FieldType; value: DateRangeWidgetData | null | undefined; error?: string | null } = $props();

	// Use local state for each input field.
	let startInput = $state('');
	let endInput = $state('');

	// Effect 1: When the parent `value` prop changes, update our local inputs.
	$effect(() => {
		startInput = value?.start?.substring(0, 10) ?? '';
		endInput = value?.end?.substring(0, 10) ?? '';
	});

	// Effect 2: When local inputs change, update the parent `value` prop.
	$effect(() => {
		const start = startInput ? new Date(startInput).toISOString() : null;
		const end = endInput ? new Date(endInput).toISOString() : null;

		// Only update if the values are valid and different from the current prop value.
		if (start !== value?.start || end !== value?.end) {
			value = { start, end };
		}
	});
</script>

<div class="input-container">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-2">
		<div class="flex-1">
			<label for="{field.db_fieldName}-start" class="label">Start Date</label>
			<input type="date" id="{field.db_fieldName}-start" bind:value={startInput} class="input" class:invalid={error} />
		</div>

		<span class="hidden text-gray-400 sm:block sm:pt-6">→</span>

		<div class="flex-1">
			<label for="{field.db_fieldName}-end" class="label">End Date</label>
			<input type="date" id="{field.db_fieldName}-end" bind:value={endInput} class="input" class:invalid={error} />
		</div>
	</div>

	{#if error}
		<p id={`${field.db_fieldName}-error`} class="error-message" role="alert">
			{error}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		position: relative;
		padding-bottom: 1.5rem;
	}
	.label {
		@apply mb-1 block text-xs font-medium text-gray-600;
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
