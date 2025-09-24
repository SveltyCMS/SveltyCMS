<!--
@file src/widgets/core/dateTime/Display.svelte
@component
**DateTime Widget Display Component**

Renders ISO 8601 datetime values in localized format with full date and time display.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<DateTimeDisplay value="2025-09-24T14:30:00.000Z" />
Renders: "24. September 2025, 14:30" (German) or "September 24, 2025, 2:30 PM" (US)

### Props
- `value: DateTimeWidgetData` - ISO 8601 datetime string from validated input

### Features
- **Full DateTime Display**: Shows both date and time with locale-appropriate formatting
- **Automatic Localization**: Uses `document.documentElement.lang` for proper i18n
- **Intl.DateTimeFormat**: Leverages browser's native datetime formatting with custom options
- **Performance Optimized**: Memoized formatting with `$derived.by()` for efficiency
- **Graceful Fallbacks**: Handles invalid datetimes and null values elegantly
- **Rich Formatting**: Uses long month names and 24-hour time format for clarity
-->

<script lang="ts">
	import type { DateTimeWidgetData } from './';

	let { value }: { value: DateTimeWidgetData } = $props();

	// Get the user's preferred language from the browser.
	const userLocale = document.documentElement.lang || 'de-DE';

	// Memoize the formatted datetime for performance.
	const formattedDateTime = $derived.by(() => {
		if (!value) return '–';
		try {
			// Use Intl.DateTimeFormat for locale-aware, efficient datetime formatting.
			return new Intl.DateTimeFormat(userLocale, {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			}).format(new Date(value));
		} catch (e) {
			return 'Invalid DateTime';
		}
	});
</script>

<span>{formattedDateTime}</span>
