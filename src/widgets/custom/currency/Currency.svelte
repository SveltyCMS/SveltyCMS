<!--
@file src/widgets/custom/currency/Currency.svelte
@component
**Currency widget component to display currency field**

@example
<Currency label="Currency" db_fieldName="currency" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import { getFieldName } from '@utils/utils';
	import { preventDefault, run } from 'svelte/legacy';
	// Stores
	import { publicEnv } from '@root/config/public';
	import { contentLanguage, validationStore } from '@stores/store.svelte';
	// Valibot validation
	import { boolean, number, object, optional, parse, pipe, regex, string, type ValiError } from 'valibot';

	// Reactive language handling (align with core Input widget pattern)
	// Derive active language: if field is translatable use current contentLanguage, otherwise fallback to default public env setting
	// Props (minimal) - currency widget expects a field definition and optional value object keyed by language codes
	interface Props {
		field: any;
		value?: Record<string, string>;
	}
	let { field, value = $bindable<Record<string, string> | undefined>() }: Props = $props();

	// Internal data object (fallback if external value not provided)
	let _data = $state<Record<string, string>>(value || {});
	// Sync outward when internal changes
	$effect(() => {
		if (value !== _data) value = _data;
	});
	// Sync inward if parent replaces value object
	$effect(() => {
		if (value && value !== _data) _data = value;
	});

	// Field name for validation store
	const fieldName = getFieldName(field);

	let _language = $derived((field?.translated ? contentLanguage.value : (publicEnv.DEFAULT_CONTENT_LANGUAGE as string))?.toLowerCase());
	let validationError: string | null = $state(null);
	let debounceTimeout: number | undefined;

	let numberInput: HTMLInputElement | undefined = $state();

	export const WidgetData = async () => _data;

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = target.value;
		const decimalSeparator = getDecimalSeparator(_language);
		if (value[value.length - 1] !== decimalSeparator) {
			const number = parseFloat(value.replace(new RegExp(`[^0-9${decimalSeparator}]`, 'g'), '').replace(decimalSeparator, '.'));
			if (!isNaN(number)) {
				target.value = new Intl.NumberFormat(_language, { maximumFractionDigits: 20 }).format(number);
			} else {
				target.value = value;
			}
		}
	}

	function getDecimalSeparator(locale: string) {
		const numberWithDecimalSeparator = new Intl.NumberFormat(locale).format(1.1);
		return numberWithDecimalSeparator.substring(1, 2);
	}

	run(() => {
		if (numberInput) {
			const value = numberInput.value;
			const decimalSeparator = getDecimalSeparator(_language);
			const number = parseFloat(value.replace(new RegExp(`[^0-9${decimalSeparator}]`, 'g'), '').replace(decimalSeparator, '.'));
			if (!isNaN(number)) {
				numberInput.value = new Intl.NumberFormat(_language, { maximumFractionDigits: 20 }).format(number);
			} else {
				numberInput.value = value;
			}
		}
	});

	// Define the validation schema for this widget
	const valueSchema = pipe(string(), regex(/^\d+(\.\d{1,2})?$/, 'Invalid currency format, must be a valid number with up to 2 decimal places'));

	const widgetSchema = object({
		value: valueSchema,
		db_fieldName: string(),
		icon: optional(string()),
		color: optional(string()),
		size: optional(string()),
		width: optional(number()),
		required: optional(boolean())
	});

	// (WidgetSchemaType omitted because not used directly)

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

	// Reactive statement to update count
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

<div class="input-container relative mb-4">
	<div class="variant-filled-surface btn-group flex w-full rounded">
		{#if field?.prefix}
			<button class="!px-2">{field?.prefix}</button>
		{/if}

		<input
			type="text"
			bind:value={_data[_language]}
			bind:this={numberInput}
			oninput={preventDefault(handleInput)}
			name={field?.db_fieldName}
			id={field?.db_fieldName}
			placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
			required={field?.required}
			minlength={field?.minlength}
			maxlength={field?.maxlength}
			step={field?.step}
			class="input text-black dark:text-primary-500"
			class:error={!!validationError}
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
			onblur={validateInput}
		/>

		<!-- suffix -->
		{#if field?.suffix}
			<button class="!px-1">
				{#if field?.minlength || field?.maxlength}
					<span class="badge mr-1 rounded-full {getBadgeClass(count)}">
						{#if field?.minlength && field?.maxlength}
							{count}/{field?.maxlength}
						{:else if field?.maxlength}
							{count}/{field?.maxlength}
						{:else if field?.minlength}
							min {field?.minlength}
						{/if}
					</span>
				{/if}
				{field?.suffix}
			</button>
		{:else if field?.minlength || field?.maxlength}
			<span class="badge rounded-none {getBadgeClass(count)}">
				{#if field?.minlength && field?.maxlength}
					{count}/{field?.maxlength}
				{:else if field?.maxlength}
					{count}/{field?.maxlength}
				{:else if field?.minlength}
					min {field?.minlength}
				{/if}
			</span>
		{/if}
	</div>

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
