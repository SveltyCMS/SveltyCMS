<!-- 
@file src/components/widgets/date/Date.svelte
@description - Date widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	// Valibot validation
	import { object, string, number, boolean, optional, regex, pipe, parse, type InferInput, type ValiError } from 'valibot';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $collectionValue[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	export const WidgetData = async () => _data;

	// Define the validation schema for this widget
	const valueSchema = pipe(string(), regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, must be YYYY-MM-DD'));

	const widgetSchema = object({
		value: optional(valueSchema),
		db_fieldName: string(),
		icon: optional(string()),
		color: optional(string()),
		size: optional(string()),
		width: optional(number()),
		required: optional(boolean())
	});

	type WidgetSchemaType = InferInput<typeof widgetSchema>;

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(data: unknown): string | null {
		try {
			parse(widgetSchema, data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if ((error as ValiError<typeof widgetSchema>).issues) {
				const valiError = error as ValiError<typeof widgetSchema>;
				const errorMessage = valiError.issues[0]?.message || 'Invalid input';
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
			validationError = validateSchema({ value: _data[_language] });
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
