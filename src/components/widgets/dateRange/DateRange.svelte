<!-- 
@file src/components/widgets/dateRange/DateRange.svelte
@description - DateRange widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	// zod validation
	import * as z from 'zod';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $collectionValue[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	let endDateValue: string | null = null;

	export const WidgetData = async () => _data;

	// Define the validation schema for this widget
	const widgetSchema = z.object({
		startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid start date format, must be YYYY-MM-DD'),
		endDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid end date format, must be YYYY-MM-DD')
			.refine((endDate, ctx) => {
				const startDate = ctx.parent.startDate;
				return new Date(startDate) <= new Date(endDate);
			}, 'End date must be after start date'),
		db_fieldName: z.string(),
		icon: z.string().optional(),
		color: z.string().optional(),
		size: z.string().optional(),
		width: z.number().optional(),
		required: z.boolean().optional()
	});

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(schema: z.ZodSchema, data: any): string | null {
		try {
			schema.parse(data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if (error instanceof z.ZodError) {
				const errorMessage = error.errors[0]?.message || 'Invalid input';
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
			validationError = validateSchema(widgetSchema, { startDate: _data[_language], endDate: endDateValue });
		}, 300);
	}
</script>

<div class="flex flex-col space-y-4">
	<!-- Start Date -->
	<label for="start-date" class="text-sm font-medium">Start Date:</label>
	<input
		id="start-date"
		type="date"
		bind:value={_data[_language]}
		on:input|preventDefault={validateInput}
		class="input text-black dark:text-primary-500"
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
	/>

	<!-- End Date -->
	<label for="end-date" class="text-sm font-medium">End Date:</label>
	<input
		id="end-date"
		type="date"
		bind:value={endDateValue}
		on:input|preventDefault={validateInput}
		class="input text-black dark:text-primary-500"
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
	/>
</div>

<!-- Error Message -->
{#if validationError}
	<p id={`${field.db_fieldName}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
