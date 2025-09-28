<!--
@file src/widgets/core/dateTime/Display.svelte
@component
**DateTime Widget Display Component**

Renders ISO 8601 datetime values in localized format with full date and time display.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<DateTimeDisplay value="2025-09-24T14:30:00.000Z" format="medium" />
Renders: "24. September 2025, 14:30" (German) or "September 24, 2025, 2:30 PM" (US)

### Props
- `value: DateTimeWidgetData` - ISO 8601 datetime string from validated input
- `format?: 'short' | 'medium' | 'long' | 'full'` - Display format option

### Features
- **Full DateTime Display**: Shows both date and time with locale-appropriate formatting
- **Multiple Format Options**: Short, medium, long, and full datetime formats
- **Automatic Localization**: Uses `document.documentElement.lang` for proper i18n
- **Intl.DateTimeFormat**: Leverages browser's native datetime formatting with custom options
- **Performance Optimized**: Memoized formatting with `$derived.by()` for efficiency
- **Relative Time Context**: Shows if datetime is in past, present, or future
- **Graceful Fallbacks**: Handles invalid datetimes and null values elegantly
- **Rich Formatting**: Uses appropriate date/time styles for clarity
-->

<script lang="ts">
	import type { DateTimeWidgetData } from './';

	let { value, format = 'medium' }: { value: DateTimeWidgetData | null | undefined; format?: 'short' | 'medium' | 'long' | 'full' } = $props();

	// Get the user's preferred language from the browser.
	const userLocale = document.documentElement.lang || 'en-US';

	// Create formatters for efficiency.
	const dateTimeFormatter = $derived.by(() => {
		const options: Intl.DateTimeFormatOptions = {
			year: 'numeric',
			month: format === 'short' ? 'short' : format === 'long' ? 'long' : 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		};

		if (format === 'full') {
			options.second = '2-digit';
			options.timeZoneName = 'short';
		}

		return new Intl.DateTimeFormat(userLocale, options);
	});

	// Memoize the formatted datetime for performance.
	const formattedDateTime = $derived.by(() => {
		if (!value) return '–';
		try {
			const date = new Date(value);
			if (isNaN(date.getTime())) {
				return 'Invalid DateTime';
			}
			return dateTimeFormatter.format(date);
		} catch (e) {
			console.warn('DateTime formatting error:', e);
			return 'Invalid DateTime';
		}
	});

	// Relative time context
	const relativeContext = $derived.by(() => {
		if (!value) return null;

		try {
			const now = new Date();
			const dateTime = new Date(value);
			const diffMs = dateTime.getTime() - now.getTime();
			const diffMinutes = Math.abs(diffMs) / (1000 * 60);

			if (diffMinutes < 1) return 'Now';
			if (diffMinutes < 60) return diffMs > 0 ? 'Soon' : 'Recently';
			if (diffMinutes < 1440) return diffMs > 0 ? 'Today' : 'Yesterday';

			const diffDays = Math.abs(diffMs) / (1000 * 60 * 60 * 24);
			if (diffDays < 7) return diffMs > 0 ? 'This week' : 'Last week';
			if (diffDays < 30) return diffMs > 0 ? 'This month' : 'Last month';

			return diffMs > 0 ? 'Future' : 'Past';
		} catch {
			return null;
		}
	});

	// Timezone information
	const timezoneInfo = $derived.by(() => {
		if (!value || format !== 'full') return null;

		try {
			const date = new Date(value);
			const timezone = Intl.DateTimeFormat(userLocale, {
				timeZoneName: 'long'
			})
				.formatToParts(date)
				.find((part) => part.type === 'timeZoneName')?.value;

			return timezone || null;
		} catch {
			return null;
		}
	});
</script>

<span class="datetime-display" title={value ? new Date(value).toISOString() : undefined}>
	{formattedDateTime}
	{#if relativeContext && relativeContext !== 'Now'}
		<span class="context context-{relativeContext.toLowerCase().replace(' ', '-')}" aria-label="Time context: {relativeContext}"
			>{relativeContext}</span
		>
	{/if}
	{#if timezoneInfo}
		<span class="timezone" aria-label="Timezone: {timezoneInfo}">({timezoneInfo})</span>
	{/if}
</span>

<style lang="postcss">
	.datetime-display {
		@apply font-medium text-gray-900 dark:text-gray-100;
	}

	.context {
		@apply ml-2 rounded-full px-2 py-0.5 text-xs font-medium;
	}

	.context-now {
		@apply bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200;
	}

	.context-soon {
		@apply bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200;
	}

	.context-recently {
		@apply bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200;
	}

	.context-today {
		@apply bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200;
	}

	.context-yesterday {
		@apply bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200;
	}

	.context-this-week {
		@apply bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200;
	}

	.context-last-week {
		@apply bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200;
	}

	.context-this-month {
		@apply bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200;
	}

	.context-last-month {
		@apply bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200;
	}

	.context-future {
		@apply bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200;
	}

	.context-past {
		@apply bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300;
	}

	.timezone {
		@apply ml-2 text-sm font-normal text-gray-500 dark:text-gray-400;
	}
</style>
