<!-- 
@file src/components/widgets/phoneNumber/PhoneNumber.svelte
@description - PhoneNumber widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';

	// Stores
	import { validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	import { getFieldName } from '@utils/utils';

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

	// Define base schema for phone number with validation
	const valueSchema = pipe(string(), regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format, must be a valid international number'));

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

	// Validate function for schema
	function validateSchema(data: unknown): string | null {
		try {
			parse(widgetSchema, data);
			validationStore.clearError(fieldName);
			return null;
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

	// Handle input with debounce
	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			validateInput();
		}, 300);
	}

	// Trigger validation
	function validateInput() {
		validationError = validateSchema({ value: _data[_language] });
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
