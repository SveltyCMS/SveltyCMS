<!--
@file src/routes/(app)/dashboard/BaseWidget.svelte
@component
**Base widget component providing common functionality for all dashboard widgets**



### Props
- `label`: The widget's display label
- `theme`: Current theme ('light' or 'dark')
- `endpoint`: API endpoint for data fetching
- `pollInterval`: Data refresh interval in milliseconds (default: 5000)
- `data`: Bindable data property for widget content

### Features:
- Common properties for all widgets
- State management using Svelte 5 runes
- Polling effect for real-time data updates
- Error handling and logging

-->

<script lang="ts">
	// Common props for all widgets
	const {
		label,
		theme = 'light',
		endpoint,
		pollInterval = 5000,
		data: initialData = $bindable(),
		children
	} = $props<{
		label: string;
		theme: 'light' | 'dark';
		endpoint: string;
		pollInterval: number;
		data?: any;
		children?: () => any;
	}>();

	let data = $state(initialData);

	// Reactive state using Svelte 5 runes
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Function to create a polling effect
	function createPollingEffect(options: { interval: number; callback: () => Promise<void>; immediate: boolean }) {
		let intervalId: NodeJS.Timeout;

		const startPolling = () => {
			intervalId = setInterval(options.callback, options.interval);
		};

		const stopPolling = () => {
			clearInterval(intervalId);
		};

		if (options.immediate) {
			options.callback().then(() => startPolling());
		} else {
			startPolling();
		}

		return {
			cleanup: stopPolling
		};
	}

	// Create polling effect using the custom function
	$effect(() => {
		const { cleanup } = createPollingEffect({
			interval: pollInterval,
			callback: async () => {
				try {
					loading = true;
					error = null;

					const timestamp = new Date().getTime();
					const res = await fetch(`${endpoint}?_=${timestamp}`);

					if (!res.ok) throw new Error(`HTTP ${res.status}`);

					const newData = await res.json();
					data = newData;
				} catch (err) {
					error = err instanceof Error ? err.message : 'Failed to fetch data';
					console.error('Error fetching data:', error);
				} finally {
					loading = false;
				}
			},
			immediate: true
		});

		return cleanup;
	});
</script>

<!-- Common widget structure -->
<div
	class="widget-container flex h-full flex-col rounded-md p-4"
	class:bg-surface-100={theme === 'light'}
	class:text-text-900={theme === 'light'}
	class:bg-surface-700={theme === 'dark'}
	class:text-text-100={theme === 'dark'}
	aria-label={`${label} widget`}
>
	<h2 class="widget-title mb-4 text-xl font-bold">{label}</h2>

	{#if loading && !data}
		<div class="loading-state flex flex-1 items-center justify-center text-center">Loading...</div>
	{:else if error && !data}
		<div class="error-state flex flex-1 items-center justify-center text-center text-error-500">Error: {error}</div>
	{:else}
		<!-- Widget-specific content goes here -->
		{@render children?.({ data })}
	{/if}
</div>
