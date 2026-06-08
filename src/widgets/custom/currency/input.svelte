<!--
@file src/widgets/custom/Currency/Input.svelte
@component
**Currency Widget Input Component**

Provides localized currency input with real-time formatting and parsing capabilities.
Part of the Three Pillars Architecture for WSidget system.

@example
<CurrencyInput bind:value={amount} field={{ currencyCode: "EUR", required: true }} />
User types "1234.56" → displays "1.234,56 €" → stores 1234.56 as number 

### Props
- `field: FieldType` - Widget field definition with currency code and validation
- `value: number | null | undefined` - Numeric currency value (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Bi-directional Formatting**: Converts between localized display and numeric storage
- **Real-time Parsing**: Parses localized input (e.g., "1.234,56") to clean numbers
- **Auto-formatting on Blur**: Reformats input to canonical currency display
- **Locale-aware Parsing**: Handles different decimal/thousand separators by region
- **Mobile Optimized**: Uses `inputmode="decimal"` for numeric keyboards
- **Multi-Currency Support**: Configurable currency codes with proper symbols
- **Error State Handling**: Visual error indication with accessible messaging
- **Placeholder Intelligence**: Shows formatted zero as input placeholder
- **Data Integrity**: Stores clean numeric values regardless of display format
-->

<script lang="ts">
	import { tokenTarget } from '@src/services/token/token-target';
	import { app, validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { maxValue, minValue, nullable, number as numberSchema, parse, pipe } from 'valibot';
	import type { FieldType } from './';

	let {
		field,
		value = $bindable(),
		error
	}: {
		field: FieldType;
		value?: number | null | undefined;
		error?: string | null;
	} = $props();

	const lang = $derived(app.systemLanguage);
	const currencyCode = $derived(field.currencyCode || 'EUR');
	
	const formatter = $derived(
		new Intl.NumberFormat(lang as string, {
			style: 'currency',
			currency: currencyCode as string,
			minimumFractionDigits: 2
		})
	);

	// Local state for raw input string while typing
	let displayValue = $state('');
	let isFocused = $state(false);

	// Sync local display when not focused or when value changes externally
	$effect(() => {
		if (!isFocused) {
			displayValue = typeof value === 'number' ? formatter.format(value) : '';
		}
	});

	function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
		displayValue = e.currentTarget.value;
		const numeric = parseLocalizedNumber(displayValue, lang as string);
		value = Number.isNaN(numeric) ? null : numeric;
	}

	function handleBlur() {
		isFocused = false;
		if (typeof value === 'number') {
			displayValue = formatter.format(value);
		}
		validateCurrency(value);
	}

	function handleFocus() {
		isFocused = true;
		if (typeof value === 'number') {
			// Show number without currency symbol and grouping for easier editing
			displayValue = new Intl.NumberFormat(lang as string, { 
				useGrouping: false, 
				minimumFractionDigits: 0,
				maximumFractionDigits: 10 
			}).format(value);
		}
	}

	function handleClear() {
		value = null;
		displayValue = '';
		validationStore.clearError(fieldName);
	}

	// Validation
	const fieldName = $derived(getFieldName(field));
	const currencySchema = $derived.by(() => {
		const min = (field as any).minValue ?? (field as any).min;
		const max = (field as any).maxValue ?? (field as any).max;
		let schema: any = numberSchema('Amount must be a number');
		if (typeof min === 'number') schema = pipe(schema, minValue(min, `Min: ${formatter.format(min)}`));
		if (typeof max === 'number') schema = pipe(schema, maxValue(max, `Max: ${formatter.format(max)}`));
		return field.required ? schema : nullable(schema);
	});

	function validateCurrency(val: any) {
		handleWidgetValidation(() => parse(currencySchema, val), { fieldName, updateStore: true });
	}

	function parseLocalizedNumber(str: string, locale: string): number {
		const parts = new Intl.NumberFormat(locale).formatToParts(123456.789);
		const group = parts.find(p => p.type === 'group')?.value || '';
		const decimal = parts.find(p => p.type === 'decimal')?.value || '.';
		const normalized = str
			.replace(new RegExp(`\\${group}`, 'g'), '')
			.replace(decimal, '.')
			.replace(/[^\d.-]/g, '');
		return parseFloat(normalized);
	}
</script>

<div class="currency-widget flex flex-col gap-1">
	<div 
		class="flex items-center rounded-lg border transition-all bg-white dark:bg-surface-900 border-surface-400 dark:border-surface-600 focus-within:ring-2 focus-within:ring-primary-500"
		class:!border-error-500={!!error}
		class:ring-2={!!error}
		class:ring-error-500={!!error}
	>
		{#if field.prefix}
			<span class="px-3 py-2 bg-surface-100 dark:bg-surface-800 border-e border-surface-300 dark:border-surface-700 text-surface-500 text-sm font-medium">
				{field.prefix}
			</span>
		{/if}

		<div class="relative grow flex items-center px-3">
			<iconify-icon icon="mdi:cash-multiple" width="18" class="text-surface-400 me-2"></iconify-icon>
			<input
				type="text"
				aria-label={field.label || fieldName || 'Currency amount'}
				value={displayValue}
				oninput={handleInput}
				onfocus={handleFocus}
				onblur={handleBlur}
				placeholder={typeof field.placeholder === 'string' ? field.placeholder : formatter.format(0)}
				class="w-full border-none bg-transparent py-2 text-sm font-semibold outline-none focus:ring-0 text-surface-900 dark:text-surface-50"
				inputmode="decimal"
				use:tokenTarget={{ name: fieldName, label: field.label, collection: (field as any).collection }}
			/>
		</div>

		{#if field.suffix}
			<span class="px-3 py-2 bg-surface-100 dark:bg-surface-800 border-s border-surface-300 dark:border-surface-700 text-surface-500 text-sm font-medium">
				{field.suffix}
			</span>
		{/if}

		{#if !field.required || value !== null}
			<button 
				type="button" 
				class="p-1 me-1 rounded bg-surface-200 dark:bg-surface-800 text-surface-700 dark:text-surface-300 opacity-60 hover:opacity-100 hover:bg-surface-300 dark:hover:bg-surface-700 transition-colors flex items-center justify-center"
				onclick={handleClear}
				title="Clear value"
			>
				<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			</button>
		{/if}
	</div>

	{#if error}
		<p class="text-[10px] font-medium text-error-500 px-1" role="alert">{error}</p>
	{/if}
</div>
