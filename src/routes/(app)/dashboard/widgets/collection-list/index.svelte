<!--
@file src/routes/(app)/dashboard/widgets/collection-list/index.svelte
@component
**Dynamic Collection Item Feed Widget**

Displays the most recent (or custom-sorted) entries of any CMS collection with
status pills, relative timestamps, and one-click drill-down into the entry editor.

### Props
- `config` (DashboardWidgetConfig): Widget instance configuration and saved settings
- `label` (string): Title of the widget
- `theme` (string): 'light' | 'dark'
- `icon` (string): Iconify icon identifier
- `widgetId` (string): Unique identifier for this widget instance
- `size` (WidgetSize): Widget grid dimensions
- `onSizeChange` (function): Callback when widget size changes
- `onRemove` (function): Callback when widget is removed from dashboard

### Features:
- Live feed from any collection via the shared collection analytics service
- Configurable sorting: created, updated, or any schema date field (ASC/DESC)
- Item limit presets (3 / 5 / 10) with automatic h:1 compact mode
- Status pills following the status-shade contract (published/draft/scheduled/archived)
- Relative timestamps via @utils/date (hydration-safe)
- Direct entry drill-down into the full SveltyCMS editor
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Collection List',
		icon: 'mdi:format-list-bulleted',
		description: 'Dynamic, filterable collection item feed with direct entry drill-down',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { DashboardWidgetConfig, WidgetSize } from '@src/content/types';
	import { formatRelativeDate } from '@utils/date';
	import BaseWidget from '../../base-widget.svelte';
	import Button from '@components/ui/button.svelte';
	import Modal from '@components/ui/modal.svelte';
	import Input from '@components/ui/input.svelte';
	import { contentLanguage } from '@src/stores/locale-store.svelte';
	import { buildCollectionDrilldownHref } from '@utils/dashboard-drilldown';
	import type {
		CollectionSourceInfo,
		ListQueryResult
	} from '@src/services/analytics/collection-analytics-service';
	import {
		widget_list_configure_label,
		widget_list_configure_title,
		widget_list_no_collection,
		widget_list_configure_feed,
		widget_list_recent_entries_aria,
		widget_list_view_collection,
		widget_list_no_entries,
		widget_list_appear_created,
		widget_list_modal_title,
		widget_list_setting_title,
		widget_list_title_placeholder,
		widget_list_collection_label,
		widget_list_loading_collections,
		widget_list_sort_field,
		widget_list_direction,
		widget_list_newest_first,
		widget_list_oldest_first,
		widget_list_items_to_display,
		widget_list_cancel,
		widget_list_save
	} from '@src/paraglide/messages';

	const {
		config = undefined,
		label = 'Collection List',
		theme = 'light',
		icon = 'mdi:format-list-bulleted',
		widgetId = undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = (_newSize: WidgetSize) => {},
		onRemove = () => {}
	}: {
		config?: DashboardWidgetConfig;
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		onRemove?: () => void;
		currentUser?: unknown;
	} = $props();

	// Widget persistent configuration
	const savedSettings = $derived((config?.settings as Record<string, any>) || {});
	// Seed the editable state once from the initial config — the $effect below
	// re-syncs it whenever the config changes externally.
	const initialSettings = untrack(() => (config?.settings as Record<string, any>) || {});
	let selectedCollection = $state(initialSettings.collectionId || '');
	let sortField = $state(initialSettings.sortField || 'updatedAt');
	let sortDirection = $state(initialSettings.sortDirection || 'desc');
	let itemLimit = $state(initialSettings.limit || 5);
	let customTitle = $state(untrack(() => config?.label || label || 'Collection List'));

	// Settings modal & source introspection state
	let showSettingsModal = $state(false);
	let sources = $state<CollectionSourceInfo[]>([]);
	let sourcesLoading = $state(false);

	// Synchronize when config changes externally
	$effect(() => {
		if (config?.settings) {
			const s = config.settings as Record<string, any>;
			if (s.collectionId !== undefined) selectedCollection = s.collectionId;
			if (s.sortField !== undefined) sortField = s.sortField;
			if (s.sortDirection !== undefined) sortDirection = s.sortDirection;
			if (s.limit !== undefined) itemLimit = s.limit;
		}
		if (config?.label) {
			customTitle = config.label;
		}
	});

	// Load available collections for introspection
	async function loadSources() {
		if (sources.length > 0 || sourcesLoading) return;
		sourcesLoading = true;
		try {
			const res = await fetch('/api/dashboard/analytics/sources');
			if (res.ok) {
				const data = await res.json();
				sources = Array.isArray(data) ? data : [];
				if (!selectedCollection && sources.length > 0) {
					selectedCollection = sources[0].id || sources[0].name;
				}
			}
		} catch {
			// graceful fallback
		} finally {
			sourcesLoading = false;
		}
	}

	function openSettings() {
		loadSources();
		showSettingsModal = true;
	}

	async function saveSettings() {
		showSettingsModal = false;
		if (!widgetId && !config?.id) return;
		const id = widgetId || config?.id || 'collection-list';

		const updatedConfig: DashboardWidgetConfig = {
			id,
			component: 'collection-list',
			icon,
			label: customTitle.trim() || 'Collection List',
			size,
			order: config?.order,
			gridPosition: config?.gridPosition,
			settings: {
				...savedSettings,
				collectionId: selectedCollection,
				sortField,
				sortDirection,
				limit: itemLimit
			}
		};

		await systemPreferences.updateWidget(updatedConfig);
	}

	// Active collection meta
	const activeSource = $derived(
		sources.find((s) => s.id === selectedCollection || s.name === selectedCollection)
	);

	// Sort options: built-in timestamps plus any schema date field
	const sortFieldOptions = $derived.by(() => {
		const options = [
			{ value: 'updatedAt', label: 'Last updated' },
			{ value: 'createdAt', label: 'Created' }
		];
		for (const field of activeSource?.dateFields ?? []) {
			if (!options.some((option) => option.value === field.name)) {
				options.push({ value: field.name, label: field.label || field.name });
			}
		}
		return options;
	});

	// Construct the analytics list endpoint
	const endpointUrl = $derived.by(() => {
		const targetCol = selectedCollection || savedSettings.collectionId;
		if (!targetCol) return undefined;
		const params = new URLSearchParams({
			action: 'list',
			collectionId: targetCol,
			limit: String(itemLimit || savedSettings.limit || 5),
			sortField: sortField || savedSettings.sortField || 'updatedAt',
			sortDirection: sortDirection === 'asc' ? 'asc' : 'desc'
		});
		return `/api/dashboard/analytics?${params.toString()}`;
	});

	// Display helpers
	function itemTitle(item: Record<string, unknown>): string {
		for (const key of ['title', 'name', 'label', 'slug', 'path']) {
			const value = item[key];
			if (typeof value === 'string' && value.trim() !== '') return value;
		}
		return String(item._id ?? item.id ?? 'Untitled');
	}

	function itemDate(item: Record<string, unknown>): string {
		const value = item[sortField] ?? item.updatedAt ?? item.createdAt;
		return typeof value === 'string' ? value : '';
	}

	function statusPill(status: unknown): { label: string; cls: string } {
		const value = typeof status === 'string' ? status.toLowerCase() : '';
		switch (value) {
			case 'published':
				return { label: 'Published', cls: 'text-success-500 bg-success-500/10' };
			case 'draft':
				return { label: 'Draft', cls: 'text-warning-500 bg-warning-500/10' };
			case 'scheduled':
				return { label: 'Scheduled', cls: 'text-tertiary-500 bg-tertiary-500/10' };
			case 'archived':
				return { label: 'Archived', cls: 'text-(--admin-text-muted) bg-surface-500/10' };
			default:
				return {
					label: value ? String(status) : '—',
					cls: 'text-(--admin-text-muted) bg-surface-500/10'
				};
		}
	}
</script>

<BaseWidget
	label={customTitle}
	{theme}
	endpoint={endpointUrl}
	pollInterval={15000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: listData }: { data: ListQueryResult | undefined })}
		<div class="relative flex h-full flex-col overflow-hidden p-1">
			<!-- Header action bar: Configure -->
			<div class="flex items-center justify-between pb-1">
				<span
					class="truncate text-xs font-medium text-(--admin-text-muted) uppercase tracking-wider"
				>
					{activeSource?.label || activeSource?.name || selectedCollection || 'Collection'}
				</span>
				<Button
					variant="ghost"
					size="sm"
					class="p-1! h-auto min-w-0 text-(--admin-text-muted) hover:text-(--admin-text-muted)"
					onclick={openSettings}
					aria-label={widget_list_configure_label()}
					title={widget_list_configure_title()}
				>
					<iconify-icon icon="mdi:cog-outline" width={15}></iconify-icon>
				</Button>
			</div>

			{#if !selectedCollection && !savedSettings.collectionId}
				<!-- Unconfigured state -->
				<div class="flex flex-1 flex-col items-center justify-center p-3 text-center">
					<iconify-icon
						icon="mdi:format-list-bulleted"
						width={32}
						class="mb-2 text-(--admin-text-muted)"
					></iconify-icon>
					<p class="text-sm font-medium text-(--admin-text-muted)">{widget_list_no_collection()}</p>
					<Button variant="outline" size="sm" class="mt-2 text-xs" onclick={openSettings}>
						{widget_list_configure_feed()}
					</Button>
				</div>
			{:else if listData && listData.items.length > 0}
				{@const visible =
					size.h === 1 ? listData.items.slice(0, 1) : listData.items.slice(0, itemLimit)}
				<div
					class="custom-scroll flex-1 space-y-1 overflow-y-auto pe-1"
					role="list"
					aria-label={widget_list_recent_entries_aria()}
				>
					{#each visible as item, idx (String(item._id ?? item.id ?? idx))}
						{@const pill = statusPill(item.status)}
						{@const date = itemDate(item)}
						<div role="listitem">
							<a
								href={`/${contentLanguage.value}/${selectedCollection || savedSettings.collectionId}?edit=${String(item._id ?? item.id ?? '')}`}
								data-preload="hover"
								class="group flex items-center gap-2.5 rounded px-2.5 py-2 transition-colors hover:bg-surface-500/10 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-hidden"
							>
								<div class="min-w-0 flex-1">
									<div
										class="truncate text-sm font-medium text-(--admin-text-body) group-hover:text-primary-500"
									>
										{itemTitle(item)}
									</div>
									{#if date}
										<div class="mt-0.5 text-xs tabular-nums text-(--admin-text-muted)">
											{formatRelativeDate(date)}
										</div>
									{/if}
								</div>
								<span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium {pill.cls}">
									{pill.label}
								</span>
								<iconify-icon
									icon="mdi:chevron-right"
									width={13}
									class="shrink-0 text-(--admin-text-muted) rtl:scale-x-[-1]"
								></iconify-icon>
							</a>
						</div>
					{/each}
				</div>
				<div class="mt-1.5 border-t border-surface-500/10 pt-1">
					<a
						href={buildCollectionDrilldownHref({
							language: contentLanguage.value,
							collection: selectedCollection || savedSettings.collectionId
						})}
						class="inline-flex items-center gap-1 text-xs font-medium text-(--admin-text-muted) transition-colors hover:text-primary-500"
					>
						<span>{widget_list_view_collection()}</span>
						<iconify-icon icon="mdi:arrow-right" width={12}></iconify-icon>
					</a>
				</div>
			{:else if listData}
				<!-- Empty state -->
				<div class="flex flex-1 flex-col items-center justify-center p-3 text-center" role="status">
					<iconify-icon icon="mdi:inbox-outline" width={28} class="mb-1.5 text-(--admin-text-muted)"
					></iconify-icon>
					<p class="text-xs font-medium text-(--admin-text-muted)">{widget_list_no_entries()}</p>
					<p class="mt-0.5 text-[10px] text-(--admin-text-muted)">{widget_list_appear_created()}</p>
				</div>
			{/if}
		</div>
	{/snippet}
</BaseWidget>

<!-- Configuration Modal -->
{#if showSettingsModal}
	<Modal
		open={showSettingsModal}
		title={widget_list_modal_title()}
		onclose={() => (showSettingsModal = false)}
	>
		<div class="flex flex-col gap-4 p-4">
			<!-- Widget Title -->
			<div>
				<label
					for="list-title-{widgetId}"
					class="mb-1 block text-xs font-semibold text-(--admin-text-muted)"
				>
					{widget_list_setting_title()}
				</label>
				<Input
					id="list-title-{widgetId}"
					bind:value={customTitle}
					placeholder={widget_list_title_placeholder()}
				/>
			</div>

			<!-- Collection Source -->
			<div>
				<label
					for="list-collection-{widgetId}"
					class="mb-1 block text-xs font-semibold text-(--admin-text-muted)"
				>
					{widget_list_collection_label()}
				</label>
				<select
					id="list-collection-{widgetId}"
					bind:value={selectedCollection}
					class="w-full rounded border border-(--admin-border-subtle) bg-(--admin-input-bg) px-3 py-2 text-sm text-(--admin-text-body) focus:ring-2 focus:ring-primary-500"
				>
					{#if sources.length === 0}
						<option value="">{widget_list_loading_collections()}</option>
					{:else}
						{#each sources as src (src.id)}
							<option value={src.id}>{src.label || src.name}</option>
						{/each}
					{/if}
				</select>
			</div>

			<!-- Sorting -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label
						for="list-sort-field-{widgetId}"
						class="mb-1 block text-xs font-semibold text-(--admin-text-muted)"
					>
						{widget_list_sort_field()}
					</label>
					<select
						id="list-sort-field-{widgetId}"
						bind:value={sortField}
						class="w-full rounded border border-(--admin-border-subtle) bg-(--admin-input-bg) px-3 py-2 text-sm text-(--admin-text-body) focus:ring-2 focus:ring-primary-500"
					>
						{#each sortFieldOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>

				<div>
					<label
						for="list-sort-direction-{widgetId}"
						class="mb-1 block text-xs font-semibold text-(--admin-text-muted)"
					>
						{widget_list_direction()}
					</label>
					<select
						id="list-sort-direction-{widgetId}"
						bind:value={sortDirection}
						class="w-full rounded border border-(--admin-border-subtle) bg-(--admin-input-bg) px-3 py-2 text-sm text-(--admin-text-body) focus:ring-2 focus:ring-primary-500"
					>
						<option value="desc">{widget_list_newest_first()}</option>
						<option value="asc">{widget_list_oldest_first()}</option>
					</select>
				</div>
			</div>

			<!-- Item limit -->
			<div>
				<label
					for="list-limit-{widgetId}"
					class="mb-1 block text-xs font-semibold text-(--admin-text-muted)"
				>
					{widget_list_items_to_display()}
				</label>
				<select
					id="list-limit-{widgetId}"
					bind:value={itemLimit}
					class="w-full rounded border border-(--admin-border-subtle) bg-(--admin-input-bg) px-3 py-2 text-sm text-(--admin-text-body) focus:ring-2 focus:ring-primary-500"
				>
					<option value={3}>3</option>
					<option value={5}>5</option>
					<option value={10}>10</option>
				</select>
			</div>

			<!-- Modal Actions -->
			<div class="mt-4 flex justify-end gap-2 border-t border-surface-500/20 pt-3">
				<Button variant="outline" onclick={() => (showSettingsModal = false)}
					>{widget_list_cancel()}</Button
				>
				<Button variant="primary" onclick={saveSettings}>{widget_list_save()}</Button>
			</div>
		</div>
	</Modal>
{/if}

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
