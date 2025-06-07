<!-- 
@file src/widgets/core/dateRange/DateRange.svelte
@component
**DateRange widget component to display date range field**

@example
<DateRange label="DateRange" db_fieldName="dateRange" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { mode, collectionValue } from '@stores/collectionStore.svelte';

	// valibot validation
	import * as v from 'valibot';

	let { field, value = {} }: Props = $props();
	const fieldName = getFieldName(field);

	interface Props {
		field: FieldType;
		value?: any;
	}

	const _data = $state(mode.value === 'create' ? {} : value);
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	let validationError: string | null = $state(null);
	let debounceTimeout: number | undefined;

	let endDateValue: string | null = $state(null);

	export const WidgetData = async () => _data;

	// Define the validation schema for this widget
	const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;

	// Create a custom validation pipeline for the end date
	const endDateValidation = v.pipe(v.string(), v.regex(dateFormatRegex, 'Invalid end date format, must be YYYY-MM-DD'));

	const widgetSchema = v.object({
		startDate: v.pipe(v.string(), v.regex(dateFormatRegex, 'Invalid start date format, must be YYYY-MM-DD')),
		endDate: endDateValidation,
		db_fieldName: v.string(),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		size: v.optional(v.string()),
		width: v.optional(v.number()),
		required: v.optional(v.boolean())
	});

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(schema: typeof widgetSchema, data: any): string | null {
		try {
			v.parse(schema, data);
			// Additional date comparison validation
			const startDate = new Date(data.startDate);
			const endDate = new Date(data.endDate);
			if (startDate > endDate) {
				const errorMessage = 'End date must be after start date';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if (error instanceof v.ValiError) {
				const errorMessage = error.issues[0]?.message || 'Invalid input';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Debounced validation function
	function validateInput() {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			validationError = validateSchema(widgetSchema, {
				startDate: _data[_language],
				endDate: endDateValue
			});
		}, 300);
	}
</script>

<div class="input-container relative mb-4">
	<div class="flex flex-col space-y-4">
		<!-- Start Date -->
		<div>
			<label for="start-date" class="text-sm font-medium">Start Date:</label>
			<input
				id="start-date"
				type="date"
				bind:value={_data[_language]}
				oninput={validateInput}
				class="input w-full text-black dark:text-primary-500"
				class:error={!!validationError}
				aria-invalid={!!validationError}
				aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
			/>
		</div>

		<!-- End Date -->
		<div>
			<label for="end-date" class="text-sm font-medium">End Date:</label>
			<input
				id="end-date"
				type="date"
				bind:value={endDateValue}
				oninput={validateInput}
				class="input w-full text-black dark:text-primary-500"
				class:error={!!validationError}
				aria-invalid={!!validationError}
				aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
			/>
		</div>
	</div>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 8rem; /* Increased to accommodate two inputs */
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>
