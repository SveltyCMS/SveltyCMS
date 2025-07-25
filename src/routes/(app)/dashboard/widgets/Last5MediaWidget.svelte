<!--
@file src/routes/(app)/dashboard/widgets/Last5MediaWidget.svelte
@component
**A reusable widget component for displaying last 5 media information with improved rendering and error handling**

@example
<Last5MediaWidget label="Last 5 Media" />

### Props
- `label`: The label for the widget (default: 'Last 5 Media')

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
		name: 'Last 5 Media',
		icon: 'mdi:image-multiple',
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
	import { m } from '@src/paraglide/messages';

	interface MediaFile {
		name: string;
		size: number;
		modified: string;
		type: string;
		url: string;
	}

	let {
		label = m.last5MediaWidget_label(),
		theme = 'light',
		icon = 'mdi:image-multiple',
		widgetId = undefined,

		// New sizing props
		currentSize = '1/4',
		availableSizes = ['1/4', '1/2', '3/4', 'full'],
		onSizeChange = (newSize) => {},

		// Drag props
		draggable = true,
		onDragStart = (event, item, element) => {},

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

		// Drag props
		draggable?: boolean;
		onDragStart?: (event: MouseEvent, item: any, element: HTMLElement) => void;

		// Legacy props
		gridCellWidth?: number;
		ROW_HEIGHT?: number;
		GAP_SIZE?: number;
		resizable?: boolean;
		onResizeCommitted?: (spans: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
	}>();

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}

	function getFileIcon(type: string): string {
		const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
		const videoTypes = ['mp4', 'mov', 'avi'];

		if (imageTypes.includes(type.toLowerCase())) {
			return 'mdi:image';
		} else if (videoTypes.includes(type.toLowerCase())) {
			return 'mdi:video';
		}
		return 'mdi:file';
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/media"
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
	{#snippet children({ data: fetchedData })}
		{#if fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0}
			<div class="grid gap-2" role="list" aria-label={m.last5MediaWidget_ariaLabel()}>
				{#each fetchedData.slice(0, 5) as file}
					<div class="flex items-center justify-between rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem">
						<div class="flex min-w-0 items-center gap-2">
							<iconify-icon icon={getFileIcon(file.type)} class="text-primary-400" width="18" aria-label={m.last5MediaWidget_fileIconAriaLabel({type: file.type})}></iconify-icon>
							<div class="flex min-w-0 flex-col">
								<span class="text-text-900 dark:text-text-100 truncate font-medium" title={file.name}>{file.name}</span>
								<span class="text-xs text-surface-500 dark:text-surface-400">{m.last5MediaWidget_fileSize({size: formatFileSize(file.size)})}</span>
							</div>
						</div>
						<div class="flex flex-col items-end">
							<span class="uppercase text-surface-600 dark:text-surface-300">{m.last5MediaWidget_fileType({type: file.type})}</span>
							<span class="text-xs text-surface-500 dark:text-surface-400">{m.last5MediaWidget_fileModified({date: new Date(file.modified).toLocaleDateString()})}</span>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
				<iconify-icon icon="mdi:file-remove-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"></iconify-icon>
				<span>{m.last5MediaWidget_noFilesFound()}</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
