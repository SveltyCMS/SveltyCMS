<!--
@file src/routes/(app)/dashboard/widgets/UserActivityWidget.svelte
@component
**Dashboard widget for displaying user activity with improved rendering and error handling**

@example
<UserActivityWidget label="User Activity" />

### Props
- `label`: The label for the widget (default: 'User Activity')

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
		name: 'User Activity',
		icon: 'mdi:account-group',
		defaultW: 2,
		defaultH: 1,
		validSizes: [
			{ w: 1, h: 1 },
			{ w: 2, h: 1 },
			{ w: 1, h: 2 },
			{ w: 2, h: 2 }
		]
	};

	import BaseWidget from '../BaseWidget.svelte';

	// --- Type Definitions ---
	// Defines the structure for a single user activity entry.
	interface User {
		email: string;
		status: 'active' | 'pending' | string;
		role: string;
	}

	// Defines the shape of the data payload fetched from the API.
	type FetchedData = User[];

	// Type alias for widget size options.
	type Size = '1/4' | '1/2' | '3/4' | 'full';

	// --- Component Props ---
	let {
		label = 'User Activity',
		theme = 'light',
		icon = 'mdi:account-group',
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
	endpoint="/api/dashboard/userActivity"
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
		<!-- This check now correctly narrows the type of 'fetchedData' to 'User[]' -->
		{#if fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0}
			<!-- Stats row on top -->
			<div class="mb-2 flex items-center justify-between text-xs text-surface-600 opacity-80 dark:text-surface-400">
				<span>Total: {fetchedData.length}</span>
				<span class="flex items-center gap-1"
					><span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>Active: {fetchedData.filter((u) => u.status === 'active')
						.length}</span
				>
				<span class="flex items-center gap-1"
					><span class="inline-block h-2 w-2 rounded-full bg-yellow-400"></span>Pending: {fetchedData.filter((u) => u.status === 'pending')
						.length}</span
				>
			</div>
			<div class="grid gap-2" style="max-height: 120px; overflow-y: auto;">
				{#each fetchedData.slice(0, 5) as user}
					<div class="flex items-center justify-between rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60">
						<div class="flex min-w-0 items-center gap-2">
							{#if user.status === 'active'}
								<span class="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" title="Online"></span>
							{:else if user.status === 'pending'}
								<span class="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-yellow-400" title="Pending"></span>
							{:else}
								<span class="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-gray-400" title={user.status}></span>
							{/if}
							<span class="text-text-900 dark:text-text-100 truncate font-medium" title={user.email}>{user.email || 'Unknown User'}</span>
						</div>
						<div class="flex flex-col items-end">
							<span class="text-xs text-surface-500 dark:text-surface-400">{user.role || 'No Role'}</span>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400">
				<iconify-icon icon="mdi:account-off-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500"></iconify-icon>
				<span>No user activity</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
