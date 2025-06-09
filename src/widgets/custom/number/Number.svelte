<!-- 
@file src/widgets/custom/number/Number.svelte
@component
**Number widget component that allows users to enter a number**

@example
<Number label="Number" db_fieldName="number" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';

	// Stores
	import { contentLanguage, validationStore } from '@stores/store.svelte';
	import { mode, collectionValue } from '@root/src/stores/collectionStore.svelte';

	import { getFieldName } from '@utils/utils';

	// Valibot validation
	import {
		object,
		string,
		number as numberSchema,
		boolean,
		optional,
		regex,
		pipe,
		parse,
		transform,
		custom,
		type InferInput,
		type ValiError
	} from 'valibot';

	// Extend FieldType to include number-specific properties
	interface NumberFieldType extends FieldType {
		minValue?: number;
		maxValue?: number;
	}

	interface Props {
		field: NumberFieldType;
		value?: any;
	}

	let { field, value = collectionValue.value[getFieldName(field)] || {} }: Props = $props();
	let validationError: string | null = $state(null);
	let debounceTimeout: number | undefined;
	let numberInput: HTMLInputElement | undefined = $state();

	const fieldName = getFieldName(field);
	const _data = $state(mode.value === 'create' ? {} : value);
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	const language = $contentLanguage;

	export const WidgetData = async () => _data;

	// Define number validation schema with transformations and validations
	const valueSchema = pipe(
		string(),
		regex(/^\d+(\.\d{1,2})?$/, 'Invalid number format, must be a valid number with up to 2 decimal places'),
		transform((value: string) => parseFloat(value)),
		custom((input: unknown) => {
			const value = input as number;
			if (field.minValue !== undefined && value < field.minValue) {
				throw new Error(`Value must be at least ${field.minValue}`);
			}
			if (field.maxValue !== undefined && value > field.maxValue) {
				throw new Error(`Value must not exceed ${field.maxValue}`);
			}
			return true;
		})
	);

	const widgetSchema = object({
		value: optional(valueSchema),
		db_fieldName: string(),
		icon: optional(string()),
		color: optional(string()),
		size: optional(string()),
		width: optional(numberSchema()),
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

	// Handle input with debounce and parsing
	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = target.value;
		const decimalSeparator = getDecimalSeparator(language);

		if (value[value.length - 1] !== decimalSeparator) {
			const number = parseFloat(value.replace(new RegExp(`[^0-9${decimalSeparator}]`, 'g'), '').replace(decimalSeparator, '.'));
			if (!isNaN(number)) {
				_data[_language] = number;
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

	// Trigger validation
	function validateInput() {
		validationError = validateSchema({ value: _data[_language] });
	}

	// Reactive statement to update character count for badge display
	let count = $derived(_data[_language]?.length ?? 0);

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
		oninput={handleInput}
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
