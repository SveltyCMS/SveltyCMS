<!-- 
@file src/components/widgets/date/Date.svelte
@description - Date widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { mode, entryData, validationStore } from '@stores/store';

	// zod validation
	import * as z from 'zod';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	export const WidgetData = _data;

	// Define the validation schema for this widget
	const widgetSchema = z.object({
		value: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, must be YYYY-MM-DD')
			.optional(),
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
			validationError = validateSchema(widgetSchema, { value: _data[_language] });
		}, 300);
	}
</script>

<!-- Date Input -->
<input
	type="date"
	bind:value={_data[_language]}
	on:input|preventDefault={validateInput}
	class="input text-black dark:text-primary-500"
	aria-invalid={!!validationError}
	aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
/>

<!-- Error Message -->
{#if validationError}
	<p id={`${field.db_fieldName}-error`} class="text-error-500">
		{validationError}
	</p>
{/if}
