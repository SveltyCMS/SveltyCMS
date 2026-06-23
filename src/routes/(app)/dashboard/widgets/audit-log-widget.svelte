<!--
@file src/routes/(app)/dashboard/widgets/AuditLogWidget.svelte
@component
**Modern Audit Log Widget — Recent system activity with compact and rich layouts**

### Props
- `label` (string): Widget label (default: 'Audit Log')
- `size` (WidgetSize): Controls layout — h:1 compact timeline, h:2+ rich card list

### Features:
- Adaptive dual layout: compact (h:1) horizontal event timeline, rich (h:2+) scrollable card list
- Color-coded action icons (create=green, delete=red, auth=blue, etc.)
- Result badge pills (success/failure)
- Clickable rows navigate to /config/monitor for full audit details
- Modern card styling with hover micro-animations
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "Audit Log",
	icon: "mdi:history",
	description: "Monitor system activity and security events",
	defaultSize: { w: 1, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface AuditEntry {
		_id?: string;
		action: string;
		eventType?: string;
		message?: string;
		actorEmail?: string;
		userEmail?: string;
		result?: string;
		severity?: string;
		timestamp: string;
	}

	const {
		label = 'Audit Log',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:history',
		widgetId = undefined as string | undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	const isCompact = $derived(size.h === 1);

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function actorName(email: string | undefined = undefined): string {
		if (!email) return 'System';
		return email.split('@')[0];
	}

	function actionIcon(action: string): string {
		const a = (action || '').toLowerCase();
		if (a.includes('login') || a.includes('auth')) return 'mdi:login';
		if (a.includes('create')) return 'mdi:plus-circle-outline';
		if (a.includes('update') || a.includes('edit')) return 'mdi:pencil-outline';
		if (a.includes('delete') || a.includes('remove')) return 'mdi:delete-outline';
		if (a.includes('block') || a.includes('ban') || a.includes('lock')) return 'mdi:shield-off-outline';
		if (a.includes('upload') || a.includes('media')) return 'mdi:image-outline';
		if (a.includes('config') || a.includes('setting')) return 'mdi:cog-outline';
		return 'mdi:circle-small';
	}

	function actionColor(action: string, result: string | undefined = undefined): string {
		if (result === 'failure') return 'text-red-500 dark:text-red-400';
		const a = (action || '').toLowerCase();
		if (a.includes('delete') || a.includes('remove')) return 'text-orange-500 dark:text-orange-400';
		if (a.includes('block') || a.includes('ban')) return 'text-amber-500 dark:text-amber-400';
		if (a.includes('create')) return 'text-emerald-500 dark:text-emerald-400';
		if (a.includes('update') || a.includes('edit')) return 'text-blue-500 dark:text-blue-400';
		if (a.includes('login') || a.includes('auth')) return 'text-purple-500 dark:text-purple-400';
		return 'text-surface-500';
	}

	function resultBadgeClass(result: string): string {
		return result === 'success'
			? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
			: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
	}

	let licenseStatus = $state<{ active?: boolean; hasLicense?: boolean; daysRemaining?: number | null } | null>(null);

	$effect(() => {
		fetch('/api/system/license-status?type=dashboard&id=audit-log')
			.then((res) => res.json())
			.then((data) => {
				licenseStatus = data;
			})
			.catch(() => {
				licenseStatus = { active: false, hasLicense: false, daysRemaining: 0 };
			});
	});
</script>

{#if licenseStatus && !licenseStatus.active && !licenseStatus.hasLicense}
	<BaseWidget
		{label}
		{theme}
		{icon}
		{widgetId}
		{size}
		{onSizeChange}
		onCloseRequest={onRemove}
	>
		<div class="flex h-full flex-col items-center justify-center text-center px-4 bg-surface-50 dark:bg-surface-800/50 rounded-lg">
			<iconify-icon icon="mdi:lock-outline" class="text-4xl text-amber-500 mb-2"></iconify-icon>
			<h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Premium Extension</h3>
			<p class="text-xs text-surface-500 mt-1 mb-3">Your 14-day trial for Audit Log has expired. A valid LICENSE_KEY is required.</p>
			<a href="https://marketplace.sveltycms.com" target="_blank" class="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">Upgrade License &rarr;</a>
		</div>
	</BaseWidget>
{:else}
<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/audit?limit=8"
	pollInterval={25000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{const logs = (Array.isArray(data) ? data : []) as AuditEntry[]}

		{#if logs.length === 0}
			<!-- ===== Empty ===== -->
			<div class="flex h-full flex-col items-center justify-center text-center">
				<iconify-icon icon="mdi:history" class="text-4xl opacity-20 mb-3"></iconify-icon>
				<div class="text-sm font-medium text-surface-500">No recent activity</div>
				<div class="text-xs text-surface-400 mt-1">Events will appear here</div>
			</div>
		{:else if isCompact}
			<!-- ===== Compact (h:1) ===== -->
			<div class="flex h-full items-center gap-2 overflow-hidden">
				<span class="shrink-0 text-xs font-semibold text-surface-500">{logs.length} events</span>
				<div class="h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-700"></div>
				<div class="flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
					{#each logs.slice(0, 8) as log (log._id || log.timestamp)}
						<a
							href="/config/monitor"
							class="flex shrink-0 items-center gap-1 rounded-full bg-surface-100 px-2 py-1 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
							title="{log.action} — {actorName(log.actorEmail || log.userEmail)} · {formatTime(log.timestamp)}"
						>
							<iconify-icon icon={actionIcon(log.action)} class="text-sm {actionColor(log.action, log.result)}" ></iconify-icon>
							<span class="max-w-15 truncate text-[11px] font-medium text-surface-700 dark:text-surface-300">
								{log.action || log.eventType}
							</span>
						</a>
					{/each}
				</div>
			</div>
		{:else}
			<!-- ===== Rich (h:2+) ===== -->
			<div class="flex h-full flex-col">
				<div class="flex-1 overflow-y-auto space-y-1 pe-0.5 custom-scroll" role="list" aria-label="Audit log entries">
					{#each logs as log (log._id || log.timestamp)}
						<a
							href="/config/monitor"
							aria-label={log.action || log.eventType || 'System Event'}
							class="group flex gap-3 rounded-2xl bg-surface-50 px-3 py-2.5 transition-colors hover:bg-surface-100 dark:bg-surface-800/60 dark:hover:bg-surface-700/60"
						>
							<!-- Icon -->
							<div class="shrink-0 mt-0.5">
								<iconify-icon
									icon={actionIcon(log.action)}
									class="text-lg {actionColor(log.action, log.result)}"
								></iconify-icon>
							</div>

							<!-- Content -->
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline justify-between gap-2">
									<span class="truncate text-sm font-medium text-surface-900 dark:text-surface-100 group-hover:text-tertiary-600 dark:group-hover:text-primary-400 transition-colors">
										{log.action || log.eventType || 'System Event'}
									</span>
									<span class="shrink-0 text-[11px] tabular-nums text-surface-400 dark:text-surface-500">
										{formatTime(log.timestamp)}
									</span>
								</div>

								<div class="mt-1 flex items-center gap-2">
									<span class="text-xs text-surface-500">
										{actorName(log.actorEmail || log.userEmail)}
									</span>
									{#if log.result}
										<span class="rounded-full px-1.5 py-px text-[10px] font-medium {resultBadgeClass(log.result)}">
											{log.result}
										</span>
									{/if}
									{#if log.message}
										<span class="truncate text-[10px] text-surface-400 dark:text-surface-500">
											{log.message}
										</span>
									{/if}
								</div>
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
{/if}

<style>
	.scrollbar-none {
		scrollbar-width: none;
	}
	.scrollbar-none::-webkit-scrollbar {
		display: none;
	}
	.custom-scroll::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scroll::-webkit-scrollbar-thumb {
		background: rgba(156, 163, 175, 0.25);
		border-radius: 9999px;
	}
	.custom-scroll::-webkit-scrollbar-thumb:hover {
		background: rgba(156, 163, 175, 0.45);
	}
</style>
