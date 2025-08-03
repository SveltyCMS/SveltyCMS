<!--
@file src/routes/(app)/dashboard/widgets/Last5ContentWidget.svelte
@component
**A reusable widget component for displaying last 5 content information with improved rendering and error handling**

@example
<Last5ContentWidget label="Last 5 Content" />

### Props
- `label`: The label for the widget (default: 'Last 5 Content')

This widget fetches and displays the latest content items, including:
- Content title and collection
- Creation date and author
- Publication status
- Status indicators

### Features:
- Clean list-based visualization
- Theme-aware rendering (light/dark mode support)
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'Last 5 Content',
		icon: 'mdi:file-document-multiple-outline',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { formatDistanceToNow } from 'date-fns';

	interface ContentItem {
		id: string;
		title: string;
		collection: string;
		createdAt: string;
		createdBy: string;
		status: string;
	}

	type FetchedData = ContentItem[] | undefined;

	let {
		label = 'Last 5 Content',
		theme = 'light',
		icon = 'mdi:file-document-multiple-outline',
		widgetId = undefined,
		size = { w: 1, h: 1 },
		onSizeChange = (newSize: { w: number; h: number }) => {},
		onCloseRequest = () => {}
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: { w: number; h: number };
		onSizeChange?: (newSize: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
	}>();

	function getStatusColor(status: string) {
		switch (status.toLowerCase()) {
			case 'published':
				return 'bg-green-500';
			case 'draft':
				return 'bg-yellow-500';
			case 'archived':
				return 'bg-gray-500';
			default:
				return 'bg-gray-400';
		}
	}
</script>

<BaseWidget {label} {theme} endpoint="/api/dashboard/last5Content" pollInterval={30000} {icon} {widgetId} {size} {onSizeChange} {onCloseRequest}>
	{#snippet children({ data: fetchedData }: { data: FetchedData })}
		{#if fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0}
			<div class="grid gap-2" style="max-height: 180px; overflow-y: auto;" role="list" aria-label="Last 5 content items">
				{#each fetchedData.slice(0, 5) as item (item.id)}
					<div class="flex items-center justify-between rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem">
						<div class="flex min-w-0 items-center gap-2">
							<div class="h-2 w-2 rounded-full {getStatusColor(item.status)}" title="Status: {item.status}"></div>
							<div class="flex min-w-0 flex-col">
								<span class="text-text-900 dark:text-text-100 truncate font-medium" title={item.title}>
									{item.title}
								</span>
								<span class="text-xs text-surface-500 dark:text-surface-400" title={`Collection: ${item.collection}`}>
									{item.collection}
								</span>
							</div>
						</div>
						<div class="flex flex-col items-end">
							<span class="text-xs font-medium uppercase text-surface-600 dark:text-surface-300">
								{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
							</span>
							<span class="text-xs text-surface-500 dark:text-surface-400" title={`By: ${item.createdBy}`}>
								{item.createdBy}
							</span>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
				<iconify-icon icon="mdi:file-remove-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"></iconify-icon>
				<span>No content found</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
