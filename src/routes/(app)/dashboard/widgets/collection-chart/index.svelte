<!--
@file src/routes/(app)/dashboard/widgets/collection-chart/index.svelte
@component
**Interactive Collection Chart Widget**

Renders zero-dependency SVG bar, column, and area charts powered by collection data.
Supports time-series binning and categorical distributions with live drill-down.

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
- Pure SVG rendering (zero external chart dependencies, lightweight, responsive)
- Group by Time (day, week, month, year) or Categorical Field (status, category, author)
- Chart styles: Vertical Column, Horizontal Bar, and Smooth Area/Line
- Interactive hover tooltips displaying value, formatted count, and percentage share
- Interactive drill-down: clicking on a bar or category filters the collection table
- In-place configuration modal persisted directly into systemPreferences
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Collection Chart',
		icon: 'mdi:chart-bar',
		description:
			'Interactive time-series and categorical charts powered by collection data with pure SVG rendering',
		defaultSize: { w: 2, h: 2 }
	};
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { DashboardWidgetConfig, WidgetSize } from '@src/content/types';
	import BaseWidget from '../../base-widget.svelte';
	import Button from '@components/ui/button.svelte';
	import Modal from '@components/ui/modal.svelte';
	import Input from '@components/ui/input.svelte';
	import { contentLanguage } from '@src/stores/locale-store.svelte';
	import { buildCollectionDrilldownHref, isFilterableBucket } from '@utils/dashboard-drilldown';
	import { systemPreferences } from '../../dashboard-preferences.svelte';
	import type {
		CollectionSourceInfo,
		ChartQueryResult
	} from '@src/services/analytics/collection-analytics-service';

	const {
		config = undefined,
		label = 'Collection Chart',
		theme = 'light',
		icon = 'mdi:chart-bar',
		widgetId = undefined,
		size = { w: 2, h: 2 } as WidgetSize,
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

	// Modal & Source introspection state
	let showSettingsModal = $state(false);
	let sources = $state<CollectionSourceInfo[]>([]);
	let sourcesLoading = $state(false);

	// Saved or current settings
	const savedSettings = $derived((config?.settings as Record<string, any>) || {});
	// Seed the editable state once from the initial config — the $effect below
	// re-syncs it whenever the config changes externally.
	const initialSettings = untrack(() => (config?.settings as Record<string, any>) || {});
	let selectedCollection = $state(initialSettings.collectionId || '');
	let chartType = $state(initialSettings.chartType || 'column'); // 'column' | 'bar' | 'area'
	let groupByMode = $state(initialSettings.groupBy || 'time'); // 'time' | 'field'
	let selectedGroupField = $state(initialSettings.groupField || 'status');
	let timeGranularity = $state(initialSettings.timeGranularity || 'day'); // 'day' | 'week' | 'month' | 'year'
	let selectedMeasure = $state(initialSettings.measure || 'count'); // 'count' | 'sum' | 'avg'
	let selectedMetricField = $state(initialSettings.metricField || '');
	let selectedPeriod = $state(initialSettings.period || 'last30');
	let itemLimit = $state(initialSettings.limit || 8);
	let customTitle = $state(untrack(() => config?.label || label || 'Collection Chart'));
	let colorAccent = $state(initialSettings.color || 'primary');

	// Hover tooltip state
	let hoveredIndex = $state<number | null>(null);

	// Synchronize when config changes externally
	$effect(() => {
		if (config?.settings) {
			const s = config.settings as Record<string, any>;
			if (s.collectionId !== undefined) selectedCollection = s.collectionId;
			if (s.chartType !== undefined) chartType = s.chartType;
			if (s.groupBy !== undefined) groupByMode = s.groupBy;
			if (s.groupField !== undefined) selectedGroupField = s.groupField;
			if (s.timeGranularity !== undefined) timeGranularity = s.timeGranularity;
			if (s.measure !== undefined) selectedMeasure = s.measure;
			if (s.metricField !== undefined) selectedMetricField = s.metricField;
			if (s.period !== undefined) selectedPeriod = s.period;
			if (s.limit !== undefined) itemLimit = s.limit;
			if (s.color !== undefined) colorAccent = s.color;
		}
		if (config?.label) {
			customTitle = config.label;
		}
	});

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
			// fallback
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
		const id = widgetId || config?.id || 'collection-chart';

		const updatedConfig: DashboardWidgetConfig = {
			id,
			component: 'collection-chart',
			icon,
			label: customTitle.trim() || 'Collection Chart',
			size,
			order: config?.order,
			gridPosition: config?.gridPosition,
			settings: {
				...savedSettings,
				collectionId: selectedCollection,
				chartType,
				groupBy: groupByMode,
				groupField: selectedGroupField,
				timeGranularity,
				measure: selectedMeasure,
				metricField: selectedMetricField,
				period: selectedPeriod,
				limit: Number(itemLimit) || 8,
				color: colorAccent
			}
		};

		await systemPreferences.updateWidget(updatedConfig);
	}

	const activeSource = $derived(
		sources.find((s) => s.id === selectedCollection || s.name === selectedCollection)
	);

	// Construct dynamic chart API endpoint
	const endpointUrl = $derived.by(() => {
		const targetCol = selectedCollection || savedSettings.collectionId;
		if (!targetCol) return undefined;
		const params = new URLSearchParams({
			action: 'chart',
			collectionId: targetCol,
			groupBy: groupByMode || savedSettings.groupBy || 'time',
			timeGranularity: timeGranularity || savedSettings.timeGranularity || 'day',
			measure: selectedMeasure || savedSettings.measure || 'count',
			period: selectedPeriod || savedSettings.period || 'last30',
			limit: String(itemLimit || savedSettings.limit || 8)
		});
		const gf = selectedGroupField || savedSettings.groupField;
		if (gf && groupByMode === 'field') params.set('groupField', gf);
		const mf = selectedMetricField || savedSettings.metricField;
		if (mf && selectedMeasure !== 'count') params.set('metricField', mf);

		return `/api/dashboard/analytics?${params.toString()}`;
	});

	function formatDisplayValue(val: number): string {
		if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
		if (val >= 10_000) return (val / 1_000).toFixed(1) + 'k';
		return Number.isInteger(val) ? val.toLocaleString('en-US') : val.toFixed(1);
	}

	function getAccentColorClasses(accent: string) {
		switch (accent) {
			case 'tertiary':
				return {
					text: 'text-tertiary-500',
					bg: 'bg-tertiary-500',
					wash: 'bg-tertiary-500/10',
					fill: 'var(--color-tertiary-500, #06b6d4)'
				};
			case 'success':
				return {
					text: 'text-success-500',
					bg: 'bg-success-500',
					wash: 'bg-success-500/10',
					fill: 'var(--color-success-500, #10b981)'
				};
			case 'warning':
				return {
					text: 'text-warning-500',
					bg: 'bg-warning-500',
					wash: 'bg-warning-500/10',
					fill: 'var(--color-warning-500, #f59e0b)'
				};
			case 'secondary':
				return {
					text: 'text-secondary-500',
					bg: 'bg-secondary-500',
					wash: 'bg-secondary-500/10',
					fill: 'var(--color-secondary-500, #8b5cf6)'
				};
			case 'primary':
			default:
				return {
					text: 'text-primary-500',
					bg: 'bg-primary-500',
					wash: 'bg-primary-500/10',
					fill: 'var(--color-primary-500, #3b82f6)'
				};
		}
	}

	function bucketHref(bucketLabel?: string): string {
		const filters: Record<string, string> = {};
		if (groupByMode === 'field' && isFilterableBucket(bucketLabel) && selectedGroupField) {
			filters[selectedGroupField] = bucketLabel;
		}
		return buildCollectionDrilldownHref({
			language: contentLanguage.value,
			collection: selectedCollection || savedSettings.collectionId,
			filters
		});
	}

	const accentTheme = $derived(getAccentColorClasses(colorAccent));
</script>

<BaseWidget
	label={customTitle}
	{theme}
	endpoint={endpointUrl}
	pollInterval={30000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: chartData }: { data: ChartQueryResult | undefined })}
		<div class="relative flex h-full flex-col justify-between overflow-hidden p-1">
			<!-- Header Action Bar -->
			<div class="flex items-center justify-between pb-1">
				<div class="flex items-center gap-2">
					<span class="text-xs font-semibold text-surface-500 uppercase tracking-wider">
						{selectedPeriod.toUpperCase()}
					</span>
					{#if chartData?.total !== undefined}
						<span class="text-xs text-surface-400">
							Total: <strong class="text-surface-600 dark:text-surface-400"
								>{formatDisplayValue(chartData.total)}</strong
							>
						</span>
					{/if}
				</div>
				<Button
					variant="ghost"
					size="sm"
					class="p-1! h-auto min-w-0 text-surface-500 hover:text-surface-600 dark:hover:text-surface-400"
					onclick={openSettings}
					aria-label="Configure Chart"
					title="Configure Chart"
				>
					<iconify-icon icon="mdi:cog-outline" width={15}></iconify-icon>
				</Button>
			</div>

			{#if !selectedCollection && !savedSettings.collectionId}
				<!-- Unconfigured state -->
				<div class="flex flex-1 flex-col items-center justify-center p-4 text-center">
					<iconify-icon icon="mdi:chart-box-outline" width={36} class="mb-2 text-surface-400"
					></iconify-icon>
					<p class="text-sm font-medium text-surface-600 dark:text-surface-400">
						No collection linked
					</p>
					<Button variant="outline" size="sm" class="mt-2 text-xs" onclick={openSettings}>
						Configure Chart
					</Button>
				</div>
			{:else if !chartData || !chartData.series || chartData.series.length === 0}
				<!-- Empty state -->
				<div class="flex flex-1 flex-col items-center justify-center p-4 text-center">
					<iconify-icon icon="mdi:database-remove-outline" width={32} class="mb-2 text-surface-400"
					></iconify-icon>
					<p class="text-xs text-surface-500">No data found for this period</p>
				</div>
			{:else}
				{@const series = chartData.series}
				{@const maxVal = Math.max(...series.map((s) => s.value), 1)}

				<!-- Chart Visualization based on chartType -->
				<div class="relative flex-1 flex flex-col justify-end pt-2 pb-1 overflow-hidden min-h-30">
					{#if chartType === 'column'}
						<!-- Vertical Column Chart (SVG) -->
						<div class="relative h-full w-full flex items-end justify-between gap-1 pt-6 pb-5">
							{#each series as item, idx (item.label)}
								{@const heightPct = Math.max(4, Math.round((item.value / maxVal) * 100))}
								{@const isHovered = hoveredIndex === idx}
								<a
									href={bucketHref(item.label)}
									class="group relative flex-1 flex flex-col items-center justify-end h-full focus:outline-none"
									onmouseenter={() => (hoveredIndex = idx)}
									onmouseleave={() => (hoveredIndex = null)}
									aria-label="{item.label}: {item.value}"
								>
									<!-- Hover tooltip -->
									{#if isHovered}
										<div
											class="absolute bottom-full mb-1 z-30 whitespace-nowrap rounded bg-surface-900 px-2 py-0.5 text-xs text-white shadow-md dark:bg-surface-500/10 dark:text-surface-900 pointer-events-none"
										>
											{item.label}: {formatDisplayValue(item.value)} ({item.pct}%)
										</div>
									{/if}

									<!-- Bar rectangle -->
									<div
										class="w-full max-w-10 rounded-t transition-all duration-200 {accentTheme.bg} {isHovered
											? 'brightness-125 scale-y-105'
											: 'opacity-85 group-hover:opacity-100'}"
										style="height: {heightPct}%;"
									></div>

									<!-- X-axis label -->
									<span
										class="absolute -bottom-5 w-full truncate text-center text-[10px] text-surface-400 group-hover:text-surface-600 dark:group-hover:text-surface-400"
									>
										{item.label}
									</span>
								</a>
							{/each}
						</div>
					{:else if chartType === 'bar'}
						<!-- Horizontal Bar List -->
						<div class="flex flex-col gap-1.5 overflow-y-auto max-h-48 py-1">
							{#each series as item, idx (item.label)}
								{@const isHovered = hoveredIndex === idx}
								<a
									href={bucketHref(item.label)}
									class="group flex flex-col gap-0.5 rounded px-1.5 py-1 transition-colors hover:bg-surface-500/10 focus:outline-none"
									onmouseenter={() => (hoveredIndex = idx)}
									onmouseleave={() => (hoveredIndex = null)}
								>
									<div class="flex justify-between text-xs">
										<span
											class="font-medium text-surface-600 dark:text-surface-400 truncate max-w-40"
										>
											{item.label}
										</span>
										<div class="flex items-center gap-1.5">
											<span class="font-semibold text-surface-900 dark:text-surface-50">
												{formatDisplayValue(item.value)}
											</span>
											<span class="text-[10px] text-surface-400">({item.pct}%)</span>
										</div>
									</div>
									<div class="h-1.5 w-full rounded-full bg-surface-500/20 overflow-hidden">
										<div
											class="h-full rounded-full transition-all duration-300 {accentTheme.bg} {isHovered
												? 'brightness-125'
												: ''}"
											style="width: {Math.max(2, item.pct)}%;"
										></div>
									</div>
								</a>
							{/each}
						</div>
					{:else}
						<!-- Area / Spline Chart (SVG) -->
						{@const width = 300}
						{@const height = 90}
						{@const coords = series.map((item, i) => {
							const x = (i / Math.max(1, series.length - 1)) * width;
							const y = height - (item.value / maxVal) * (height - 16) - 8;
							return { x, y, item, i };
						})}
						{@const pathD = `M ${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L ')}`}
						{@const areaD = `${pathD} L ${width},${height} L 0,${height} Z`}
						<div class="relative h-full w-full pt-4">
							<svg
								viewBox="0 0 {width} {height}"
								class="h-full w-full overflow-visible"
								preserveAspectRatio="none"
							>
								<defs>
									<linearGradient id="area-grad-{widgetId}" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stop-color={accentTheme.fill} stop-opacity="0.35" />
										<stop offset="100%" stop-color={accentTheme.fill} stop-opacity="0.0" />
									</linearGradient>
								</defs>
								<!-- Area fill -->
								<path d={areaD} fill="url(#area-grad-{widgetId})" />
								<!-- Main line -->
								<path
									d={pathD}
									fill="none"
									stroke={accentTheme.fill}
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
								<!-- Data points -->
								{#each coords as c (c.i)}
									<circle
										cx={c.x}
										cy={c.y}
										r={hoveredIndex === c.i ? 5 : 3}
										fill={accentTheme.fill}
										class="transition-all duration-150 cursor-pointer"
										role="presentation"
										onmouseenter={() => (hoveredIndex = c.i)}
										onmouseleave={() => (hoveredIndex = null)}
									/>
								{/each}
							</svg>

							<!-- Hover callout for area chart -->
							{#if hoveredIndex !== null && coords[hoveredIndex]}
								{@const c = coords[hoveredIndex]}
								<div
									class="absolute top-0 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-surface-900 px-2 py-0.5 text-xs text-white shadow-md dark:bg-surface-500/10 dark:text-surface-900 pointer-events-none"
									style="left: {(c.x / width) * 100}%;"
								>
									{c.item.label}: {formatDisplayValue(c.item.value)}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Drilldown Footer -->
				<div
					class="mt-2 pt-1 border-t border-surface-500/10 flex items-center justify-between text-xs"
				>
					<a
						href={bucketHref()}
						class="inline-flex items-center gap-1 font-medium text-surface-500 hover:{accentTheme.text} transition-colors"
					>
						<span>Explore all records</span>
						<iconify-icon icon="mdi:arrow-right" width={12}></iconify-icon>
					</a>
					<span class="text-surface-400 capitalize">{chartType} mode</span>
				</div>
			{/if}
		</div>
	{/snippet}
</BaseWidget>

<!-- Configuration Modal -->
{#if showSettingsModal}
	<Modal
		open={showSettingsModal}
		title="Configure Collection Chart"
		onclose={() => (showSettingsModal = false)}
	>
		<div class="flex flex-col gap-4 p-4">
			<!-- Widget Title -->
			<div>
				<label
					for="chart-title-{widgetId}"
					class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
				>
					Widget Title
				</label>
				<Input
					id="chart-title-{widgetId}"
					bind:value={customTitle}
					placeholder="e.g. Lead Conversion Distribution"
				/>
			</div>

			<!-- Collection Source -->
			<div>
				<label
					for="chart-collection-{widgetId}"
					class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
				>
					Collection
				</label>
				<select
					id="chart-collection-{widgetId}"
					bind:value={selectedCollection}
					class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
				>
					{#if sources.length === 0}
						<option value="">Loading collections...</option>
					{:else}
						{#each sources as src (src.id)}
							<option value={src.id}>{src.label || src.name}</option>
						{/each}
					{/if}
				</select>
			</div>

			<!-- Chart Type & Accent Color -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label
						for="chart-type-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Chart Style
					</label>
					<select
						id="chart-type-{widgetId}"
						bind:value={chartType}
						class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
					>
						<option value="column">Vertical Column / Bar</option>
						<option value="bar">Horizontal Bar List</option>
						<option value="area">Area / Trend Line</option>
					</select>
				</div>

				<div>
					<label
						for="chart-accent-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Accent Color
					</label>
					<select
						id="chart-accent-{widgetId}"
						bind:value={colorAccent}
						class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
					>
						<option value="primary">Primary (Blue)</option>
						<option value="tertiary">Tertiary (Cyan)</option>
						<option value="secondary">Secondary (Purple)</option>
						<option value="success">Success (Emerald)</option>
						<option value="warning">Warning (Amber)</option>
					</select>
				</div>
			</div>

			<!-- Grouping Mode -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label
						for="chart-group-by-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Group By
					</label>
					<select
						id="chart-group-by-{widgetId}"
						bind:value={groupByMode}
						class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
					>
						<option value="time">Time Period (Bins)</option>
						<option value="field">Categorical Field</option>
					</select>
				</div>

				{#if groupByMode === 'time'}
					<div>
						<label
							for="chart-granularity-{widgetId}"
							class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
						>
							Time Granularity
						</label>
						<select
							id="chart-granularity-{widgetId}"
							bind:value={timeGranularity}
							class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
						>
							<option value="day">By Day</option>
							<option value="week">By Week</option>
							<option value="month">By Month</option>
							<option value="year">By Year</option>
						</select>
					</div>
				{:else}
					<div>
						<label
							for="chart-group-field-{widgetId}"
							class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
						>
							Category Field
						</label>
						<select
							id="chart-group-field-{widgetId}"
							bind:value={selectedGroupField}
							class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
						>
							{#if activeSource && activeSource.categoryFields.length > 0}
								{#each activeSource.categoryFields as f (f.name)}
									<option value={f.name}>{f.label || f.name}</option>
								{/each}
							{:else}
								<option value="status">status</option>
							{/if}
						</select>
					</div>
				{/if}
			</div>

			<!-- Measure & Time Period -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label
						for="chart-measure-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Measure
					</label>
					<select
						id="chart-measure-{widgetId}"
						bind:value={selectedMeasure}
						class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
					>
						<option value="count">Count Records</option>
						<option value="sum">Sum of Field</option>
						<option value="avg">Average of Field</option>
					</select>
				</div>

				<div>
					<label
						for="chart-period-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Filter Period
					</label>
					<select
						id="chart-period-{widgetId}"
						bind:value={selectedPeriod}
						class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
					>
						<option value="last30">Last 30 Days</option>
						<option value="month">This Month</option>
						<option value="week">This Week</option>
						<option value="year">This Year</option>
						<option value="last12m">Last 12 Months</option>
						<option value="all">All Time</option>
					</select>
				</div>
			</div>

			<!-- Limit -->
			<div>
				<label
					for="chart-limit-{widgetId}"
					class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
				>
					Max Data Points / Buckets
				</label>
				<Input id="chart-limit-{widgetId}" bind:value={itemLimit} type="number" min="3" max="24" />
			</div>

			<!-- Modal Actions -->
			<div class="mt-4 flex justify-end gap-2 border-t border-surface-500/20 pt-3">
				<Button variant="outline" onclick={() => (showSettingsModal = false)}>Cancel</Button>
				<Button variant="primary" onclick={saveSettings}>Save Configuration</Button>
			</div>
		</div>
	</Modal>
{/if}
