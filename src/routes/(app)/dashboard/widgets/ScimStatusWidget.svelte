<!-- 
 @file src/routes/(app)/dashboard/widgets/ScimStatusWidget.svelte
 @component SCIM Status widget using BaseWidget

 Features:
 - Widget Meta data
 - Widget Props
 - Widget Snippets
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Identity Sync',
		icon: 'mdi:cloud-sync',
		description: 'Monitor SCIM identity synchronization status',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	import type { WidgetSize } from '@src/content/types';

	const {
		label = 'Identity Sync',
		theme = 'light',
		icon = 'mdi:cloud-sync',
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

	// Mock stats for now, real implementation would fetch from an endpoint
	const activeUsers = 24;
	const lastSync = 'Just now';
	const provider = 'Okta / Azure';
</script>

<BaseWidget {label} {theme} {icon} {widgetId} {size} {onSizeChange} onCloseRequest={onRemove}>
	{#snippet children()}
		<div class="flex h-full flex-col justify-between py-2">
			<div class="my-4 grid grid-cols-2 gap-3">
				<div class="rounded-lg bg-surface-100 p-3 text-center dark:bg-surface-700">
					<div class="text-xl font-bold text-success-600 dark:text-success-400">Active</div>
					<div class="text-[9px] uppercase tracking-wider opacity-60">Status</div>
				</div>
				<div class="rounded-lg bg-surface-100 p-3 text-center dark:bg-surface-700">
					<div class="text-xl font-bold">{activeUsers}</div>
					<div class="text-[9px] uppercase tracking-wider opacity-60">Synced</div>
				</div>
			</div>

			<div class="space-y-2 text-xs">
				<div class="flex items-center justify-between">
					<span class="opacity-70">Last Sync</span>
					<span class="font-mono">{lastSync}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="opacity-70">Provider</span>
					<span class="font-mono text-primary-600 dark:text-primary-400 text-[10px]">{provider}</span>
				</div>
			</div>

			<div class="mt-4 border-t border-surface-100 pt-3 dark:border-surface-700">
				<div class="flex items-center gap-1 text-[11px] font-medium text-success-600 dark:text-success-400">
					<iconify-icon icon="mdi:check-circle" width={16}></iconify-icon>
					Endpoints Healthy
				</div>
			</div>
		</div>
	{/snippet}
</BaseWidget>
