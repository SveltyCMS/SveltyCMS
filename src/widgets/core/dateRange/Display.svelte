<script lang="ts">
	import type { DateRangeWidgetData } from './';

	let { value, format = 'medium' }: { value: DateRangeWidgetData | null | undefined; format?: 'short' | 'medium' | 'long' | 'full' } = $props();

	// Get the user's preferred language from the browser.
	const userLocale = document.documentElement.lang || 'en-US';

	// Create formatters for efficiency.
	const dateFormatter = new Intl.DateTimeFormat(userLocale, {
		year: 'numeric',
		month: format === 'short' ? 'short' : format === 'long' ? 'long' : 'long',
		day: 'numeric'
	});

	// Memoize the formatted range string for performance.
	const formattedRange = $derived.by(() => {
		if (!value?.start || !value?.end) return '–';

		try {
			const start = new Date(value.start);
			const end = new Date(value.end);

			if (isNaN(start.getTime()) || isNaN(end.getTime())) {
				return 'Invalid Range';
			}

			const startFormatted = dateFormatter.format(start);
			const endFormatted = dateFormatter.format(end);

			// If dates are the same, show single date
			if (start.toDateString() === end.toDateString()) {
				return startFormatted;
			}

			return `${startFormatted} → ${endFormatted}`;
		} catch (e) {
			console.warn('Date range formatting error:', e);
			return 'Invalid Range';
		}
	});

	// Calculate duration for additional context
	const duration = $derived.by(() => {
		if (!value?.start || !value?.end) return null;

		try {
			const start = new Date(value.start);
			const end = new Date(value.end);
			const diffTime = end.getTime() - start.getTime();
			const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

			if (diffDays === 1) return '1 day';
			if (diffDays < 7) return `${diffDays} days`;
			if (diffDays < 30) return `${Math.ceil(diffDays / 7)} week${Math.ceil(diffDays / 7) > 1 ? 's' : ''}`;
			if (diffDays < 365) return `${Math.ceil(diffDays / 30)} month${Math.ceil(diffDays / 30) > 1 ? 's' : ''}`;
			return `${Math.ceil(diffDays / 365)} year${Math.ceil(diffDays / 365) > 1 ? 's' : ''}`;
		} catch {
			return null;
		}
	});

	// Relative time context
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
</script>

<span class="date-range-display" title={value ? `${new Date(value.start).toISOString()} to ${new Date(value.end).toISOString()}` : undefined}>
	{formattedRange}
	{#if duration}
		<span class="duration" aria-label="Duration: {duration}">({duration})</span>
	{/if}
	{#if relativeContext}
		<span class="context context-{relativeContext.toLowerCase()}" aria-label="Time context: {relativeContext}">{relativeContext}</span>
	{/if}
</span>

<style lang="postcss">
	.date-range-display {
		@apply font-medium text-gray-900 dark:text-gray-100;
	}

	.duration {
		@apply ml-2 text-sm font-normal text-gray-500 dark:text-gray-400;
	}

	.context {
		@apply ml-2 rounded-full px-2 py-0.5 text-xs font-medium;
	}

	.context-current {
		@apply bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200;
	}

	.context-past {
		@apply bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300;
	}

	.context-future {
		@apply bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200;
	}
</style>
