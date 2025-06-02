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

	// Inherit props from BaseWidget
	const {
		label = 'System Logs',
		icon = 'mdi:file-document-outline',
		endpoint = '/dashboard/widgets/logs', // API endpoint to fetch logs
		pollInterval = 15000, // Poll every 15 seconds for new logs
		widgetId,
		theme,
		gridCellWidth,
		ROW_HEIGHT,
		GAP_SIZE,
		resizable = true,
		onResizeCommitted,
		onCloseRequest
	} = $props<{
		label?: string;
		icon?: string;
		endpoint?: string;
		pollInterval?: number;
		widgetId: string;
		theme: 'light' | 'dark';
		gridCellWidth: number;
		ROW_HEIGHT: number;
		GAP_SIZE: number;
		resizable?: boolean;
		onResizeCommitted?: (spans: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
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
</script>

<BaseWidget
	{label}
	{icon}
	endpoint={dynamicEndpoint}
	{pollInterval}
	{widgetId}
	{theme}
	{gridCellWidth}
	{ROW_HEIGHT}
	{GAP_SIZE}
	{resizable}
	{onResizeCommitted}
	{onCloseRequest}
	onDataLoaded={handleDataUpdate}
>
	<div class="flex h-full flex-col">
		<div class="flex flex-wrap items-center gap-2">
			<select
				bind:value={filterLevel}
				class="min-w-24 rounded border border-gray-300 bg-white p-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				aria-label="Filter by log level"
			>
				{#each logLevelOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>

			<input
				type="text"
				bind:value={searchText}
				placeholder="Search message..."
				class="flex-1 rounded border border-gray-300 bg-white p-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				aria-label="Search log messages"
			/>

			<input
				type="date"
				bind:value={startDate}
				class="rounded border border-gray-300 bg-white p-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				aria-label="Filter by start date"
			/>
			<input
				type="date"
				bind:value={endDate}
				class="rounded border border-gray-300 bg-white p-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				aria-label="Filter by end date"
			/>
		</div>
		<!-- Body -->
		<div class="mt-1 flex-1 overflow-y-auto text-xs">
			{#if logs.length === 0}
				<div class="text-center text-surface-500 dark:text-gray-400">No log entries found.</div>
			{:else}
				<ul class="space-y-0.5">
					{#each logs as logEntry (logEntry.timestamp + logEntry.message)}
						<li class="rounded p-1 {theme === 'light' ? 'bg-gray-100' : 'bg-gray-700'}">
							<span class="font-mono text-surface-500 dark:text-gray-400">[{logEntry.timestamp.slice(11, 19)}]</span>
							<span class="ml-1 font-bold {getLogLevelColor(logEntry.level)}">[{logEntry.level.toUpperCase()}]</span>
							<span class="text-text-800 dark:text-text-200 ml-1">{logEntry.message}</span>
							{#if logEntry.args && logEntry.args.length > 0}
								<pre class="mt-0.5 whitespace-pre-wrap break-all text-gray-600 dark:text-gray-300">{JSON.stringify(logEntry.args, null, 2)}</pre>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- Pagination controls -->
		<div class="-mb-1 mt-1 flex items-center justify-between border-t {theme === 'light' ? 'border-gray-200' : 'border-gray-600'}">
			<button
				onclick={() => goToPage(1)}
				disabled={currentPage === 1}
				class="btn-icon {currentPage === 1 ? 'text-gray-400' : 'text-primary-500'}"
				aria-label="First page"
			>
				<iconify-icon icon="mdi:page-first" width="18"></iconify-icon>
			</button>

			<button
				onclick={prevPage}
				disabled={currentPage === 1}
				class="btn-icon {currentPage === 1 ? 'text-gray-400' : 'text-primary-500'}"
				aria-label="Previous page"
			>
				<iconify-icon icon="mdi:chevron-left" width="18"></iconify-icon>
			</button>

			<span class="text-xs text-gray-700 dark:text-gray-300">Page {currentPage} of {totalPages}</span>

			<button
				onclick={nextPage}
				disabled={currentPage === totalPages || totalPages === 0}
				class="btn-icon {currentPage === totalPages || totalPages === 0 ? 'text-gray-400' : 'text-primary-500'}"
				aria-label="Next page"
			>
				<iconify-icon icon="mdi:chevron-right" width="18"></iconify-icon>
			</button>
			<button
				onclick={() => goToPage(totalPages)}
				disabled={currentPage === totalPages || totalPages === 0}
				class="btn-icon {currentPage === totalPages || totalPages === 0 ? 'text-gray-400' : 'text-primary-500 '}"
				aria-label="Last page"
			>
				<iconify-icon icon="mdi:page-last" width="18"></iconify-icon>
			</button>
		</div>
	</div>
</BaseWidget>
