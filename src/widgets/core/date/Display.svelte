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

	let { value, format = 'medium' }: { value: DateWidgetData; format?: 'short' | 'medium' | 'long' | 'full' } = $props();

	// Get the user's preferred language from the browser
	const userLocale = document.documentElement.lang || 'en-US';

	// Date formatting options based on format prop
	const dateOptions = $derived.by(() => {
		switch (format) {
			case 'short':
				return { dateStyle: 'short' as const };
			case 'long':
				return { dateStyle: 'long' as const };
			case 'full':
				return { dateStyle: 'full' as const };
			case 'medium':
			default:
				return { dateStyle: 'medium' as const };
		}
	});

	const formattedDate = $derived.by(() => {
		if (!value) return '–';

		try {
			const date = new Date(value);
			if (isNaN(date.getTime())) return 'Invalid Date';

			// Use the browser's built-in localization to format the date correctly
			return new Intl.DateTimeFormat(userLocale, dateOptions).format(date);
		} catch (e) {
			console.warn('Date formatting error:', e);
			return 'Invalid Date';
		}
	});

	// Relative time for recent dates (optional enhancement)
	const relativeTime = $derived.by(() => {
		if (!value) return null;

		try {
			const date = new Date(value);
			const now = new Date();
			const diffTime = now.getTime() - date.getTime();
			const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

			if (diffDays === 0) return 'Today';
			if (diffDays === 1) return 'Yesterday';
			if (diffDays === -1) return 'Tomorrow';
			if (diffDays > 1 && diffDays <= 7) return `${diffDays} days ago`;
			if (diffDays < -1 && diffDays >= -7) return `In ${Math.abs(diffDays)} days`;

			return null; // Use formatted date for older dates
		} catch {
			return null;
		}
	});
</script>

<span class="date-display" title={value ? new Date(value).toISOString() : undefined}>
	{relativeTime || formattedDate}
</span>

<style lang="postcss">
	.date-display {
		@apply text-gray-900 dark:text-gray-100;
		@apply font-medium;
	}
</style>
