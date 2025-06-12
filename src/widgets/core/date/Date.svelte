<!-- 
@file src/widgets/core/date/Date.svelte
@component
**Date widget component to display date field**

@example
<Date label="Date" db_fieldName="date" required={true} />

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
	import { mode, collectionValue } from '@root/src/stores/collectionStore.svelte';

	// Valibot validation
	import { object, string, number, boolean, optional, regex, pipe, parse, type ValiError, transform } from 'valibot';

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field, value = {} }: Props = $props();

	const fieldName = getFieldName(field);
	value = collectionValue.value[fieldName] || value;

	const _data = $state<Record<string, string>>(mode.value === 'create' ? {} : value);
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	let validationError: string | null = $state(null);
	let debounceTimeout: number | undefined;

	export const WidgetData = async () => _data;

	// Define the validation schema for this widget
	const valueSchema = pipe(
		string(),
		regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, must be YYYY-MM-DD'),
		transform((value: string) => {
			const date = new Date(value);
			return isNaN(date.getTime()) ? value : date.toISOString().split('T')[0];
		})
	);

	const widgetSchema = object({
		value: optional(valueSchema),
		db_fieldName: string(),
		icon: optional(string()),
		color: optional(string()),
		size: optional(string()),
		width: optional(number()),
		required: optional(boolean())
	});

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
	function handleInput(event: Event) {
		event.preventDefault();
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			const value = _data[_language];
			validationError = validateSchema({
				value: value || '',
				db_fieldName: field.db_fieldName,
				required: field.required
			});
		}, 300);
	}
</script>

<div class="input-container relative mb-4">
	<!-- Date Input -->
	<input
		type="date"
		bind:value={_data[_language]}
		oninput={handleInput}
		class="input w-full text-black dark:text-primary-500"
		class:error={!!validationError}
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
		required={field?.required}
	/>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>
