<!--
@file src/routes/(app)/dashboard/widgets/SystemMessagesWidget.svelte
@component
**Dashboard widget for displaying system messages with improved rendering and error handling**

@example
<SystemMessagesWidget label="System Messages" />

### Props
- `label`: The label for the widget (default: 'System Messages')

### Features:
- Responsive doughnut chart visualization
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Enhanced debugging and logging
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'System Messages',
		icon: 'mdi:message-alert-outline',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	import type { WidgetSize } from '@src/content/types';

	// Defines the structure for a single system message.
	interface SystemMessage {
		title: string;
		timestamp: string;
		body: string;
	}

	// Defines the shape of the data payload fetched from the API.
	type FetchedData = SystemMessage[] | undefined;

	const {
		label = 'System Messages',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:message-alert-outline',
		widgetId = undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = (_newSize: WidgetSize) => {},
		onRemove = () => {}
	}: {
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		onRemove?: () => void;
	} = $props();
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/systemMessages"
	pollInterval={30000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: fetchedData }: { data: FetchedData })}
		{#if fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0}
			<div class="grid gap-2" style="max-height: calc({size.h} * 120px - 40px); overflow-y: auto;" role="list" aria-label="System messages">
				{#each fetchedData.slice(0, 5) as message}
					<div class="rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem">
						<div class="flex items-start justify-between">
							<strong class="text-text-900 dark:text-text-100 text-sm" aria-label="Message title">{message.title}</strong>
							<small class="shrink-0 pl-2 text-surface-500 dark:text-surface-400" aria-label="Timestamp">
								{new Date(message.timestamp).toLocaleString()}
							</small>
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
