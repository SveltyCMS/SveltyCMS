<!--
@file src/widgets/custom/number/Display.svelte
@component
**Number Widget Display Component**

Displays numeric values with proper localization and thousand separators.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<NumberDisplay value={1234567.89} />
Renders: "1,234,567.89" (US) or "1.234.567,89" (German) based on system language

### Props
- `value: number | null | undefined` - Numeric value to display

### Features
- **Intl.NumberFormat**: Browser-native number formatting with proper localization
- **Automatic Localization**: Uses system language for region-appropriate formatting
- **Thousand Separators**: Proper grouping separators based on locale (comma vs period)
- **Decimal Formatting**: Locale-aware decimal point representation
- **Error Handling**: Graceful fallback to "Invalid Number" for formatting errors
- **Null Safety**: Clean "–" display for missing or null values
- **Performance Optimized**: Memoized formatting with `$derived.by()`
- **International Standards**: Follows locale-specific number formatting conventions
-->

<script lang="ts">
	import { systemLanguage } from '@src/stores/store.svelte';

	let { value }: { value: number | null | undefined } = $props();

	// Get the user's current UI language.
	const lang = $derived($systemLanguage);

	// Format the number as a localized string.
	const formattedNumber = $derived.by(() => {
		if (typeof value !== 'number') return '–';
		try {
			// Use the browser's built-in localization for perfect formatting.
			return new Intl.NumberFormat(lang).format(value);
		} catch (e) {
			return 'Invalid Number';
		}
	});
</script>

<span>{formattedNumber}</span>
