<!--
@file src/widgets/core/date/Display.svelte
@component
**Date Widget Display Component**

Renders ISO 8601 date values in localized format using the browser's language settings.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example

<DateDisplay value="2025-09-24T00:00:00.000Z" />
Renders: 24.09.2025 (German) or 9/24/2025 (US) based on browser locale

### Props
- `value: DateWidgetData` - ISO 8601 date string from validated input

### Features
- **Automatic Localization**: Uses `document.documentElement.lang` for proper i18n
- **Intl.DateTimeFormat**: Leverages browser's native date formatting
- **Graceful Fallbacks**: Handles invalid dates and null values elegantly
- **Zero Dependencies**: Pure browser APIs for maximum compatibility
-->

<script lang="ts">
	import type { DateWidgetData } from './';

	let { value }: { value: DateWidgetData } = $props();

	// Get the user's preferred language from the browser
	const userLocale = document.documentElement.lang || 'de-DE'; // Default to German

	const formattedDate = $derived.by(() => {
		if (!value) return '–';
		try {
			// Use the browser's built-in localization to format the date correctly
			return new Intl.DateTimeFormat(userLocale).format(new Date(value));
		} catch (e) {
			return 'Invalid Date';
		}
	});
</script>

<span>{formattedDate}</span>
