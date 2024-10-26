<!-- 
@file src/components/widgets/checkbox/Checkbox.svelte
@description - Checkbox widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { contentLanguage, validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	// Valibot validation
	import { object, string, number, boolean, optional, minLength, pipe, parse, type InferInput, type ValiError } from 'valibot';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $collectionValue[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;

	$: _language = field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE;
	$: updateTranslationProgress(_data, field);

	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	export const WidgetData = async () => _data;

	// Define the validation schema for this widget
	const labelSchema = pipe(string(), minLength(1, 'Label cannot be empty'));

	const widgetSchema = object({
		checked: boolean(),
		label: labelSchema,
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
			validationError = validateSchema(_data[_language]);
		}, 300);
	}
</script>

<div class="flex w-full items-center gap-2">
	<!-- Checkbox -->
	<input
		id={field.db_fieldName}
		type="checkbox"
		color={field.color}
		bind:checked={_data[_language].checked}
		on:input={validateInput}
		class="h-[${field.size}] w-[${field.size}] mr-4 rounded"
		aria-label={field?.label || field?.db_fieldName}
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
	/>

	<!-- Label -->
	<input
		type="text"
		placeholder="Define Label"
		bind:value={_data[_language].label}
		on:input={validateInput}
		class="input text-black dark:text-primary-500"
		aria-label="Checkbox Label"
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
