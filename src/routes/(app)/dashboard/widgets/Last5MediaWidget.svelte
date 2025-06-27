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

	interface MediaFile {
		name: string;
		size: number;
		modified: string;
		type: string;
		url: string;
	}

	let {
		label = 'Recent Media',
		theme = 'light',
		icon = 'mdi:image-multiple',
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
	endpoint="/api/media"
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
			aria-label="Recent Media Widget"
		>
			<h2 class="flex items-center justify-center gap-2 text-center font-bold">
				<iconify-icon icon="mdi:image-multiple" width="20" class="text-primary-500"></iconify-icon>
				Recent Media
			</h2>
			{#if fetchedData && Array.isArray(fetchedData)}
				<div class="mt-2 max-h-40 space-y-2 overflow-y-auto">
					{#each fetchedData as file}
						<div class="flex items-center justify-between rounded bg-surface-100 p-2 text-xs dark:bg-surface-500">
							<div class="flex items-center gap-2">
								<iconify-icon icon={getFileIcon(file.type)} class="text-primary-500"></iconify-icon>
								<div class="flex flex-col">
									<span class="max-w-32 truncate font-medium" title={file.name}>{file.name}</span>
									<span class="text-xs text-surface-500 dark:text-surface-400">
										{formatFileSize(file.size)}
									</span>
								</div>
							</div>
							<div class="flex flex-col items-end">
								<span class="uppercase text-surface-600 dark:text-surface-300">
									{file.type}
								</span>
								<span class="text-xs text-surface-500 dark:text-surface-400">
									{new Date(file.modified).toLocaleDateString()}
								</span>
							</div>
						</div>
					{/each}
				</div>
				<div class="mt-2 text-center text-xs text-surface-600 dark:text-surface-400">
					Total Files: {fetchedData.length}
				</div>
			{:else}
				<div class="flex h-full flex-col items-center justify-center text-xs text-gray-500 dark:text-gray-400">
					<iconify-icon icon="eos-icons:loading" width="24" class="mb-1"></iconify-icon>
					<span>Loading media files...</span>
				</div>
			{/if}
		</div>
	{/snippet}
</BaseWidget>
