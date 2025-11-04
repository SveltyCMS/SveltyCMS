<!--
@file src/widgets/core/date/Display.svelte
@component
**Date Widget Display Component**

Renders ISO 8601 date values in localized format using the browser's language settings.
Part of the Three Pillars Architecture for widget system.

@example
<DateDisplay value="2025-09-24T00:00:00.000Z" />
<DateDisplay value="2025-09-24T00:00:00.000Z" format="long" showRelative={true} />

#### Props
- `value: DateWidgetData` - ISO 8601 date string from validated input
- `format: 'short' | 'medium' | 'long' | 'full'` - Date format style (default: 'medium')
- `showRelative: boolean` - Show relative time for recent dates (default: true)

#### Features
- Automatic localization using browser locale
- Intl.DateTimeFormat for native date formatting
- Relative time for recent dates (Today, Yesterday, etc.)
- Graceful fallbacks for invalid dates
- Tooltip with ISO string
- Zero dependencies
-->

<script lang="ts">
	import type { DateWidgetData } from './';

	interface Props {
		value: DateWidgetData;
		format?: 'short' | 'medium' | 'long' | 'full';
		showRelative?: boolean;
	}

	let { value, format = 'medium', showRelative = true }: Props = $props();

	// Get the user's preferred language from the browser
	const userLocale = $derived(typeof document !== 'undefined' ? document.documentElement.lang || 'en-US' : 'en-US');

	// Get date formatting options based on format prop
	const dateOptions = $derived.by(() => {
		const optionsMap = {
			short: { dateStyle: 'short' as const },
			medium: { dateStyle: 'medium' as const },
			long: { dateStyle: 'long' as const },
			full: { dateStyle: 'full' as const }
		};
		return optionsMap[format];
	});

	// Calculate relative time for recent dates
	const relativeTime = $derived.by(() => {
		if (!value || !showRelative) return null;

		try {
			const date = new Date(value);
			if (isNaN(date.getTime())) return null;

			const now = new Date();
			const diffTime = now.getTime() - date.getTime();
			const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

			// Return relative time for dates within a week
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

	// Format date using Intl.DateTimeFormat
	const formattedDate = $derived.by(() => {
		if (!value) return '–';

		try {
			const date = new Date(value);
			if (isNaN(date.getTime())) return 'Invalid Date';

			return new Intl.DateTimeFormat(userLocale, dateOptions).format(date);
		} catch (e) {
			console.warn('Date formatting error:', e);
			return 'Invalid Date';
		}
	});

	// Get ISO string for tooltip
	const isoString = $derived.by(() => {
		if (!value) return undefined;
		try {
			const date = new Date(value);
			return isNaN(date.getTime()) ? undefined : date.toISOString();
		} catch {
			return undefined;
		}
	});

	// Final display text
	const displayText = $derived(relativeTime || formattedDate);
</script>

<time class="inline-flex items-center font-medium text-gray-900 dark:text-gray-100" title={isoString} datetime={isoString}>
	{#if relativeTime}
		<span class="mr-1 text-primary-600 dark:text-primary-400">
			{displayText}
		</span>
		<span class="text-xs text-gray-500 dark:text-gray-400">
			({formattedDate})
		</span>
	{:else}
		{displayText}
	{/if}
</time>
