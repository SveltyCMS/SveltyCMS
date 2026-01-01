<!--
@file src/routes/(app)/dashboard/widgets/LogsWidget.svelte
@component
**Logs widget component to display system logs with filtering, searching, and pagination.**

### Props
- Inherits all props from BaseWidget.svelte
- `data`: Fetched log data from the server.

### Features:
- Displays paginated log entries.
- Allows filtering logs by level (fatal, error, warn, info, debug, trace).
- Provides a search input to filter log messages by text.
- Includes date range filtering for logs.
- Integrates with BaseWidget for common widget functionalities.
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'Logs',
		icon: 'mdi:text-box-outline',
		defaultSize: { w: 2, h: 2 }
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	import type { TablePaginationProps, WidgetSize } from '@src/content/types';
	import TablePagination from '@src/components/system/table/TablePagination.svelte';

	interface LogEntryDisplay {
		timestamp: string;
		level: string;
		message: string;
		messageHtml?: string;
		args: unknown[];
	}

	interface FetchedData {
		logs: LogEntryDisplay[];
		page: number;
		total: number;
		totalPages?: number;
		hasMore?: boolean;
	}

	const {
		label = 'System Logs',
		icon = 'mdi:file-document-outline',
		widgetId = undefined,
		size = { w: 2, h: 2 } as WidgetSize,
		onSizeChange = (_newSize: WidgetSize) => {},
		onRemove = () => {},
		endpoint = '/api/dashboard/logs',
		pollInterval = 15000
	}: {
		label?: string;
		icon?: string;
		widgetId?: string;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		onRemove?: () => void;
		endpoint?: string;
		pollInterval?: number;
	} = $props();

	// Internal state for logs data
	let currentPage = $state(1);
	let logsPerPage = $state(20); // Default logs per page

	// Filter states
	let filterLevel = $state('all');
	let searchText = $state('');
	let startDate: string = $state(''); // YYYY-MM-DD
	let endDate: string = $state(''); // YYYY-MM-DD

	// Debounce search/filter inputs
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let triggerFetchFlag = $state(0); // Dummy state to explicitly trigger fetch via $effect

	// Function to construct query parameters for the endpoint
	const getQueryParams = () => {
		const params = new URLSearchParams();
		if (filterLevel !== 'all') params.append('level', filterLevel);
		if (searchText) params.append('search', searchText);
		if (startDate) params.append('startDate', startDate);
		if (endDate) params.append('endDate', endDate);
		params.append('page', currentPage.toString());
		params.append('limit', logsPerPage.toString());
		return params.toString();
	};

	// Effect to re-trigger fetch when filters or pagination change
	$effect(() => {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			const isFilterChange = filterLevel !== 'all' || searchText !== '' || startDate !== '' || endDate !== '';
			if (isFilterChange && currentPage !== 1) {
				currentPage = 1;
			}
			triggerFetchFlag++;
		}, 300); // 300ms debounce
	});

	// Handle pagination changes
	const onUpdatePage = (page: number) => {
		currentPage = page;
		triggerFetchFlag++;
	};

	const onUpdateRowsPerPage = (rows: number) => {
		logsPerPage = rows;
		currentPage = 1;
		triggerFetchFlag++;
	};

	const handleFilterLevelChange = (newLevel: typeof filterLevel) => {
		filterLevel = newLevel;
		currentPage = 1;
		triggerFetchFlag++;
	};

	const dynamicEndpoint = $derived(`${endpoint}?${getQueryParams()}&_t=${triggerFetchFlag}`);

	const logLevelOptions = [
		{ value: 'all', label: 'All Levels' },
		{ value: 'fatal', label: 'Fatal' },
		{ value: 'error', label: 'Error' },
		{ value: 'warn', label: 'Warn' },
		{ value: 'info', label: 'Info' },
		{ value: 'debug', label: 'Debug' },
		{ value: 'trace', label: 'Trace' }
	];

	const getLogLevelColor = (level: string) => {
		switch (level.toLowerCase()) {
			case 'fatal':
				return 'text-purple-500 dark:text-purple-400';
			case 'error':
				return 'text-red-500 dark:text-red-400';
			case 'warn':
				return 'text-yellow-500 dark:text-yellow-400';
			case 'info':
				return 'text-green-500 dark:text-green-400';
			case 'debug':
				return 'text-blue-500 dark:text-blue-400';
			case 'trace':
				return 'text-cyan-500 dark:text-cyan-400';
			default:
				return 'text-gray-700 dark:text-gray-300';
		}
	};
</script>

<BaseWidget {label} endpoint={dynamicEndpoint} {pollInterval} {icon} {widgetId} {size} {onSizeChange} onCloseRequest={onRemove}>
	{#snippet children({ data: fetchedData }: { data: FetchedData | undefined })}
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="Log controls">
			<div class="flex flex-1 gap-2">
				<select
					bind:value={filterLevel}
					onchange={(e) => handleFilterLevelChange((e.target as HTMLSelectElement).value as typeof filterLevel)}
					class="rounded border border-surface-300 bg-white px-8 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500"
					aria-label="Filter log level"
				>
					{#each logLevelOptions as { value, label }}
						<option {value}>{label}</option>
					{/each}
				</select>
				<input
					type="text"
					placeholder="Search logs..."
					bind:value={searchText}
					class="rounded border border-surface-300 bg-white px-3 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500"
					aria-label="Search logs"
				/>
			</div>
			<div class="flex items-center gap-2">
				<input
					type="date"
					bind:value={startDate}
					class="rounded border border-surface-300 bg-white px-2 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500"
					aria-label="Start date"
				/>
				<input
					type="date"
					bind:value={endDate}
					class="rounded border border-surface-300 bg-white px-2 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500"
					aria-label="End date"
				/>
			</div>
		</div>
		{#if fetchedData && fetchedData.logs && fetchedData.logs.length > 0}
			<div
				class="flex flex-col gap-1 overflow-y-auto"
				style="max-height: calc({size.h} * 120px - 120px);"
				role="list"
				aria-label="System log entries"
			>
				{#each fetchedData.logs as log}
					<div
						class="flex items-center gap-1 rounded border border-surface-200 bg-surface-50/50 px-1 py-1 text-xs dark:border-surface-700 dark:bg-surface-800/30"
						role="listitem"
					>
						<iconify-icon icon="mdi:circle" width="8" class="{getLogLevelColor(log.level)} shrink-0" aria-label="{log.level} log level"
						></iconify-icon>
						<span class="w-8 shrink-0 text-xs text-surface-500 dark:text-surface-400">
							{new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
						</span>
						<span class="w-14 shrink-0 text-xs font-medium {getLogLevelColor(log.level)}">
							{log.level.toUpperCase()}
						</span>
						<span class="text-text-900 dark:text-text-100 flex-1 select-text truncate text-xs" style="user-select: text;" title={log.message}>
							{log.message}
						</span>
					</div>
				{/each}
			</div>

			<div class="mt-auto flex items-center justify-between pt-2">
				<TablePagination
					currentPage={(fetchedData.page || 1) as TablePaginationProps['currentPage']}
					rowsPerPage={logsPerPage as TablePaginationProps['rowsPerPage']}
					rowsPerPageOptions={[10, 20, 50, 100] as TablePaginationProps['rowsPerPageOptions']}
					totalItems={(fetchedData.total || 0) as TablePaginationProps['totalItems']}
					pagesCount={(fetchedData.hasMore ? (fetchedData.page || 1) + 1 : fetchedData.page || 1) as TablePaginationProps['pagesCount']}
					onUpdatePage={onUpdatePage as TablePaginationProps['onUpdatePage']}
					onUpdateRowsPerPage={onUpdateRowsPerPage as TablePaginationProps['onUpdateRowsPerPage']}
				/>
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
				<iconify-icon icon="mdi:file-remove-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"></iconify-icon>
				<span>No logs found</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
