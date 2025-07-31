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
<script lang="ts" module>
	export const widgetMeta = {
		name: 'System Logs',
		icon: 'mdi:file-document-outline',
		defaultSize: '1/2'
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	import TablePagination from '@src/components/system/table/TablePagination.svelte';

	// Props passed from +page.svelte, then to BaseWidget
	let {
		label = 'System Logs',
		theme = 'light',
		icon = 'mdi:file-document-outline',
		widgetId = undefined,
		size = '1/2',
		onSizeChange = (newSize) => {},
		onCloseRequest = () => {},
		endpoint = '/api/dashboard/logs',
		pollInterval = 15000
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: '1/4' | '1/2' | '3/4' | 'full';
		onSizeChange?: (newSize: '1/4' | '1/2' | '3/4' | 'full') => void;
		onCloseRequest?: () => void;
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
		messageHtml?: string;
		args: unknown[];
	}

	// Function to construct query parameters for the endpoint
	const getQueryParams = () => {
		const params = new URLSearchParams();
		if (filterLevel !== 'all') params.append('level', filterLevel);
		if (searchText) params.append('search', searchText);
		if (startDate) params.append('startDate', startDate);
		if (endDate) params.append('endDate', endDate);
		params.append('page', currentPage.toString());
		params.append('limit', logsPerPage.toString());

		// Debug log to see what's being sent
		console.log('Log filter params:', {
			level: filterLevel,
			page: currentPage,
			limit: logsPerPage,
			search: searchText,
			startDate,
			endDate,
			queryString: params.toString()
		});

		return params.toString();
	};

	// Effect to re-trigger fetch when filters or pagination change
	// This effect will react to changes in filterLevel, searchText, startDate, endDate, currentPage
	// and the explicit triggerFetchFlag.
	$effect(() => {
		// Debounce search text and other filters
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			// Reset to first page when filters change (but not when page changes)
			const isFilterChange = filterLevel !== 'all' || searchText !== '' || startDate !== '' || endDate !== '';
			if (isFilterChange && currentPage !== 1) {
				currentPage = 1;
			}

			// By updating triggerFetchFlag, dynamicEndpoint will re-evaluate,
			// which in turn will cause BaseWidget to re-fetch.
			triggerFetchFlag++;
		}, 300); // 300ms debounce
	});

	// Handle pagination changes
	const onUpdatePage = (page: number) => {
		currentPage = page;
		triggerFetchFlag; // Trigger re-fetch
	};

	const onUpdateRowsPerPage = (rows: number) => {
		logsPerPage = rows;
		currentPage = 1; // Reset to first page when changing page size
		triggerFetchFlag++; // Trigger re-fetch
	};

	// Handle filter level change - reset to first page
	const handleFilterLevelChange = (newLevel: typeof filterLevel) => {
		filterLevel = newLevel;
		currentPage = 1; // Always reset to first page when filter changes
		triggerFetchFlag++; // Trigger immediate re-fetch
	};

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

	// Function to process ANSI escape sequences in log messages
	const processAnsiMessage = (message: string): string => {
		if (!message) return '';

		// First, escape HTML to prevent XSS
		let result = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

		// ANSI color mapping to CSS styles (using more web-friendly colors)
		const ansiColors: Record<string, string> = {
			'30': 'color: #000000', // black
			'31': 'color: #dc2626', // red
			'32': 'color: #16a34a', // green
			'33': 'color: #ca8a04', // yellow
			'34': 'color: #2563eb', // blue
			'35': 'color: #9333ea', // magenta
			'36': 'color: #0891b2', // cyan
			'37': 'color: #6b7280', // white/gray
			'90': 'color: #6b7280', // bright black (gray)
			'91': 'color: #ef4444', // bright red
			'92': 'color: #22c55e', // bright green
			'93': 'color: #eab308', // bright yellow
			'94': 'color: #3b82f6', // bright blue
			'95': 'color: #a855f7', // bright magenta
			'96': 'color: #06b6d4', // bright cyan
			'97': 'color: #f3f4f6' // bright white
		};

		let openSpans = 0;

		// Handle multiple ANSI escape sequence formats
		const escapePatterns = [
			/\\x1b\[([0-9;]*)m/g, // Literal \x1b strings (hexadecimal)
			/\\u001b\[([0-9;]*)m/g, // Literal \u001b strings (unicode)
			/\x1b\[([0-9;]*)m/g, // Actual \x1b escape characters
			/\u001b\[([0-9;]*)m/g // Actual \u001b escape characters
		];

		for (const pattern of escapePatterns) {
			result = result.replace(pattern, (match, codes) => {
				if (!codes) return '';

				const codeArray = codes.split(';').filter((code: string) => code !== '');

				// Reset code (0 or empty) - close all spans
				if (codes === '0' || codes === '') {
					const closeSpans = '</span>'.repeat(openSpans);
					openSpans = 0;
					return closeSpans;
				}

				// Process color codes
				let html = '';
				for (const code of codeArray) {
					if (ansiColors[code]) {
						html += `<span style="${ansiColors[code]}">`;
						openSpans++;
					}
				}
				return html;
			});
		}

		// Clean up any remaining escape sequences
		result = result
			.replace(/\\x1b\[[A-Za-z]/g, '')
			.replace(/\\u001b\[[A-Za-z]/g, '')
			.replace(/\x1b\[[A-Za-z]/g, '')
			.replace(/\u001b\[[A-Za-z]/g, '')
			.replace(/\\x1b/g, '')
			.replace(/\\u001b/g, '')
			.replace(/\x1b/g, '')
			.replace(/\u001b/g, '');

		// Close any remaining open spans
		result += '</span>'.repeat(openSpans);

		return result;
	};
</script>

<BaseWidget {label} endpoint={dynamicEndpoint} {pollInterval} {icon} {widgetId} {size} {onSizeChange} {onCloseRequest}>
	{#snippet children({ data: fetchedData }: { data: FetchedData | undefined })}
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="Log controls">
			<div class="flex flex-1 gap-2">
				<select
					bind:value={filterLevel}
					onchange={(e) => handleFilterLevelChange(e.target.value as typeof filterLevel)}
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
			<div class="flex flex-col gap-1 overflow-y-auto" style="max-height: 200px;" role="list" aria-label="System log entries">
				{#each fetchedData.logs as log}
					<div
						class="flex items-center gap-1 rounded border border-surface-200 bg-surface-50/50 px-1 py-1 text-xs dark:border-surface-700 dark:bg-surface-800/30"
						role="listitem"
					>
						<iconify-icon icon="mdi:circle" width="8" class={getLogLevelColor(log.level) + ' flex-shrink-0'} aria-label={log.level + ' log level'}
						></iconify-icon>
						<span class="w-8 flex-shrink-0 text-xs text-surface-500 dark:text-surface-400">
							{new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
						</span>
						<span class="w-14 flex-shrink-0 text-xs font-medium {getLogLevelColor(log.level)}">
							{log.level.toUpperCase()}
						</span>
						<span
							class="text-text-900 dark:text-text-100 flex-1 select-text truncate text-xs"
							style="user-select: text; -webkit-user-select: text; -moz-user-select: text;"
							title={processAnsiMessage(log.message)}
							aria-label={processAnsiMessage(log.message)}
						>
							{@html processAnsiMessage(log.messageHtml || log.message)}
						</span>
					</div>
				{/each}
			</div>

			<!-- Use TablePagination component -->
			<div class=" flex items-center justify-between">
				<TablePagination
					currentPage={fetchedData.page || 1}
					rowsPerPage={logsPerPage}
					rowsPerPageOptions={[10, 20, 50, 100]}
					totalItems={fetchedData.total || 0}
					pagesCount={fetchedData.totalPages || 1}
					{onUpdatePage}
					{onUpdateRowsPerPage}
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
