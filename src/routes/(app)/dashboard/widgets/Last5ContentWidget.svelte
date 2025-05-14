<!--
@file: src/routes/(app)/dashboard/widgets/Last5ContentWidget.svelte
@component
**A reusable widget component for displaying last 5 content information with improved rendering and error handling**

@example
<Last5ContentWidget label="Last 5 Content" />

### Props
- `label`: The label for the widget (default: 'Last 5 Content')

This widget fetches and displays real-time disk usage data, including:
- Total disk space
- Used disk space
- Free disk space
- Usage percentages

### Features:
- Responsive doughnut chart visualization
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Proper lifecycle management
- Enhanced debugging and logging
-->

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	//import { dbAdapter } from '@src/databases/db';

	interface Props {
		label: string;
		theme: 'light' | 'dark';
	}

	let { label = 'Last 5 Content', theme = 'light' }: Props = $props();
	const themeType = theme as 'light' | 'dark';

	const contentInfo = writable<any[]>([]);
	const loading = writable<boolean>(true);
	const error = writable<string | null>(null);

	onMount(async () => {
		try {
			if (data) {
				//const data = await dbAdapter.getLastFiveCollections();
				contentInfo.set(data);
			}
			loading.set(false);
		} catch (err: unknown) {
			if (err instanceof Error) {
				error.set(err.message);
			} else {
				error.set('An unknown error occurred');
			}
			loading.set(false);
		}
	});
</script>

<BaseWidget {label} theme={themeType} endpoint="/api/last5Content" pollInterval={5000}>
	<div class="p-4">
		<h2 class="mb-4 text-xl font-bold">Last 5 Content</h2>
		{#if $loading}
			<p class="text-gray-600">Loading...</p>
		{:else if $error}
			<p class="text-red-500">Error: {$error}</p>
		{:else}
			<ul class="list-none p-0">
				{#each $contentInfo as content}
					<li class="mb-2 rounded-md border border-gray-300 bg-gray-100 p-2">{content.name}</li>
				{/each}
			</ul>
		{/if}
	</div>
</BaseWidget>
