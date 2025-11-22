<!--
@file src/widgets/core/DateRange/Display.svelte
@component
**DateRange Display Component**

A lightweight renderer for the DateRange widget. Formats a `{ start, end }` value
(ISO 8601 strings) into a human-readable date range string with duration and context.

@example
<DateRangeDisplay value={value} format="medium" />

#### Props
- `value: DateRangeWidgetData | null | undefined` - The date range value ({ start, end })
- `format?: 'short' | 'medium' | 'long' | 'full'` - Display month formatting (default: 'medium')

#### Features
- Compact synchronous renderer optimized for lists
- Shows duration (days, weeks, months, years)
- Shows temporal context (Current / Past / Future)
- Locale-aware formatting using browser locale
- Single date display when start equals end
- Graceful error handling
-->

<script lang="ts">
	import type { DateRangeWidgetData } from './';
	import { logger } from '@utils/logger';

	interface Props {
		value: DateRangeWidgetData | null | undefined;
		format?: 'short' | 'medium' | 'long' | 'full';
	}

	const { value, format = 'medium' }: Props = $props();

	// Get the user's preferred language from the browser
	const userLocale = $derived(typeof document !== 'undefined' ? document.documentElement.lang || 'en-US' : 'en-US');

	/**
	 * Format the date range string
	 */
	const formattedRange = $derived.by(() => {
		if (!value?.start || !value?.end) return '–';

		try {
			const start = new Date(value.start);
			const end = new Date(value.end);

			if (isNaN(start.getTime()) || isNaN(end.getTime())) {
				return 'Invalid Range';
			}

			const dateFormatter = new Intl.DateTimeFormat(userLocale, {
				year: 'numeric',
				month: format === 'short' ? 'short' : 'long',
				day: 'numeric'
			});

			const startFormatted = dateFormatter.format(start);
			const endFormatted = dateFormatter.format(end);

			// If dates are the same, show single date
			if (start.toDateString() === end.toDateString()) {
				return startFormatted;
			}

			return `${startFormatted} → ${endFormatted}`;
		} catch (e) {
			logger.warn('Date range formatting error:', e);
			return 'Invalid Range';
		}
	});

	/**
	 * Calculate duration for additional context
	 */
	const duration = $derived.by(() => {
		if (!value?.start || !value?.end) return null;

		try {
			const start = new Date(value.start);
			const end = new Date(value.end);
			const diffTime = end.getTime() - start.getTime();
			const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

			if (diffDays === 1) return '1 day';
			if (diffDays < 7) return `${diffDays} days`;
			if (diffDays < 30) {
				const weeks = Math.ceil(diffDays / 7);
				return `${weeks} week${weeks > 1 ? 's' : ''}`;
			}
			if (diffDays < 365) {
				const months = Math.ceil(diffDays / 30);
				return `${months} month${months > 1 ? 's' : ''}`;
			}
			const years = Math.ceil(diffDays / 365);
			return `${years} year${years > 1 ? 's' : ''}`;
		} catch {
			return null;
		}
	});

	/**
	 * Determine temporal context (Current / Past / Future)
	 */
	const relativeContext = $derived.by(() => {
		if (!value?.start || !value?.end) return null;

		try {
			const now = new Date();
			const start = new Date(value.start);
			const end = new Date(value.end);

			if (start <= now && end >= now) return 'Current';
			if (end < now) return 'Past';
			if (start > now) return 'Future';

			return null;
		} catch {
			return null;
		}
	});

	/**
	 * Get context badge classes
	 */
	const contextClasses = $derived.by(() => {
		const baseClasses = 'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
		const contextMap = {
			Current: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
			Past: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
			Future: 'bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200'
		};
		return `${baseClasses} ${relativeContext ? contextMap[relativeContext as keyof typeof contextMap] : ''}`;
	});

	/**
	 * Get tooltip text
	 */
	const tooltipText = $derived.by(() => {
		if (!value?.start || !value?.end) return undefined;
		try {
			const start = new Date(value.start).toISOString();
			const end = new Date(value.end).toISOString();
			return `${start} to ${end}`;
		} catch {
			return undefined;
		}
	});
</script>

<span class="inline-flex items-center font-medium text-gray-900 dark:text-gray-100" title={tooltipText}>
	<span>{formattedRange}</span>
	{#if duration}
		<span class="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400" aria-label="Duration: {duration}">
			({duration})
		</span>
	{/if}
	{#if relativeContext}
		<span class={contextClasses} aria-label="Time context: {relativeContext}">
			{relativeContext}
		</span>
	{/if}
</span>
