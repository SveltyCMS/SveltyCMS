<script lang="ts">
	import type { DateRangeWidgetData } from './';

	let { value }: { value: DateRangeWidgetData | null | undefined } = $props();

	// Get the user's preferred language from the browser.
	const userLocale = document.documentElement.lang || 'de-DE';

	// Create a single formatter for efficiency.
	const formatter = new Intl.DateTimeFormat(userLocale, {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});

	// Memoize the formatted range string for performance.
	const formattedRange = $derived.by(() => {
		if (!value?.start || !value?.end) return '–';
		try {
			const start = formatter.format(new Date(value.start));
			const end = formatter.format(new Date(value.end));
			return `${start} → ${end}`;
		} catch (e) {
			return 'Invalid Range';
		}
	});
</script>

<span>{formattedRange}</span>
