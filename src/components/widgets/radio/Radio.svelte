<!-- 
@file src/components/widgets/radio/Radio.svelte
@description - Radio widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { mode, entryData, contentLanguage, validationStore } from '@stores/store';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;

	$: _language = field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE;
	$: updateTranslationProgress(_data, field);

	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	export const WidgetData = _data;

	// zod validation
	import * as z from 'zod';

	// Define the validation schema for the radio widget
	const widgetSchema = z.object({
		value: z.string().min(1, 'Selection is required').optional(),
		db_fieldName: z.string(),
		icon: z.string().optional(),
		color: z.string().optional(),
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

	// Handle input changes with debounce
	function handleInput(event: Event) {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			validateInput();
		}, 300);
	}

	// Validate the input using the generic validateSchema function
	function validateInput() {
		validationError = validateSchema(widgetSchema, { value: _data[_language] });
	}
</script>

<div class="flex w-full items-center gap-2">
	<!-- Radio -->
	<input
		id={fieldName}
		type="radio"
		bind:value={_data.value}
		on:input|preventDefault={handleInput}
		color={field.color}
		class="input float-left mr-4 mt-1 h-4 w-4 cursor-pointer appearance-none rounded-full border border-surface-300 bg-white bg-contain bg-center bg-no-repeat align-top text-black transition duration-200 checked:border-tertiary-600 checked:bg-tertiary-600 focus:outline-none dark:text-white"
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${fieldName}-error` : undefined}
	/>

	<!-- Label -->
	<input
		type="text"
		id={`label-${fieldName}`}
		on:input={handleInput}
		placeholder="Define Label"
		bind:value={_data[_language]}
		class="input text-black dark:text-primary-500"
		aria-labelledby={`label-${fieldName}`}
	/>
</div>

<!-- Error Message -->
{#if validationError}
	<p id={`${fieldName}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
