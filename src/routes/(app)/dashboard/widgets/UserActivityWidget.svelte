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

	let {
		label = 'User Activity',
		theme = 'light',
		icon = 'mdi:account-group',
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
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/userActivity"
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
			aria-label="User Activity Widget"
		>
			<h2 class="flex items-center justify-center gap-2 text-center font-bold">
				<iconify-icon icon="mdi:account-group" width="20" class="text-primary-500"></iconify-icon>
				User Activity
			</h2>
			{#if fetchedData && Array.isArray(fetchedData)}
				<div class="mt-2 max-h-32 space-y-2 overflow-y-auto">
					{#each fetchedData.slice(0, 5) as user}
						<div class="flex items-center justify-between rounded bg-surface-100 p-2 text-xs dark:bg-surface-500">
							<div class="flex items-center gap-2">
								<iconify-icon icon={user.status === 'active' ? 'mdi:account-check' : 'mdi:account-clock'} class="text-primary-500"></iconify-icon>
								<span class="font-medium">{user.email || 'Unknown User'}</span>
							</div>
							<div class="flex flex-col items-end">
								<span class="capitalize text-surface-600 dark:text-surface-300">
									{user.status}
								</span>
								<span class="text-xs text-surface-500 dark:text-surface-400">
									{user.role || 'No Role'}
								</span>
							</div>
						</div>
					{/each}
				</div>
				<div class="mt-2 flex justify-between text-center text-xs text-surface-600 dark:text-surface-400">
					<span>Total: {fetchedData.length}</span>
					<span>Active: {fetchedData.filter((u) => u.status === 'active').length}</span>
					<span>Pending: {fetchedData.filter((u) => u.status === 'pending').length}</span>
				</div>
			{:else}
				<div class="flex h-full flex-col items-center justify-center text-xs text-gray-500 dark:text-gray-400">
					<iconify-icon icon="eos-icons:loading" width="24" class="mb-1"></iconify-icon>
					<span>Loading user data...</span>
				</div>
			{/if}
		</div>
	{/snippet}
</BaseWidget>
