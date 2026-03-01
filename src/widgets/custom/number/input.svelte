<!--
@file src/widgets/custom/Number/Input.svelte
@component
**Number Widget Component**

@example
<Number field={{ label: "Price", db_fieldName: "price", required: true, min: 0, required={field?.required as boolean | undefined}
				readonly={field?.readonly as boolean | undefined}
				disabled={field?.disabled as boolean | undefined}
				min={field?.min as number | undefined}
				max={field?.max as number | undefined}
				step={(field?.step as number) || 1}
				class="input w-full flex-1 rounded-none text-black dark:text-primary-500"00 }} />

### Props
- `field`: FieldType
- `value`: any

### Features
- **Number Validation**: Stores as actual number type (not string)
- **Non-Translatable**: Numbers are universal values
- **Semantic HTML**: Uses type="number" for proper mobile keyboards
- **Min/Max Validation**: Numeric range constraints
- **Step Controls**: Configurable increment/decrement
- **Locale Support**: Respects user's number formatting preferences
- **Enhanced Validation**: Integration with validation store
- **Touch State Management**: Proper error display based on interaction
- **Debounced Validation**: Performance-optimized validation
- **Prefix/Suffix Support**: For units (e.g., "$", "kg", "px")
- **Accessibility**: Full ARIA support and semantic HTML
-->

<script lang="ts">
	// Components
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { tokenTarget } from '@src/services/token/token-target';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	// Stores
	import { app, validationStore } from '@src/stores/store.svelte.ts';
	import { getFieldName } from '@utils/utils';
	// Unified error handling
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { onDestroy } from 'svelte';

	// Valibot validation
	import { maxValue, minValue, number as numberSchema, optional, parse, pipe } from 'valibot';
	import type { FieldType } from '.';

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field, value = $bindable() }: Props = $props();

	const fieldName = $derived(getFieldName(field));
	// Use current content language for translated fields, default for non-translated
	const LANGUAGE = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());
	const language = $derived(app.contentLanguage);

	// Initialize value if null/undefined
	$effect(() => {
		if (value === undefined || value === null) {
			value = field.translated ? { [LANGUAGE]: null } : null;
		}
	});

	const safeValue = $derived(value?.[LANGUAGE]);
	const validationError = $derived(validationStore.getError(fieldName));
	let debounceTimeout: number | undefined;
	let isTouched = $state(false);
	let isValidating = $state(false);

	// Define number validation schema with range validations
	const validationSchemaFunc = $derived.by(() => {
		const rules: any[] = [];

		if (typeof field.min === 'number') {
			rules.push(minValue(field.min, `Value must be at least ${field.min}`));
		}
		if (typeof field.max === 'number') {
			rules.push(maxValue(field.max, `Value must not exceed ${field.max}`));
		}

		const schema = rules.length > 0 ? pipe(numberSchema('Value must be a number'), ...(rules as [])) : numberSchema('Value must be a number');

		return field.required ? schema : optional(schema);
	});

	// Get decimal separator for the current locale
	function getDecimalSeparator(locale: string) {
		const numberWithDecimalSeparator = new Intl.NumberFormat(locale).format(1.1);
		return numberWithDecimalSeparator.substring(1, 2);
	}

	// Handle input with locale-aware parsing
	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const inputValue = target.value;

		if (!inputValue || inputValue === '') {
			if (field.translated) {
				if (!value || typeof value !== 'object') {
					value = {};
				}
				value = { ...value, [LANGUAGE]: null };
			} else {
				value = null;
			}
			validateInput(false);
			return;
		}

		const decimalSeparator = getDecimalSeparator(language);

		// Allow partial input (ending with decimal separator)
		if (inputValue.at(-1) === decimalSeparator) {
			return;
		}

		// Parse the number
		const cleanedValue = inputValue.replace(new RegExp(`[^0-9${decimalSeparator}-]`, 'g'), '').replace(decimalSeparator, '.');
		const number = Number.parseFloat(cleanedValue);

		if (!Number.isNaN(number)) {
			if (field.translated) {
				if (!value || typeof value !== 'object') {
					value = {};
				}
				value = { ...value, [LANGUAGE]: number };
			} else {
				value = number;
			}
			// Format the display value
			target.value = new Intl.NumberFormat(language, {
				maximumFractionDigits: typeof field.step === 'number' && field.step < 1 ? 2 : 0
			}).format(number);
		}

		validateInput(false);
	}

	// Handle blur - finalize the value
	function handleBlur() {
		isTouched = true;
		validateInput(true);
	}

	// Validation function
	function validateInput(immediate = false) {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}

		const doValidation = () => {
			isValidating = true;
			try {
				const currentValue = safeValue;

				// Required validation
				if (field?.required && (currentValue === null || currentValue === undefined)) {
					validationStore.setError(fieldName, 'This field is required');
					return;
				}

				// If no value and not required, clear errors
				if (!field?.required && (currentValue === null || currentValue === undefined)) {
					validationStore.clearError(fieldName);
					return;
				}

				// ✅ UNIFIED: Use handleWidgetValidation for standardized error handling
				handleWidgetValidation(() => parse(validationSchemaFunc, currentValue), {
					fieldName,
					updateStore: true
				});
			} finally {
				isValidating = false;
			}
		};

		if (immediate) {
			doValidation();
		} else {
			debounceTimeout = window.setTimeout(doValidation, 300);
		}
	}

	// Cleanup
	onDestroy(() => {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}
	});

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => value;
</script>

<div class="input-container relative mb-4">
	<SystemTooltip title={validationError || ''} wFull={true}>
		<div class="flex w-full overflow-hidden rounded border border-surface-400 dark:border-surface-600" role="group">
			{#if field?.prefix}
				<div
					class="flex items-center bg-surface-200 px-3 text-surface-700 dark:bg-surface-800 dark:text-surface-200"
					aria-label={`${field.prefix} prefix`}
				>
					{field?.prefix}
				</div>
			{/if}

			<div class="relative w-full flex-1">
				<input
					type="number"
					value={safeValue !== null && safeValue !== undefined ? safeValue : ''}
					oninput={handleInput}
					onblur={handleBlur}
					oninvalid={(e) => e.preventDefault()}
					use:tokenTarget={{
						name: field.db_fieldName,
						label: field.label,
						collection: (field as any).collection
					}}
					name={field?.db_fieldName}
					id={field?.db_fieldName}
					placeholder={typeof field?.placeholder === 'string' && field.placeholder !== '' ? field.placeholder : String(field?.db_fieldName ?? '')}
					required={field?.required as boolean | undefined}
					readonly={field?.readonly as boolean | undefined}
					disabled={field?.disabled as boolean | undefined}
					min={field?.min as number | undefined}
					max={field?.max as number | undefined}
					step={(field?.step as number) || 1}
					class="input w-full rounded-none border-none bg-white font-medium text-black outline-none focus:ring-0 dark:bg-surface-900 dark:text-primary-500 {validationError
						? 'bg-error-500-10!'
						: ''}"
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
					aria-required={field?.required}
					data-testid="number-input"
				/>
			</div>

			{#if field?.suffix}
				<div
					class="flex items-center bg-surface-200 px-3 text-surface-700 dark:bg-surface-800 dark:text-surface-200"
					aria-label={`${field.suffix} suffix`}
				>
					{field?.suffix}
				</div>
			{/if}

			<!-- Validation indicator -->
			{#if isValidating}
				<div class="flex items-center bg-white px-2 dark:bg-surface-900" aria-label="Validating">
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
				</div>
			{/if}
		</div>
	</SystemTooltip>

	<!-- Error Message -->
	{#if validationError && isTouched}
		<p id={`${fieldName}-error`} class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite">
			{validationError}
		</p>
	{/if}
</div>
