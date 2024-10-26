<!-- 
@file src/components/widgets/radio/Radio.svelte
@description - Radio widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { contentLanguage, validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $collectionValue[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;

	$: _language = field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE;
	$: updateTranslationProgress(_data, field);

	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	export const WidgetData = async () => _data;

	// Valibot validation
	import { object, string, number, boolean, optional, minLength, pipe, parse, type InferInput, type ValiError } from 'valibot';

	// Define the validation schema for the radio widget
	const valueSchema = pipe(string(), minLength(1, 'Selection is required'));

	const widgetSchema = object({
		value: optional(valueSchema),
		db_fieldName: string(),
		icon: optional(string()),
		color: optional(string()),
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

	// Handle input changes with debounce
	function handleInput(event: Event) {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			validateInput();
		}, 300);
	}

	// Validate the input using the generic validateSchema function
	function validateInput() {
		validationError = validateSchema({ value: _data[_language] });
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
