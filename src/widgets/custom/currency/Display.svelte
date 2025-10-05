<!--
@file src/widgets/custom/currency/Display.svelte
@component
**Currency Widget Display Component**

Displays numeric values as properly formatted currency strings using browser localization.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<CurrencyDisplay field={{ currencyCode: "EUR" }} value={1234.56} />
Renders: "1.234,56 €" (German) or "$1,234.56" (US) based on system language

### Props
- `field: FieldType` - Widget field definition with currency code configuration
- `value: number | null | undefined` - Numeric currency value to display

### Features
- **Intl.NumberFormat**: Browser-native currency formatting with proper localization
- **Multi-Currency Support**: Configurable currency codes (EUR, USD, GBP, etc.)
- **Automatic Localization**: Uses system language for region-appropriate formatting
- **Error Handling**: Graceful fallback to "Invalid amount" for formatting errors
- **Null Safety**: Clean "–" display for missing or null values
- **Performance Optimized**: Memoized formatting with `$derived.by()`
- **Standards Compliant**: Follows international currency display standards
-->

<script lang="ts">
	import { systemLanguage } from '@src/stores/store.svelte';
	import type { FieldType } from './';

	let { field, value }: { field: FieldType; value: number | null | undefined } = $props();

	// Get the user's current UI language.
	const lang = $derived($systemLanguage);

	// Format the number as a currency string.
	const formattedCurrency = $derived.by(() => {
		if (typeof value !== 'number') return '–';
		try {
			// Use the browser's built-in localization for perfect formatting.
			return new Intl.NumberFormat(lang as string, {
				style: 'currency',
				currency: (field.currencyCode || 'EUR') as string
			}).format(value);
		} catch (e) {
			return 'Invalid amount';
		}
	});
</script>

<span>{formattedCurrency}</span>
