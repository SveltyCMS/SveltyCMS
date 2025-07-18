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
	// --- Widget Metadata ---
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
	import { m } from '@src/paraglide/messages';

	// --- Type Definitions ---
	// Defines the structure for a single system message.
	interface SystemMessage {
		title: string;
		timestamp: string;
		body: string;
	}

	// Defines the shape of the data payload fetched from the API.
	type FetchedData = SystemMessage[];

	// Type alias for widget size options.
	type Size = '1/4' | '1/2' | '3/4' | 'full';

	// --- Component Props ---
	let {
		label = m.systemMessagesWidget_label(),
		theme = 'light',
		icon = 'mdi:message-alert',
		widgetId = undefined,
		currentSize = '1/4',
		availableSizes = ['1/4', '1/2', '3/4', 'full'],
		// FIX: Added types and prefixed unused parameters with an underscore.
		onSizeChange = (_newSize: Size) => {},
		draggable = true,
		onDragStart = (_event: MouseEvent, _item: any, _element: HTMLElement) => {},
		gridCellWidth = 0,
		ROW_HEIGHT = 0,
		GAP_SIZE = 0,
		resizable = true,
		onResizeCommitted = (_spans: { w: number; h: number }) => {},
		onCloseRequest = () => {}
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		currentSize?: Size;
		availableSizes?: Size[];
		onSizeChange?: (newSize: Size) => void;
		draggable?: boolean;
		onDragStart?: (event: MouseEvent, item: any, element: HTMLElement) => void;
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
	endpoint="/api/dashboard/systemMessages"
	pollInterval={30000}
	{icon}
	{widgetId}
	{currentSize}
	{availableSizes}
	{onSizeChange}
	{draggable}
	{onDragStart}
	{gridCellWidth}
	{ROW_HEIGHT}
	{GAP_SIZE}
	{resizable}
	{onResizeCommitted}
	{onCloseRequest}
>
	<!-- FIX: Explicitly typed the 'data' prop from the snippet to resolve 'never' type errors. -->
	{#snippet children({ data: fetchedData }: { data: FetchedData | undefined })}
		<!-- This check now correctly narrows the type of 'fetchedData' to 'SystemMessage[]' -->
		{#if fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0}
			<div class="grid gap-2" style="max-height: 180px; overflow-y: auto;" role="list" aria-label={m.systemMessagesWidget_listAriaLabel()}>
				{#each fetchedData.slice(0, 5) as message}
					<div class="rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem">
						<div class="flex items-start justify-between">
							<strong class="text-text-900 dark:text-text-100 text-sm" aria-label={m.systemMessagesWidget_titleAriaLabel()}>{message.title}</strong>
							<small class="flex-shrink-0 pl-2 text-surface-500 dark:text-surface-400" aria-label={m.systemMessagesWidget_timestampAriaLabel()}>{new Date(message.timestamp).toLocaleString()}</small>
						</div>
						<p class="mt-1 text-surface-700 dark:text-surface-300" aria-label={m.systemMessagesWidget_bodyAriaLabel()}>{message.body}</p>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
				<iconify-icon icon="mdi:alert-circle-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"></iconify-icon>
				<span>{m.systemMessagesWidget_noMessages()}</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
