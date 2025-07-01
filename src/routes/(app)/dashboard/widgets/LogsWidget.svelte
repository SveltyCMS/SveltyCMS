<!--
@file src/routes/(app)/dashboard/widgets/LogsWidget.svelte
@component
**Logs widget component to display system logs with filtering, searching, and pagination.**

### Props
- Inherits all props from BaseWidget.svelte (label, theme, icon, widgetId, gridCellWidth, ROW_HEIGHT, GAP_SIZE, resizable, onResizeCommitted, onCloseRequest)
- `data`: Fetched log data from the server.

### Features:
- Displays paginated log entries.
- Allows filtering logs by level (fatal, error, warn, info, debug, trace).
- Provides a search input to filter log messages by text.
- Includes date range filtering for logs.
- Integrates with BaseWidget for common widget functionalities.
-->
<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	// Removed: import { Icon } from '@iconify/svelte'; // No longer needed as <iconify-icon> is used directly

	// Props passed from +page.svelte, then to BaseWidget
	let {
		label = 'System Logs',
		theme = 'light',
		icon = 'mdi:file-document-outline',
		widgetId = undefined,

		// New sizing props
		currentSize = '1/2',
		availableSizes = ['1/2', '3/4', 'full'],
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
		onCloseRequest = () => {},

		// API props
		endpoint = '/dashboard/widgets/logs',
		pollInterval = 15000
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;

		// New sizing props
		currentSize?: '1/2' | '3/4' | 'full';
		availableSizes?: ('1/2' | '3/4' | 'full')[];
		onSizeChange?: (newSize: '1/2' | '3/4' | 'full') => void;

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

		// API props
		endpoint?: string;
		pollInterval?: number;
	}>();

	// Internal state for logs data
	let logs: LogEntryDisplay[] = $state([]);
	let totalLogs = $state(0);
	let currentPage = $state(1);
	let logsPerPage = $state(20); // Default logs per page

	// Filter states
	let filterLevel = $state<'all' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'>('all');
	let searchText = $state('');
	let startDate: string = $state(''); // YYYY-MM-DD
	let endDate: string = $state(''); // YYYY-MM-DD

	// Debounce search/filter inputs
	let searchTimeout: NodeJS.Timeout | null = null;
	let triggerFetchFlag = $state(0); // Dummy state to explicitly trigger fetch via $effect

	interface LogEntryDisplay {
		timestamp: string;
		level: string;
		message: string;
		args: any[];
	}

	// Derived properties for pagination
	const totalPages = $derived(Math.ceil(totalLogs / logsPerPage));

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

	// Function to handle data updates from BaseWidget
	const handleDataUpdate = (fetchedData: { logs: LogEntryDisplay[]; total: number }) => {
		if (fetchedData) {
			logs = fetchedData.logs;
			totalLogs = fetchedData.total;
		} else {
			logs = [];
			totalLogs = 0;
		}
	};

	// Effect to re-trigger fetch when filters or pagination change
	// This effect will react to changes in filterLevel, searchText, startDate, endDate, currentPage
	// and the explicit triggerFetchFlag.
	$effect(() => {
		// Debounce search text and other filters
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			// By updating triggerFetchFlag, dynamicEndpoint will re-evaluate,
			// which in turn will cause BaseWidget to re-fetch.
			triggerFetchFlag++;
		}, 300); // 300ms debounce
	});

	// Handle pagination changes
	const goToPage = (page: number) => {
		if (page > 0 && page <= totalPages) {
			currentPage = page;
			triggerFetchFlag++; // Trigger re-fetch
		}
	};

	const nextPage = () => goToPage(currentPage + 1);
	const prevPage = () => goToPage(currentPage - 1);

	// Dynamic endpoint for BaseWidget
	// This will react to changes in filterLevel, searchText, startDate, endDate, currentPage
	// and triggerFetchFlag, causing BaseWidget to re-fetch.
	const dynamicEndpoint = $derived(`${endpoint}?${getQueryParams()}&_t=${triggerFetchFlag}`);

	// Log level options for the dropdown
	const logLevelOptions = [
		{ value: 'all', label: 'All Levels' },
		{ value: 'fatal', label: 'Fatal' },
		{ value: 'error', label: 'Error' },
		{ value: 'warn', label: 'Warn' },
		{ value: 'info', label: 'Info' },
		{ value: 'debug', label: 'Debug' },
		{ value: 'trace', label: 'Trace' }
	];

	// Function to determine log entry text color based on level
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

	// Place widgetMeta at the end of the <script> block
	export const widgetMeta = {
		name: 'System Logs',
		icon: 'mdi:file-document-outline',
		defaultW: 2, // 1/2 width
		defaultH: 2,
		validSizes: [
			{ w: 1, h: 1 },
			{ w: 2, h: 1 },
			{ w: 1, h: 2 },
			{ w: 2, h: 2 }
		]
	};
</script>

<BaseWidget
	{label}
	{theme}
	endpoint={dynamicEndpoint}
	{pollInterval}
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
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="Log controls">
			<div class="flex flex-1 gap-2">
				<select
					bind:value={filterLevel}
					class="rounded-lg border border-surface-300 bg-white px-3 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500"
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
					class="rounded-lg border border-surface-300 bg-white px-3 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500"
					aria-label="Search logs"
				/>
			</div>
			<div class="flex items-center gap-2">
				<input
					type="date"
					bind:value={startDate}
					class="rounded-lg border border-surface-300 bg-white px-2 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500"
					aria-label="Start date"
				/>
				<input
					type="date"
					bind:value={endDate}
					class="rounded-lg border border-surface-300 bg-white px-2 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500"
					aria-label="End date"
				/>
			</div>
		</div>
		{#if fetchedData && fetchedData.logs && fetchedData.logs.length > 0}
			<div class="grid gap-2" style="max-height: 180px; overflow: hidden;" role="list" aria-label="System log entries">
				{#each fetchedData.logs as log}
					<div
						class="flex items-start gap-2 rounded-lg border border-surface-200 bg-surface-100/90 px-3 py-2 text-xs dark:border-surface-700 dark:bg-surface-700/60"
						role="listitem"
					>
						<iconify-icon icon="mdi:circle" width="10" class={getLogLevelColor(log.level) + ' mt-1'} aria-label={log.level + ' log level'}
						></iconify-icon>
						<div class="flex w-full min-w-0 flex-col">
							<span
								class="text-text-900 dark:text-text-100 w-full whitespace-pre-line break-words font-medium"
								style="word-break:break-word;"
								title={log.message}
								aria-label={log.message}>{log.message}</span
							>
							<span class="text-xs text-surface-500 dark:text-surface-400">{log.level} • {new Date(log.timestamp).toLocaleTimeString()}</span>
						</div>
					</div>
				{/each}
			</div>
			<div class="mt-2 text-center text-xs text-surface-600 opacity-80 dark:text-surface-400">
				Total Logs: {fetchedData.total}
			</div>
			<div class="mt-4 flex items-center justify-between text-xs" role="navigation" aria-label="Pagination">
				<button
					onclick={prevPage}
					class="rounded-lg bg-primary-500 px-3 py-1 text-white shadow-sm transition hover:bg-primary-600 disabled:bg-surface-300 disabled:text-surface-400 dark:bg-primary-600 dark:hover:bg-primary-500 dark:disabled:bg-surface-700 dark:disabled:text-surface-500"
					disabled={fetchedData.page === 1}
					aria-label="Previous page"
				>
					<iconify-icon icon="mdi:chevron-left" width="16" aria-hidden="true"></iconify-icon>
					<span>Previous</span>
				</button>
				<span>
					Page {fetchedData.page} of {fetchedData.totalPages}
				</span>
				<button
					onclick={nextPage}
					class="rounded-lg bg-primary-500 px-3 py-1 text-white shadow-sm transition hover:bg-primary-600 disabled:bg-surface-300 disabled:text-surface-400 dark:bg-primary-600 dark:hover:bg-primary-500 dark:disabled:bg-surface-700 dark:disabled:text-surface-500"
					disabled={fetchedData.page === fetchedData.totalPages}
					aria-label="Next page"
				>
					<span>Next</span>
					<iconify-icon icon="mdi:chevron-right" width="16" aria-hidden="true"></iconify-icon>
				</button>
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
				<iconify-icon icon="mdi:file-remove-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"></iconify-icon>
				<span>No logs found</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
