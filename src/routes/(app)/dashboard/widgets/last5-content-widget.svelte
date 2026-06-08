<!--
@file src/routes/(app)/dashboard/widgets/last5-content-widget.svelte
@component
**Clean, performant "Last 5 Content" widget with modern responsive layout**

### Props
- `label` (string): The label for the widget (default: 'Last 5 Content')
- `theme` (string): Theme mode ('light' | 'dark')
- `icon` (string): Icon identifier (default: 'mdi:file-document-multiple-outline')
- `size` (WidgetSize): Widget dimensions (default: { w: 1, h: 2 })

### Features:
- Responsive layout adapting to `h:1` compact constraints (displays single latest item)
- Modern cards with micro-animations and status colors
- Full accessibility compliance (ARIA list/region, keyboard nav support)
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "Last 5 Content",
	icon: "mdi:file-document-multiple-outline",
	defaultSize: { w: 1, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import { formatRelativeDate } from '@utils/date';
	import { app } from '@src/stores/store.svelte';
	import BaseWidget from '../base-widget.svelte';

	interface ContentItem {
		id: string;
		title: string;
		collection: string;
		createdAt: string;
		createdBy: string;
		status: string;
	}

	type FetchedData = ContentItem[] | undefined;

	const {
		label = 'Last 5 Content',
		theme = 'light',
		icon = 'mdi:file-document-multiple-outline',
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

	function getStatusColor(status: string) {
		switch (status?.toLowerCase()) {
			case 'published': return 'bg-emerald-500';
			case 'draft': return 'bg-amber-500';
			case 'archived': return 'bg-gray-500';
			default: return 'bg-zinc-400';
		}
	}

	function getStatusLabel(status: string) {
		return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/last5Content"
	pollInterval={30000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: items }: { data: FetchedData })}
		{#if items && Array.isArray(items) && items.length > 0}
			{const limit = size.h === 1 ? 1 : 5}
			<div class="flex flex-col h-full overflow-hidden" role="region" aria-label="Recent content items">
				<div 
					class="flex-1 overflow-y-auto pe-1 space-y-1.5 custom-scroll" 
					role="list"
					aria-label="Recent content"
				>
					{#each items.slice(0, limit) as item (item.id)}
						<div role="listitem">
							<a
								href={`/${app.contentLanguage}/${item.collection}?edit=${item.id}`}
								data-sveltekit-preload-data="hover"
								class="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all hover:bg-gray-50 dark:hover:bg-gray-800/60 active:scale-[0.985] outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 border border-transparent hover:border-gray-100 dark:hover:border-gray-800"
							>
								<!-- Status Circle Dot -->
								<div class="mt-1 shrink-0">
									<div 
										class="h-2.5 w-2.5 rounded-full {getStatusColor(item.status)} ring-2 ring-white dark:ring-gray-900" 
										title="Status: {getStatusLabel(item.status)}"
									></div>
								</div>

								<!-- Content Metadata -->
								<div class="min-w-0 flex-1">
									<div class="font-medium text-sm text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
										{item.title}
									</div>
									<div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1.5">
										<span class="font-mono text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.2 rounded-sm text-gray-600 dark:text-gray-400">{item.collection}</span>
										<span class="opacity-40">•</span>
										<span class="tabular-nums">{formatRelativeDate(item.createdAt)}</span>
									</div>
								</div>

								<!-- Creator email abbreviation -->
								{#if size.w >= 2 || size.h >= 2}
									<div class="text-end text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0 pt-0.5" title="Author: {item.createdBy}">
										{item.createdBy?.split('@')[0] || '—'}
									</div>
								{/if}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center py-6 text-center" role="status">
				<div class="text-4xl text-gray-300 dark:text-gray-600 mb-2">
					<iconify-icon icon="mdi:file-remove-outline" width={32}></iconify-icon>
				</div>
				<div class="text-xs font-semibold text-gray-600 dark:text-gray-400">No recent content</div>
				<div class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">New items will appear here</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
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
