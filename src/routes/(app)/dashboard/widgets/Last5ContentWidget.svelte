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
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Proper lifecycle management
- Enhanced accessibility support
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Last 5 Content',
		icon: 'mdi:file-document-multiple',
		defaultSize: '1/2'
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';

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
		icon = 'mdi:file-document-multiple',
		widgetId = undefined,
		size = '1/2',
		onSizeChange = (newSize) => {},
		onCloseRequest = () => {}
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: '1/4' | '1/2' | '3/4' | 'full';
		onSizeChange?: (newSize: '1/4' | '1/2' | '3/4' | 'full') => void;
		onCloseRequest?: () => void;
	}>();

	function getStatusIcon(status: string): string {
		if (!status) return 'mdi:file-document'; // Guard against undefined status
		switch (status.toLowerCase()) {
			case 'published':
				return 'mdi:check-circle';
			case 'draft':
				return 'mdi:pencil-circle';
			case 'archive':
				return 'mdi:archive';
			default:
				return 'mdi:file-document';
		}
	}

	function formatDate(dateString: string): string {
		try {
			const date = new Date(dateString);
			return date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
			});
		} catch (error) {
			return 'Unknown';
		}
	}

	function formatAuthor(author: string): string {
		// Truncate long author names
		return author.length > 12 ? author.substring(0, 12) + '...' : author;
	}

	function getStatusColorClass(status: string): string {
		if (!status) return 'text-surface-600 dark:text-surface-300'; // Guard against undefined status
		switch (status.toLowerCase()) {
			case 'published':
				return 'text-green-600 dark:text-green-400';
			case 'draft':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'archive':
				return 'text-gray-600 dark:text-gray-400';
			default:
				return 'text-surface-600 dark:text-surface-300';
		}
	}
</script>

<BaseWidget {label} {theme} endpoint="/api/dashboard/last5Content" pollInterval={30000} {icon} {widgetId} {size} {onSizeChange} {onCloseRequest}>
	{#snippet children({ data: fetchedData }: { data: FetchedData })}
		{#if fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0}
			<div class="grid gap-2" style="max-height: 180px; overflow-y: auto;" role="list" aria-label="Last 5 content items">
				{#each fetchedData.slice(0, 5) as content (content.id)}
					<div class="flex items-center justify-between rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem">
						<div class="flex min-w-0 items-center gap-2">
							<iconify-icon
								icon={getStatusIcon(content.status)}
								class="flex-shrink-0 text-primary-400"
								width="18"
								aria-label={content.status + ' status icon'}
							></iconify-icon>
							<div class="flex min-w-0 flex-col">
								<span class="text-text-900 dark:text-text-100 truncate font-medium" title={content.title}>
									{content.title}
								</span>
								<span class="text-xs text-surface-500 dark:text-surface-400" title={content.collection}>
									{content.collection}
								</span>
							</div>
						</div>
						<div class="flex flex-col items-end">
							<span class="text-xs font-medium uppercase {getStatusColorClass(content.status)}">
								{content.status}
							</span>
							<span class="text-xs text-surface-500 dark:text-surface-400" title={`Created: ${formatDate(content.createdAt)}`}>
								{formatDate(content.createdAt)}
							</span>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
				<iconify-icon icon="mdi:file-document-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"
				></iconify-icon>
				<span>No content found</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
