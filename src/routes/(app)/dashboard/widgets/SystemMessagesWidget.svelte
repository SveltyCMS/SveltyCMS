<!--
@file src/routes/(app)/dashboard/widgets/SystemMessagesWidget.svelte
@component
**Dashboard widget for displaying system messages with improved rendering and error handling**

@example
<SystemMessagesWidget label="System Messages" />

### Props
- `label`: The label for the widget (default: 'System Messages')

Features:
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
		name: 'System Messages',
		icon: 'mdi:message-alert',
		defaultW: 2,
		defaultH: 2,
		validSizes: [
			{ w: 1, h: 1 },
			{ w: 2, h: 1 },
			{ w: 1, h: 2 },
			{ w: 2, h: 2 }
		]
	};

	import BaseWidget from '../BaseWidget.svelte';

	interface SystemMessage {
		title: string;
		timestamp: string;
		body: string;
	}

	let {
		label = 'System Messages',
		theme = 'light',
		icon = 'mdi:message-alert',
		widgetId = undefined,

		// New sizing props
		currentSize = '1/4',
		availableSizes = ['1/4', '1/2', '3/4', 'full'],
		onSizeChange = (newSize) => {},

		// Legacy props
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

		// New sizing props
		currentSize?: '1/4' | '1/2' | '3/4' | 'full';
		availableSizes?: ('1/4' | '1/2' | '3/4' | 'full')[];
		onSizeChange?: (newSize: '1/4' | '1/2' | '3/4' | 'full') => void;

		// Legacy props
		gridCellWidth?: number;
		ROW_HEIGHT?: number;
		GAP_SIZE?: number;
		resizable?: boolean;
		onResizeCommitted?: (spans: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
	}>();
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/systemMessages"
	pollInterval={30000}
	{icon}
	{widgetId}
	{currentSize}
	{availableSizes}
	{onSizeChange}
	{gridCellWidth}
	{ROW_HEIGHT}
	{GAP_SIZE}
	{resizable}
	{onResizeCommitted}
	{onCloseRequest}
>
	{#snippet children({ data: fetchedData })}
		{#if fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0}
			<div class="grid gap-2" style="max-height: 180px; overflow: hidden;" role="list" aria-label="System messages">
				{#each fetchedData.slice(0, 5) as message}
					<div class="rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem">
						<div class="flex items-start justify-between">
							<strong class="text-text-900 dark:text-text-100 text-sm" aria-label="Message title">{message.title}</strong>
							<small class="text-surface-500 dark:text-surface-400" aria-label="Timestamp">{new Date(message.timestamp).toLocaleString()}</small>
						</div>
						<p class="mt-1 text-surface-700 dark:text-surface-300" aria-label="Message body">{message.body}</p>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
				<iconify-icon icon="mdi:alert-circle-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"
				></iconify-icon>
				<span>No system messages</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
