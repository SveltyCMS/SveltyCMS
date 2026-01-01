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
- Enhanced debugging and logging
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'Last 5 Media',
		icon: 'mdi:image-multiple-outline',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import { formatDisplayDate } from '@utils/dateUtils';
	import BaseWidget from '../BaseWidget.svelte';
	import type { WidgetSize } from '@src/content/types';

	interface MediaFile {
		id: string;
		name: string;
		size: number;
		modified: string;
		type: string;
		url: string;
		createdBy?: string;
	}

	type FetchedData = MediaFile[] | undefined;

	const {
		label = 'Last 5 Media',
		theme = 'light',
		icon = 'mdi:image-multiple-outline',
		widgetId = undefined,
		size = { w: 1, h: 1 } as WidgetSize,
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

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}

	function getFileIcon(type: string): string {
		if (!type) return 'mdi:file';
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
	endpoint="/api/dashboard/last5media"
	pollInterval={30000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: fetchedData }: { data: FetchedData })}
		{#if fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0}
			<div class="grid gap-2" style="max-height: 180px; overflow-y: auto;" role="list" aria-label="Last 5 media files">
				{#each fetchedData.slice(0, 5) as file (file.id || file.name)}
					<div class="flex items-center justify-between rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem">
						<div class="flex min-w-0 items-center gap-2">
							<iconify-icon icon={getFileIcon(file.type)} class="shrink-0 text-primary-400" width="18" aria-label={file.type + ' file icon'}
							></iconify-icon>
							<div class="flex min-w-0 flex-col">
								<span class="text-text-900 dark:text-text-100 truncate font-medium" title={file.name}>
									{file.name}
								</span>
								<span class="text-xs text-surface-500 dark:text-surface-400" title={`Size: ${formatFileSize(file.size)}`}>
									{formatFileSize(file.size)}
								</span>
							</div>
						</div>
						<div class="flex flex-col items-end">
							<span class="text-xs font-medium uppercase text-surface-600 dark:text-surface-300">
								{file.type}
							</span>
							<span class="text-xs text-surface-500 dark:text-surface-400" title={`Modified: ${formatDisplayDate(file.modified)}`}>
								{formatDisplayDate(file.modified)}
							</span>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
				<iconify-icon icon="mdi:file-remove-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"></iconify-icon>
				<span>No media files found</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
