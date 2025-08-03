<!--
@file src/widgets/core/checkbox/Checkbox.svelte
@component
**Checkbox widge component to display checkbox field**

@example
<Checkbox label="Checkbox" db_fieldName="checkbox" />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable	
-->

<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { contentLanguage, validationStore } from '@stores/store.svelte';
	import { mode, collectionValue } from '@stores/collectionStore.svelte';

	// Valibot validation
	import { object, string, number, boolean, optional, minLength, pipe, parse, type InferInput, type ValiError } from 'valibot';

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field, value = {} }: Props = $props();

	const fieldName = getFieldName(field);
	value = value || collectionValue.value[fieldName] || {};

	let _data = $state(mode.value === 'create' ? {} : value);
	let validationError = $state<string | null>(null);
	let debounceTimeout: number | undefined;

	// Computed values
	let _language = $derived(field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE);

	// Initialize data structure
	$effect(() => {
		if (!_data[_language]) {
			_data[_language] = { checked: false, label: '' };
		}
		// Translation progress is now handled by the Fields.svelte component
	});

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

	// Cleanup on component destroy
	onDestroy(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	export const WidgetData = async () => _data;
</script>

<div class="checkbox-container relative mb-4">
	<div class="flex w-full items-center gap-2">
		<!-- Checkbox -->
		<input
			id={field.db_fieldName}
			type="checkbox"
			color={field.color}
			bind:checked={_data.checked}
			oninput={validateInput}
			class="h-[${field.size}] w-[${field.size}] mr-4 rounded"
			class:error={!!validationError}
			aria-label={field?.label || field?.db_fieldName}
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
		/>

		<!-- Label -->
		<input
			type="text"
			placeholder="Define Label"
			bind:value={_data.label}
			oninput={validateInput}
			class="input text-black dark:text-primary-500"
			class:error={!!validationError}
			aria-label="Checkbox Label"
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
		/>
	</div>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.checkbox-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>
