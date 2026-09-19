<!--
@file src/routes/(app)/dashboard/widgets/logs/index.svelte
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
	import { getClientLicenseStatus } from '@utils/client-license-cache';
	import type { LicenseStatus } from '@utils/license-manager';

	let licenseStatus = $state<LicenseStatus | null>(null);

	$effect(() => {
		getClientLicenseStatus('dashboard', 'logs').then((status) => {
			licenseStatus = status;
		});
	});

	const isLicensed = $derived(Boolean(licenseStatus?.hasLicense));

	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../../base-widget.svelte';
	import Select from '@components/ui/select.svelte';
	import { formatTime } from '@utils/format-date';
	import {
		widget_logs_level,
		widget_logs_search_label,
		widget_logs_search_ph,
		widget_logs_date_from,
		widget_logs_date_to,
		widget_logs_premium_notice,
		widget_logs_upgrade,
		widget_logs_no_match,
		widget_logs_none,
		widget_logs_count
	} from '@src/paraglide/messages';

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
	let expandedKey = $state<string | null>(null);

	const levels = [
		{ value: 'all', label: 'All Levels' },
		{ value: 'error', label: 'Errors' },
		{ value: 'warn', label: 'Warnings' },
		{ value: 'info', label: 'Info' },
		{ value: 'debug', label: 'Debug' }
	];

	function levelBg(lvl: string): string {
		switch ((lvl || '').toLowerCase()) {
			case 'error': return 'bg-error-500/10 dark:bg-error-900/20';
			case 'warn': return 'bg-warning-500/10 dark:bg-warning-900/20';
			case 'info': return 'bg-tertiary-500/10 dark:bg-primary-900/20';
			default: return 'bg-surface-500/10 dark:bg-surface-800';
		}
	}

	function levelCls(lvl: string): string {
		switch ((lvl || '').toLowerCase()) {
			case 'error': return 'text-error-500';
			case 'warn': return 'text-warning-500';
			case 'info': return 'text-tertiary-500 dark:text-primary-400';
			default: return 'text-surface-400';
		}
	}

	function levelIcon(lvl: string): string {
		switch ((lvl || '').toLowerCase()) {
			case 'error': return 'mdi:alert-circle';
			case 'warn': return 'mdi:alert';
			case 'info': return 'mdi:information';
			default: return 'mdi:text-box-outline';
		}
	}

	function filterLogs(logs: LogEntry[]): LogEntry[] {
		let result = logs;
		if (filterLevel !== 'all') {
			result = result.filter((l) => (l.level || '').toLowerCase() === filterLevel);
		}
		if (searchTerm.trim()) {
			const q = searchTerm.toLowerCase();
			result = result.filter(
				(l) =>
					l.message?.toLowerCase().includes(q) ||
					l.actor?.toLowerCase().includes(q) ||
					l.level?.toLowerCase().includes(q)
			);
		}
		if (startDate) {
			result = result.filter((l) => l.timestamp >= startDate);
		}
		if (endDate) {
			const end = endDate + 'T23:59:59.999Z';
			result = result.filter((l) => l.timestamp <= end);
		}
		return result;
	}

	function toggleExpand(key: string) {
		expandedKey = expandedKey === key ? null : key;
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/logs?limit=50"
	pollInterval={10000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{const allLogs = (Array.isArray(data) ? data : []) as LogEntry[]}
		{const filtered = filterLogs(allLogs)}

		{#if !isCompact}
			<!-- Controls (rich layout only) -->
			<div class="mb-3 flex flex-wrap items-center gap-2">
				<div class="w-28">
					<Select
						label={widget_logs_level()}
						bind:value={filterLevel}
						options={levels}
						size="sm"
					/>
				</div>

				<div class="relative flex-1 min-w-30">
					<input aria-label={widget_logs_search_label()}
						type="text"
						bind:value={searchTerm}
						placeholder={widget_logs_search_ph()}
						class="w-full rounded border border-surface-500/30 bg-surface-500/10 py-1.5 ps-8 pe-3 text-xs text-surface-700 placeholder-surface-400 focus:border-primary-500 focus:outline-none dark:border-surface-500/40 dark:bg-surface-800 dark:text-surface-200"
					/>
					<iconify-icon icon="mdi:magnify" width="14" class="absolute inset-s-2.5 top-1/2 -translate-y-1/2 text-surface-400"  ></iconify-icon>
				</div>

				{#if isLicensed}
					<input aria-label={widget_logs_date_from()}
						type="date"
						bind:value={startDate}
						class="rounded border border-surface-500/30 bg-surface-500/10 px-2 py-1.5 text-xs text-surface-700 focus:border-primary-500 focus:outline-none dark:border-surface-500/40 dark:bg-surface-800 dark:text-surface-200"
					/>
					<span class="text-xs text-surface-400">–</span>
					<input aria-label={widget_logs_date_to()}
						type="date"
						bind:value={endDate}
						class="rounded border border-surface-500/30 bg-surface-500/10 px-2 py-1.5 text-xs text-surface-700 focus:border-primary-500 focus:outline-none dark:border-surface-500/40 dark:bg-surface-800 dark:text-surface-200"
					/>
				{/if}
			</div>
		{/if}

		<!-- Premium upgrade banner for date range filtering -->
		{#if !isLicensed && !isCompact}
			<div class="mt-2 rounded-lg bg-warning-500/10 dark:bg-warning-900/20 border border-warning-500/20 dark:border-warning-500/40 px-3 py-2 flex items-center justify-between">
				<span class="text-xs text-warning-600 dark:text-warning-400">
					<iconify-icon icon="mdi:crown" class="inline me-1 text-warning-500"></iconify-icon>
					{widget_logs_premium_notice()}
				</span>
				<a href="https://marketplace.sveltycms.com" target="_blank" class="text-xs font-medium text-warning-600 dark:text-warning-400 hover:text-warning-600 underline shrink-0 ms-3">{widget_logs_upgrade()}</a>
			</div>
		{/if}

		{#if filtered.length === 0}
			<div class="flex h-full flex-col items-center justify-center text-center">
				<iconify-icon icon="mdi:text-box-remove-outline" class="text-4xl opacity-20 mb-3"  ></iconify-icon>
				<div class="text-sm font-medium text-surface-500">
					{#if searchTerm || filterLevel !== 'all' || startDate || endDate}
						{widget_logs_no_match()}
					{:else}
						{widget_logs_none()}
					{/if}
				</div>
			</div>
		{:else if isCompact}
			<!-- Compact (h:1): horizontal scroll of log chips -->
			<div class="flex h-full items-center gap-2 overflow-hidden">
				<span class="shrink-0 text-xs font-semibold text-surface-500">{widget_logs_count({ count: filtered.length })}</span>
				<div class="h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-700"></div>
				<div class="flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
					{#each filtered.slice(0, 12) as log (log.timestamp + log.message)}
						<button
							onclick={() => toggleExpand(log.timestamp + log.message)}
							class="flex shrink-0 items-center gap-1 rounded-full {levelBg(log.level)} px-2 py-0.5 hover:opacity-80 transition-opacity"
							title="{log.level.toUpperCase()}: {log.message}"
						>
							<iconify-icon icon={levelIcon(log.level)} class="text-xs {levelCls(log.level)}" ></iconify-icon>
							<span class="max-w-20 truncate text-[10px] font-medium text-surface-600 dark:text-surface-400">
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
					{const isOpen = expandedKey === logId}
					<button
						onclick={() => toggleExpand(logId)}
						class="w-full text-start group flex gap-3 rounded-2xl bg-surface-500/10 px-3 py-2.5 transition-colors hover:bg-surface-500/10 dark:bg-surface-800/60 dark:hover:bg-surface-700/60"
					>
						<iconify-icon
							icon={levelIcon(log.level)}
							class="mt-0.5 shrink-0 text-lg {levelCls(log.level)}"
						></iconify-icon>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-2">
								<span class="shrink-0 text-[11px] tabular-nums text-surface-400 dark:text-surface-500">
									{formatTime(log.timestamp)}
								</span>
								<span class="text-xs font-semibold uppercase tracking-wider {levelCls(log.level)}">
									{log.level}
								</span>
							</div>
							<p class="mt-1 text-sm leading-snug text-surface-600 dark:text-surface-400 {isOpen ? '' : 'line-clamp-2'}">
								{log.message}
							</p>
							{#if isOpen && log.args && log.args.length > 0}
								<pre class="mt-2 overflow-x-auto rounded bg-surface-500/10 p-2 text-xs text-surface-600 dark:bg-surface-700 dark:text-surface-300">{JSON.stringify(log.args, null, 2)}</pre>
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
