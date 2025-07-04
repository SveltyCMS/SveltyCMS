<!--
@file src/routes/(app)/dashboard/widgets/Last5ContentWidget.svelte
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
	export const widgetMeta = {
		name: 'Last 5 Content',
		icon: 'mdi:file-document-multiple',
		defaultW: 2,
		defaultH: 2,
		validSizes: [
			{ w: 1, h: 1 },
			{ w: 2, h: 2 },
			{ w: 2, h: 1 },
			{ w: 1, h: 2 }
		]
	};

	import BaseWidget from '../BaseWidget.svelte';

	interface ContentItem {
		id: string;
		title: string;
		collection: string;
		createdAt: string;
		createdBy: string;
		status: string;
	}

	let {
		label = 'Recent Content',
		theme = 'light',
		icon = 'mdi:file-document-multiple',
		widgetId = undefined,
		gridCellWidth = 0,
		ROW_HEIGHT = 0,
		GAP_SIZE = 0,
		resizable = true,
		onResizeCommitted = (spans: { w: number; h: number }) => {},
		onCloseRequest = () => {}
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		gridCellWidth: number;
		ROW_HEIGHT: number;
		GAP_SIZE: number;
		resizable?: boolean;
		onResizeCommitted?: (spans: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
	}>();

	function getStatusIcon(status: string): string {
		switch (status.toLowerCase()) {
			case 'published':
				return 'mdi:check-circle';
			case 'draft':
				return 'mdi:pencil-circle';
			case 'archived':
				return 'mdi:archive';
			default:
				return 'mdi:file-document';
		}
	}

	function getStatusColor(status: string): string {
		switch (status.toLowerCase()) {
			case 'published':
				return 'text-green-500';
			case 'draft':
				return 'text-yellow-500';
			case 'archived':
				return 'text-gray-500';
			default:
				return 'text-blue-500';
		}
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/last5Content"
	pollInterval={30000}
	{icon}
	{widgetId}
	{gridCellWidth}
	{ROW_HEIGHT}
	{GAP_SIZE}
	{resizable}
	{onResizeCommitted}
	{onCloseRequest}
>
	{#snippet children({ data: fetchedData })}
		<div
			class="relative h-full w-full rounded-lg bg-surface-50 p-2 text-tertiary-500 transition-colors duration-300 ease-in-out dark:bg-surface-400 dark:text-primary-500"
			aria-label="Recent Content Widget"
		>
			<h2 class="flex items-center justify-center gap-2 text-center font-bold">
				<iconify-icon icon="mdi:file-document-multiple" width="20" class="text-primary-500"></iconify-icon>
				Recent Content
			</h2>
			{#if fetchedData && Array.isArray(fetchedData)}
				<div class="mt-2 max-h-40 space-y-2 overflow-y-auto">
					{#each fetchedData as content}
						<div class="flex items-center justify-between rounded bg-surface-100 p-2 text-xs dark:bg-surface-500">
							<div class="flex items-center gap-2">
								<iconify-icon icon={getStatusIcon(content.status)} class={getStatusColor(content.status)}></iconify-icon>
								<div class="flex flex-col">
									<span class="max-w-32 truncate font-medium" title={content.title}>{content.title}</span>
									<span class="text-xs text-surface-500 dark:text-surface-400">
										{content.collection}
									</span>
								</div>
							</div>
							<div class="flex flex-col items-end">
								<span class="capitalize text-surface-600 dark:text-surface-300">
									{content.status}
								</span>
								<span class="text-xs text-surface-500 dark:text-surface-400">
									{content.createdBy}
								</span>
							</div>
						</div>
					{/each}
				</div>
				<div class="mt-2 text-center text-xs text-surface-600 dark:text-surface-400">
					Total Items: {fetchedData.length}
				</div>
			{:else}
				<div class="flex h-full flex-col items-center justify-center text-xs text-gray-500 dark:text-gray-400">
					<iconify-icon icon="eos-icons:loading" width="24" class="mb-1"></iconify-icon>
					<span>Loading content...</span>
				</div>
			{/if}
		</div>
	{/snippet}
</BaseWidget>
