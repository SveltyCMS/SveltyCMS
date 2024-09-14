<!-- 
@file src/components/widgets/phoneNumber/PhoneNumber.svelte
@description - PhoneNumber widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';

	// Stores
	import { mode, entryData, validationStore } from '@stores/store';

	import { getFieldName } from '@utils/utils';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;

	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	export const WidgetData = _data;

	// zod validation
	import * as z from 'zod';

	// Define the validation schema for the phone number widget
	const widgetSchema = z.object({
		value: z
			.string()
			.regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format, must be a valid international number')
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

	// Validate the input using the generic validateSchema function with debounce
	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			validateInput();
		}, 300);
	}

	function validateInput() {
		validationError = validateSchema(widgetSchema, { value: _data[_language] });
	}
</script>

<div class="variant-filled-surface btn-group flex w-full rounded">
	<input
		type="tel"
		bind:value={_data[_language]}
		on:input|preventDefault={handleInput}
		name={field?.db_fieldName}
		id={field?.db_fieldName}
		placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
		required={field?.required}
		readonly={field?.readonly}
		class="input text-black dark:text-primary-500"
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${fieldName}-error` : undefined}
	/>
</div>

<!-- Error Message -->
{#if validationError}
	<p id={`${fieldName}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
