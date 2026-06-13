<!--
@file src/routes/(app)/dashboard/widgets/LogsWidget.svelte
@component
**Modern System Logs Widget — Filterable log viewer with adaptive layouts**

### Props
- `label` (string): Widget label (default: 'System Logs')
- `size` (WidgetSize): Controls layout — h:1 compact chips, h:2+ rich cards

### Features:
- Adaptive dual layout: compact (h:1) horizontal log chips, rich (h:2+) expandable cards
- Level filter dropdown (all, fatal, error, warn, info, debug)
- Text search with real-time filtering
- Date range filtering (start → end)
- Clickable logs expand inline to show full message and metadata
- Color-coded severity icons and text
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "System Logs",
	icon: "mdi:text-box-outline",
	description: "Recent system activity with filtering and search",
	defaultSize: { w: 2, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface LogEntry {
		timestamp: string;
		level: string;
		message: string;
		messageHtml?: string;
		actor?: string;
		args?: unknown[];
	}

	const {
		label = 'System Logs',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:text-box-outline',
		widgetId = undefined as string | undefined,
		size = { w: 2, h: 2 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	const isCompact = $derived(size.h === 1);

	let searchTerm = $state('');
	let filterLevel = $state('all');
	let startDate = $state('');
	let endDate = $state('');
	let expandedId = $state<string | null>(null);

	const levels = [
		{ value: 'all', label: 'All' },
		{ value: 'fatal', label: 'Fatal' },
		{ value: 'error', label: 'Error' },
		{ value: 'warn', label: 'Warn' },
		{ value: 'info', label: 'Info' },
		{ value: 'debug', label: 'Debug' },
	];

	function toggleExpand(id: string) {
		expandedId = expandedId === id ? null : id;
	}

	function levelCls(level: string): string {
		const m: Record<string, string> = {
			fatal: 'text-purple-500', error: 'text-red-500', warn: 'text-amber-500',
			info: 'text-emerald-500', debug: 'text-blue-500',
		};
		return m[level?.toLowerCase()] || 'text-surface-500';
	}

	function levelBg(level: string): string {
		const m: Record<string, string> = {
			fatal: 'bg-purple-100 dark:bg-purple-900/30', error: 'bg-red-100 dark:bg-red-900/30',
			warn: 'bg-amber-100 dark:bg-amber-900/30', info: 'bg-emerald-100 dark:bg-emerald-900/30',
			debug: 'bg-blue-100 dark:bg-blue-900/30',
		};
		return m[level?.toLowerCase()] || '';
	}

	function levelIcon(level: string): string {
		const m: Record<string, string> = {
			fatal: 'mdi:alert-octagon', error: 'mdi:alert-circle', warn: 'mdi:alert',
			info: 'mdi:information-outline', debug: 'mdi:bug-outline',
		};
		return m[level?.toLowerCase()] || 'mdi:circle-small';
	}

	function fmtTime(iso: string): string {
		return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function filterLogs(logs: LogEntry[]): LogEntry[] {
		return logs.filter((log) => {
			if (filterLevel !== 'all' && log.level?.toLowerCase() !== filterLevel) return false;
			if (searchTerm && !log.message?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
			if (startDate) {
				const logDate = new Date(log.timestamp);
				const start = new Date(startDate);
				start.setHours(0, 0, 0, 0);
				if (logDate < start) return false;
			}
			if (endDate) {
				const logDate = new Date(log.timestamp);
				const end = new Date(endDate);
				end.setHours(23, 59, 59, 999);
				if (logDate > end) return false;
			}
			return true;
		});
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/logs"
	pollInterval={20000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{const allLogs = (data?.logs || []) as LogEntry[]}
		{const filtered = filterLogs(allLogs)}

		{#if !isCompact}
			<!-- Controls (rich layout only) -->
			<div class="mb-3 flex flex-wrap items-center gap-2">
				<select
					bind:value={filterLevel}
					class="rounded border border-surface-200 bg-surface-50 px-3 py-1.5 text-xs text-surface-700 focus:border-primary-400 focus:outline-none dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200"
					aria-label="Filter by log level"
				>
					{#each levels as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>

				<div class="relative flex-1 min-w-30">
					<input
						type="text"
						bind:value={searchTerm}
						placeholder="Search..."
						class="w-full rounded border border-surface-200 bg-surface-50 py-1.5 ps-8 pe-3 text-xs text-surface-700 placeholder-surface-400 focus:border-primary-400 focus:outline-none dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200"
						aria-label="Search log messages"
					/>
					<iconify-icon icon="mdi:magnify" width="14" class="absolute inset-s-2.5 top-1/2 -translate-y-1/2 text-surface-400"  ></iconify-icon>
				</div>

				<input
					type="date"
					bind:value={startDate}
					class="rounded border border-surface-200 bg-surface-50 px-2 py-1.5 text-xs text-surface-700 focus:border-primary-400 focus:outline-none dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200"
					aria-label="Start date"
				/>
				<span class="text-xs text-surface-400">–</span>
				<input
					type="date"
					bind:value={endDate}
					class="rounded border border-surface-200 bg-surface-50 px-2 py-1.5 text-xs text-surface-700 focus:border-primary-400 focus:outline-none dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200"
					aria-label="End date"
				/>
			</div>
		{/if}

		{#if filtered.length === 0}
			<div class="flex h-full flex-col items-center justify-center text-center">
				<iconify-icon icon="mdi:text-box-remove-outline" class="text-4xl opacity-20 mb-3"  ></iconify-icon>
				<div class="text-sm font-medium text-surface-500">
					{#if searchTerm || filterLevel !== 'all' || startDate || endDate}
						No logs match your filters
					{:else}
						No logs recorded yet
					{/if}
				</div>
			</div>
		{:else if isCompact}
			<!-- Compact (h:1): horizontal scroll of log chips -->
			<div class="flex h-full items-center gap-2 overflow-hidden">
				<span class="shrink-0 text-xs font-semibold text-surface-500">{filtered.length} logs</span>
				<div class="h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-700"></div>
				<div class="flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
					{#each filtered.slice(0, 12) as log (log.timestamp + log.message)}
						<button
							onclick={() => toggleExpand(log.timestamp + log.message)}
							class="flex shrink-0 items-center gap-1 rounded-full {levelBg(log.level)} px-2 py-0.5 hover:opacity-80 transition-opacity"
							title="{log.level.toUpperCase()}: {log.message}"
						>
							<iconify-icon icon={levelIcon(log.level)} class="text-xs {levelCls(log.level)}" ></iconify-icon>
							<span class="max-w-20 truncate text-[10px] font-medium text-surface-700 dark:text-surface-300">
								{log.message}
							</span>
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<!-- Rich (h:2+): expandable cards -->
			<div class="flex-1 overflow-y-auto space-y-1 pe-0.5 custom-scroll">
				{#each filtered as log (log.timestamp + log.message)}
					{const logId = log.timestamp + log.message}
					{const isOpen = expandedId === logId}
					<button
						onclick={() => toggleExpand(logId)}
						class="w-full text-start group flex gap-3 rounded-2xl bg-surface-50 px-3 py-2.5 transition-colors hover:bg-surface-100 dark:bg-surface-800/60 dark:hover:bg-surface-700/60"
					>
						<iconify-icon
							icon={levelIcon(log.level)}
							class="mt-0.5 shrink-0 text-lg {levelCls(log.level)}"
						></iconify-icon>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-2">
								<span class="shrink-0 text-[11px] tabular-nums text-surface-400 dark:text-surface-500">
									{fmtTime(log.timestamp)}
								</span>
								<span class="text-xs font-semibold uppercase tracking-wider {levelCls(log.level)}">
									{log.level}
								</span>
							</div>
							<p class="mt-1 text-sm leading-snug text-surface-700 dark:text-surface-200 {isOpen ? '' : 'line-clamp-2'}">
								{log.message}
							</p>
							{#if isOpen && log.args && log.args.length > 0}
								<pre class="mt-2 overflow-x-auto rounded bg-surface-100 p-2 text-xs text-surface-600 dark:bg-surface-700 dark:text-surface-300">{JSON.stringify(log.args, null, 2)}</pre>
							{/if}
						</div>
						<iconify-icon
							icon={isOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}
							class="mt-1 shrink-0 text-sm text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity"
						></iconify-icon>
					</button>
				{/each}
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
	.scrollbar-none { scrollbar-width: none; }
	.scrollbar-none::-webkit-scrollbar { display: none; }
	.custom-scroll::-webkit-scrollbar { width: 4px; }
	.custom-scroll::-webkit-scrollbar-track { background: transparent; }
	.custom-scroll::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.25); border-radius: 9999px; }
	.custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.45); }
</style>
