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
	// --- Widget Metadata ---
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

	import BaseWidget from '../BaseWidget.svelte';
	import { onDestroy } from 'svelte';

	// --- Type Definitions ---
	// Defines the structure for a single log entry.
	interface LogEntry {
		timestamp: string;
		level: string;
		message: string;
		args: any[];
	}

	// Defines the shape of the data payload fetched from the API.
	interface FetchedData {
		logs: LogEntry[];
		total: number;
		page: number;
		totalPages: number;
	}

	// Type alias for widget size options.
	type Size = '1/2' | '3/4' | 'full';

	// --- Component Props ---
	let {
		label = 'System Logs',
		theme = 'light',
		icon = 'mdi:file-document-outline',
		widgetId = undefined,
		currentSize = '1/2',
		availableSizes = ['1/2', '3/4', 'full'],
		// FIX: Added types and prefixed unused parameters with an underscore.
		onSizeChange = (_newSize: Size) => {},
		draggable = true,
		onDragStart = (_event: MouseEvent, _item: any, _element: HTMLElement) => {},
		gridCellWidth = 0,
		ROW_HEIGHT = 0,
		GAP_SIZE = 0,
		resizable = true,
		onResizeCommitted = (_spans: { w: number; h: number }) => {},
		onCloseRequest = () => {},
		endpoint = '/api/dashboard/logs',
		pollInterval = 15000
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
		endpoint?: string;
		pollInterval?: number;
	}>();

	// --- State for Filters and Pagination ---
	let currentPage = $state(1);
	let filterLevel = $state<'all' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'>('all');
	let searchText = $state('');
	let startDate: string = $state(''); // YYYY-MM-DD
	let endDate: string = $state(''); // YYYY-MM-DD
	let searchTimeout: NodeJS.Timeout | null = null;
	let triggerFetchFlag = $state(0);

	// --- Derived Properties ---
	// This derived value constructs the full API endpoint with query parameters.
	// When any of its dependencies change, it re-evaluates, causing BaseWidget to re-fetch.
	const dynamicEndpoint = $derived(() => {
		const params = new URLSearchParams();
		if (filterLevel !== 'all') params.append('level', filterLevel);
		if (searchText) params.append('search', searchText);
		if (startDate) params.append('startDate', startDate);
		if (endDate) params.append('endDate', endDate);
		params.append('page', currentPage.toString());
		params.append('limit', '20'); // Hardcoded limit for simplicity
		// The triggerFetchFlag is a dummy value to force re-evaluation on demand.
		params.append('_t', triggerFetchFlag.toString());
		return `${endpoint}?${params.toString()}`;
	});

	// --- Effects for Debouncing ---
	// Debounces user input to avoid excessive API calls while typing.
	$effect(() => {
		// This effect is triggered by any change in the filter states.
		const _ = filterLevel,
			__ = searchText,
			___ = startDate,
			____ = endDate;

		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			// Reset to page 1 and trigger a fetch when filters change.
			if (currentPage !== 1) {
				currentPage = 1;
			} else {
				triggerFetchFlag++;
			}
		}, 350); // 350ms debounce
	});

	// Cleanup the timeout when the component is destroyed.
	onDestroy(() => {
		if (searchTimeout) clearTimeout(searchTimeout);
	});

	// --- Pagination Logic ---
	const goToPage = (page: number, totalPages: number) => {
		if (page > 0 && page <= totalPages) {
			currentPage = page;
		}
	};

	// --- Helper Data and Functions ---
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
	<!-- FIX: Explicitly typed the 'data' prop from the snippet to resolve 'never' type errors. -->
	{#snippet children({ data: fetchedData }: { data: FetchedData | undefined })}
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
					class="w-full rounded-lg border border-surface-300 bg-white px-3 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500"
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
		<!-- This check now correctly narrows the type of 'fetchedData' -->
		{#if fetchedData && fetchedData.logs && fetchedData.logs.length > 0}
			<div class="grid gap-2" style="max-height: 180px; overflow-y: auto;" role="list" aria-label="System log entries">
				{#each fetchedData.logs as log}
					<div
						class="flex items-start gap-2 rounded-lg border border-surface-200 bg-surface-100/90 px-3 py-2 text-xs dark:border-surface-700 dark:bg-surface-700/60"
						role="listitem"
					>
						<iconify-icon
							icon="mdi:circle"
							width="10"
							class={getLogLevelColor(log.level) + ' mt-1 flex-shrink-0'}
							aria-label={log.level + ' log level'}
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
			<div class="mt-2 text-center text-xs text-surface-600 opacity-80 dark:text-surface-400">Total Logs: {fetchedData.total}</div>
			<div class="mt-4 flex items-center justify-between text-xs" role="navigation" aria-label="Pagination">
				<button
					onclick={() => goToPage(currentPage - 1, fetchedData.totalPages)}
					class="flex items-center gap-1 rounded-lg bg-primary-500 px-3 py-1 text-white shadow-sm transition hover:bg-primary-600 disabled:bg-surface-300 disabled:text-surface-400 dark:bg-primary-600 dark:hover:bg-primary-500 dark:disabled:bg-surface-700 dark:disabled:text-surface-500"
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
					onclick={() => goToPage(currentPage + 1, fetchedData.totalPages)}
					class="flex items-center gap-1 rounded-lg bg-primary-500 px-3 py-1 text-white shadow-sm transition hover:bg-primary-600 disabled:bg-surface-300 disabled:text-surface-400 dark:bg-primary-600 dark:hover:bg-primary-500 dark:disabled:bg-surface-700 dark:disabled:text-surface-500"
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
