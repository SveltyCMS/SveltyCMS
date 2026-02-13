<!--
@file src/routes/(app)/dashboard/widgets/AuditLogWidget.svelte
@component Audit Log widget using BaseWidget

Features:
- Widget Meta data
- Widget Props
- Widget Snippets
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Audit Log',
		icon: 'mdi:history',
		description: 'Monitor system activity and security events',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	import type { WidgetSize } from '@src/content/types';

	const {
		label = 'Audit Log',
		theme = 'light',
		icon = 'mdi:history',
		widgetId = undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = (_newSize: WidgetSize) => {},
		onRemove = () => {}
	}: {
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		onRemove?: () => void;
	} = $props();

	function formatDate(isoString: string) {
		return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function truncateEmail(email: string) {
		if (!email) return 'System';
		return email.split('@')[0];
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/audit?limit=10"
	pollInterval={30000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
	showRefreshButton={true}
>
	{#snippet children({ data })}
		{#if !data || data.length === 0}
			<div class="flex h-full items-center justify-center text-sm">No recent activity</div>
		{:else}
			<div class="flex-1 overflow-auto">
				<table class="w-full text-left text-[11px]">
					<thead class="sticky top-0 bg-white dark:bg-surface-800">
						<tr>
							<th class="py-2 pr-2 font-semibold opacity-70">Action</th>
							<th class="py-2 pr-2 font-semibold opacity-70">Actor</th>
							<th class="py-2 text-center font-semibold opacity-70">Ver.</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-surface-100 dark:divide-surface-700">
						{#each data as log (log._id || log.timestamp)}
							<tr class="group hover:bg-surface-50 dark:hover:bg-surface-700/50">
								<td class="py-2 pr-2">
									<div class="flex flex-col">
										<span class="font-medium text-tertiary-500 dark:text-primary-500">{log.action}</span>
										<span class="text-[9px] opacity-50">{formatDate(log.timestamp)}</span>
									</div>
								</td>
								<td class="max-w-[80px] truncate py-2 pr-2 pt-3" title={log.actor?.email}>
									{truncateEmail(log.actor?.email)}
								</td>
								<td class="py-2 pt-3 text-center text-primary-500">
									<iconify-icon icon="mdi:history" width={24}></iconify-icon>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
