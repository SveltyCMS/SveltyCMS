<!--
@file src/widgets/custom/Number/Display.svelte
@component
**Number Widget Display Component**

Displays numeric values with proper localization and thousand separators.
Part of the Three Pillars Architecture for widget system.

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
	import { app } from '@src/stores/store.svelte';

	const { value, field }: { value: number | null | undefined; field?: any } = $props();

	// Get the user's current UI language.
	const lang = $derived(app.systemLanguage);

	// Format the number as a localized string.
	const formattedNumber = $derived.by(() => {
		if (typeof value !== 'number') {
			return '–';
		}
		try {
			// Use the browser's built-in localization for perfect formatting.
			return new Intl.NumberFormat(lang).format(value);
		} catch (_e) {
			return 'Invalid Number';
		}
	});
</script>

<div class="number-display inline-flex items-center gap-1.5 font-semibold text-surface-900 dark:text-surface-50">
	{#if typeof value === 'number'}
		<iconify-icon icon="mdi:numeric" width="16" class="text-surface-400 dark:text-surface-500"></iconify-icon>
		
		{#if (field as any)?.prefix}
			<span class="text-xs text-surface-400 font-normal">{(field as any).prefix}</span>
		{/if}

		<span>{formattedNumber}</span>

		{#if (field as any)?.suffix}
			<span class="text-xs text-surface-400 font-normal">{(field as any).suffix}</span>
		{/if}
	{:else}
		<span class="text-surface-400 dark:text-surface-600">–</span>
	{/if}
</div>

<style>
	.number-display {
		font-family: inherit;
		letter-spacing: -0.01em;
	}
</style>
