<!-- 
@file src/components/widgets/number/Number.svelte
@description - Number widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';

	// Stores
	import { mode, collectionValue, contentLanguage, validationStore } from '@stores/store';

	import { getFieldName } from '@utils/utils';
	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $collectionValue[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	let numberInput: HTMLInputElement;
	const language = $contentLanguage;

	export const WidgetData = _data;

	// Define the validation schema for this widget
	import * as z from 'zod';

	const widgetSchema = z.object({
		value: z
			.string()
			.regex(/^\d+(\.\d{1,2})?$/, 'Invalid number format, must be a valid number with up to 2 decimal places')
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

	// Handle number input formatting and validation with debounce
	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = target.value;
		const decimalSeparator = getDecimalSeparator(language);

		if (value[value.length - 1] !== decimalSeparator) {
			const number = parseFloat(value.replace(new RegExp(`[^0-9${decimalSeparator}]`, 'g'), '').replace(decimalSeparator, '.'));
			if (!isNaN(number)) {
				target.value = new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(number);
			} else {
				target.value = value;
			}
		}

		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => validateInput(), 300);
	}

	function getDecimalSeparator(language: string) {
		const numberWithDecimalSeparator = new Intl.NumberFormat(language).format(1.1);
		return numberWithDecimalSeparator.substring(1, 2);
	}

	// Validate the input using the generic validateSchema function
	function validateInput() {
		validationError = validateSchema(widgetSchema, { value: _data[_language] });
	}

	// Reactive statement to update character count for badge display
	$: count = _data[_language]?.length ?? 0;

	const getBadgeClass = (length: number) => {
		if (field?.minlength && length < field?.minlength) {
			return 'bg-red-600';
		} else if (field?.maxlength && length > field?.maxlength) {
			return 'bg-red-600';
		} else if (field?.minlength) {
			return '!variant-filled-surface';
		} else {
			return '!variant-ghost-surface';
		}
	};
</script>

<div class="variant-filled-surface btn-group flex w-full rounded">
	{#if field?.prefix}
		<button class="!px-2">{field?.prefix}</button>
	{/if}

	<input
		type="text"
		bind:value={_data[_language]}
		bind:this={numberInput}
		on:input|preventDefault={handleInput}
		name={field?.db_fieldName}
		id={field?.db_fieldName}
		placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
		required={field?.required}
		readonly={field?.readonly}
		minlength={field?.minlength}
		maxlength={field?.maxlength}
		step={field?.step}
		class="input text-black dark:text-primary-500"
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${fieldName}-error` : undefined}
	/>

	<!-- suffix -->
	{#if field?.suffix}
		<button class="!px-1">
			{#if field?.minlength || field?.maxlength}
				<span class="badge mr-1 rounded-full {getBadgeClass(count)}">
					{count}/{field?.maxlength}
				</span>
			{/if}
			{field?.suffix}
		</button>
	{:else if field?.minlength || field?.maxlength}
		<span class="badge rounded-none {getBadgeClass(count)}">
			{count}/{field?.maxlength}
		</span>
	{/if}
</div>

<!-- Error Message -->
{#if validationError}
	<p id={`${fieldName}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
