<!-- 
@file src/components/widgets/email/Email.svelte
@description - Email widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	// Valibot validation
	import { string, email as emailValidator, pipe, parse, type InferInput, type ValiError } from 'valibot';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $collectionValue[fieldName] || {};

	const _data: Record<string, string> = $mode === 'create' ? {} : value;
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;

	$: updateTranslationProgress(_data, field);

	let validationError: string | null = null;
	let debounceTimeout: number | undefined;
	let initialRender = true;

	// Define the validation schema for this widget
	const widgetSchema = pipe(string(), emailValidator('Please enter a valid email address'));

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
			if (!initialRender) {
				validationError = validateSchema(_data[_language]);
			} else {
				initialRender = false;
			}
		}, 300);
	}

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => _data;
</script>

<!-- Email Input -->
<input
	type="email"
	aria-label={field?.label || field?.db_fieldName}
	bind:value={_data[_language]}
	on:input={validateInput}
	name={field.db_fieldName}
	id={field.db_fieldName}
	placeholder={field.placeholder || field.db_fieldName}
	class="input text-black dark:text-primary-500"
	aria-invalid={!!validationError}
	aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
/>

<!-- Error Message -->
{#if validationError}
	<p id={`${field.db_fieldName}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
