<!--
@file src/widgets/custom/currency/Input.svelte
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
	import { systemLanguage } from '@src/stores/store.svelte';
	import type { FieldType } from './';

	let { field, value, error }: { field: FieldType; value: number | null | undefined; error?: string | null } = $props();

	// Get the user's current UI language.
	const lang = $derived($systemLanguage);

	// Create a memoized number formatter for the specified currency.
	const formatter = $derived(
		new Intl.NumberFormat(lang as string, {
			style: 'currency',
			currency: (field.currencyCode as string) || 'EUR'
		})
	);

	// Local state for the displayed, formatted string.
	let formattedValue = $state('');

	// Effect 1: When the parent `value` (number) changes, update the local formatted string.
	$effect(() => {
		// Only update if the number is valid and different from what the input already represents.
		const currentNumericValue = parseLocalizedNumber(formattedValue, lang);
		if (typeof value === 'number' && value !== currentNumericValue) {
			formattedValue = formatter.format(value);
		} else if (value === null || value === undefined) {
			formattedValue = '';
		}
	});

	// This function is called when the user types in the input.
	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		const inputString = event.currentTarget.value;
		// Parse the localized string back into a number.
		const numericValue = parseLocalizedNumber(inputString, lang);
		// Update the parent's `value` with the clean number.
		value = isNaN(numericValue) ? null : numericValue;
	}

	// This function is called when the user leaves the input field.
	function handleBlur() {
		// Re-format the input to a clean, canonical currency format.
		if (typeof value === 'number') {
			formattedValue = formatter.format(value);
		}
	}

	// A helper function to parse a localized number string (e.g., "1.234,56") into a JS number.
	function parseLocalizedNumber(str: string, locale: string): number {
		const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
		const group = parts.find((p) => p.type === 'group')?.value || ',';
		const decimal = parts.find((p) => p.type === 'decimal')?.value || '.';
		const cleaned = str.replace(new RegExp(`\\${group}`, 'g'), '').replace(decimal, '.');
		return parseFloat(cleaned.replace(/[^\d.-]/g, ''));
	}
</script>

<div class="input-container">
	<input
		type="text"
		inputmode="decimal"
		id={field.db_fieldName}
		name={field.db_fieldName}
		required={field.required}
		placeholder={(field.placeholder as string) || formatter.format(0)}
		bind:value={formattedValue}
		oninput={handleInput}
		onblur={handleBlur}
		class="input"
		class:invalid={error}
		aria-invalid={!!error}
		aria-describedby={error ? `${field.db_fieldName}-error` : undefined}
	/>
	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>
