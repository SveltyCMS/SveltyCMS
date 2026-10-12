<!--
@file src/routes/(app)/dashboard/widgets/collection-figure/index.svelte
@component
**Interactive Collection Metric Widget**

Displays key performance indicators (KPIs), sums, averages, period comparisons,
goal progress, and micro SVG sparklines for any collection in the CMS.

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
- Direct-to-collection aggregation: Count, Sum, Avg, Min, Max
- Flexible time periods: Today, Week, Month, Year, Last 30 Days, Last 12 Months, All Time
- Previous period delta comparison (+/- % change with color-coded trend)
- Goal tracking with percentage progress bar and remaining amount
- Zero-dependency responsive SVG sparkline
- Live in-place configuration modal/drawer persisted via systemPreferences
- Direct click-through drilldown to the collection management table
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Collection Metric',
		icon: 'mdi:numeric',
		description:
			'Dynamic collection KPI figures, period comparisons, goal progress tracking, and SVG sparklines',
		defaultSize: { w: 1, h: 1 }
	};
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { DashboardWidgetConfig, WidgetSize } from '@src/content/types';
	import BaseWidget from '../../base-widget.svelte';
	import Button from '@components/ui/button.svelte';
	import Modal from '@components/ui/modal.svelte';
	import Input from '@components/ui/input.svelte';
	import { systemPreferences } from '../../dashboard-preferences.svelte';
	import type {
		CollectionSourceInfo,
		MetricQueryResult
	} from '@src/services/analytics/collection-analytics-service';

	const {
		config = undefined,
		label = 'Collection Metric',
		theme = 'light',
		icon = 'mdi:numeric',
		widgetId = undefined,
		size = { w: 1, h: 1 } as WidgetSize,
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

	// Settings state
	let showSettingsModal = $state(false);
	let sources = $state<CollectionSourceInfo[]>([]);
	let sourcesLoading = $state(false);

	// Widget persistent configuration
	const savedSettings = $derived((config?.settings as Record<string, any>) || {});
	// Seed the editable state once from the initial config — the $effect below
	// re-syncs it whenever the config changes externally.
	const initialSettings = untrack(() => (config?.settings as Record<string, any>) || {});
	let selectedCollection = $state(initialSettings.collectionId || '');
	let selectedMeasure = $state(initialSettings.measure || 'count');
	let selectedField = $state(initialSettings.field || '');
	let selectedPeriod = $state(initialSettings.period || 'all');
	let selectedDateField = $state(initialSettings.dateField || 'createdAt');
	let compareMode = $state(initialSettings.compare || 'previous');
	let goalValue = $state(initialSettings.goal ? String(initialSettings.goal) : '');
	let customPrefix = $state(initialSettings.prefix || '');
	let customSuffix = $state(initialSettings.suffix || '');
	let customTitle = $state(untrack(() => config?.label || label || 'Collection Metric'));
	let colorAccent = $state(initialSettings.color || 'tertiary');

	// Synchronize when config changes externally
	$effect(() => {
		if (config?.settings) {
			const s = config.settings as Record<string, any>;
			if (s.collectionId !== undefined) selectedCollection = s.collectionId;
			if (s.measure !== undefined) selectedMeasure = s.measure;
			if (s.field !== undefined) selectedField = s.field;
			if (s.period !== undefined) selectedPeriod = s.period;
			if (s.dateField !== undefined) selectedDateField = s.dateField;
			if (s.compare !== undefined) compareMode = s.compare;
			if (s.goal !== undefined) goalValue = String(s.goal);
			if (s.prefix !== undefined) customPrefix = s.prefix;
			if (s.suffix !== undefined) customSuffix = s.suffix;
			if (s.color !== undefined) colorAccent = s.color;
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
		const id = widgetId || config?.id || 'collection-figure';

		const updatedConfig: DashboardWidgetConfig = {
			id,
			component: 'collection-figure',
			icon,
			label: customTitle.trim() || 'Collection Metric',
			size,
			order: config?.order,
			gridPosition: config?.gridPosition,
			settings: {
				...savedSettings,
				collectionId: selectedCollection,
				measure: selectedMeasure,
				field: selectedField,
				period: selectedPeriod,
				dateField: selectedDateField,
				compare: compareMode,
				goal: goalValue ? Number(goalValue) : undefined,
				prefix: customPrefix,
				suffix: customSuffix,
				color: colorAccent
			}
		};

		await systemPreferences.updateWidget(updatedConfig);
	}

	// Active collection meta
	const activeSource = $derived(
		sources.find((s) => s.id === selectedCollection || s.name === selectedCollection)
	);

	// Construct dynamic analytics API endpoint
	const endpointUrl = $derived.by(() => {
		const targetCol = selectedCollection || savedSettings.collectionId;
		if (!targetCol) return undefined;
		const params = new URLSearchParams({
			action: 'metric',
			collectionId: targetCol,
			measure: selectedMeasure || savedSettings.measure || 'count',
			period: selectedPeriod || savedSettings.period || 'all',
			compare: compareMode || savedSettings.compare || 'previous'
		});
		const f = selectedField || savedSettings.field;
		if (f) params.set('field', f);
		const df = selectedDateField || savedSettings.dateField;
		if (df) params.set('dateField', df);
		const g = goalValue || savedSettings.goal;
		if (g) params.set('goal', String(g));

		return `/api/dashboard/analytics?${params.toString()}`;
	});

	// Formatting helpers
	function formatDisplayValue(val: number): string {
		if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
		if (val >= 10_000) return (val / 1_000).toFixed(1) + 'k';
		return Number.isInteger(val) ? val.toLocaleString('en-US') : val.toFixed(2);
	}

	function getAccentColorClasses(accent: string) {
		switch (accent) {
			case 'primary':
				return {
					text: 'text-primary-500',
					bg: 'bg-primary-500',
					wash: 'bg-primary-500/10'
				};
			case 'success':
				return {
					text: 'text-success-500',
					bg: 'bg-success-500',
					wash: 'bg-success-500/10'
				};
			case 'warning':
				return {
					text: 'text-warning-500',
					bg: 'bg-warning-500',
					wash: 'bg-warning-500/10'
				};
			case 'secondary':
				return {
					text: 'text-secondary-500',
					bg: 'bg-secondary-500',
					wash: 'bg-secondary-500/10'
				};
			case 'tertiary':
			default:
				return {
					text: 'text-tertiary-500',
					bg: 'bg-tertiary-500',
					wash: 'bg-tertiary-500/10'
				};
		}
	}

	const accentTheme = $derived(getAccentColorClasses(colorAccent));
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
	{#snippet children({ data: metricData }: { data: MetricQueryResult | undefined })}
		<div class="relative flex h-full flex-col justify-between overflow-hidden p-1">
			<!-- Header action bar: Configure -->
			<div class="flex items-center justify-between pb-1">
				<span class="text-xs font-medium text-surface-500 uppercase tracking-wider">
					{metricData?.periodLabel || selectedPeriod || 'All Time'}
				</span>
				<Button
					variant="ghost"
					size="sm"
					class="p-1! h-auto min-w-0 text-surface-500 hover:text-surface-600 dark:hover:text-surface-400"
					onclick={openSettings}
					aria-label="Configure Metric"
					title="Configure Metric"
				>
					<iconify-icon icon="mdi:cog-outline" width={15}></iconify-icon>
				</Button>
			</div>

			{#if !selectedCollection && !savedSettings.collectionId}
				<!-- Unconfigured state -->
				<div class="flex flex-1 flex-col items-center justify-center p-3 text-center">
					<iconify-icon
						icon="mdi:chart-timeline-variant-shimmer"
						width={32}
						class="mb-2 text-surface-400"
					></iconify-icon>
					<p class="text-sm font-medium text-surface-600 dark:text-surface-400">
						No collection linked
					</p>
					<Button variant="outline" size="sm" class="mt-2 text-xs" onclick={openSettings}>
						Configure Metric
					</Button>
				</div>
			{:else if metricData}
				<!-- Main Metric Figure -->
				<div class="flex flex-col gap-1">
					<div class="flex items-baseline gap-1">
						{#if customPrefix}
							<span class="text-lg font-semibold text-surface-500">{customPrefix}</span>
						{/if}
						<span
							class="font-display text-3xl font-bold tracking-tight text-surface-900 dark:text-surface-50"
						>
							{formatDisplayValue(metricData.value ?? 0)}
						</span>
						{#if customSuffix}
							<span class="text-sm font-medium text-surface-500">{customSuffix}</span>
						{/if}
					</div>

					<!-- Period comparison delta badge -->
					{#if metricData.pctChange !== undefined && compareMode !== 'none'}
						<div class="flex items-center gap-1.5 text-xs font-medium">
							{#if metricData.trend === 'up'}
								<span
									class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-success-500 bg-success-500/10"
								>
									<iconify-icon icon="mdi:arrow-up" width={12}></iconify-icon>
									+{metricData.pctChange}%
								</span>
							{:else if metricData.trend === 'down'}
								<span
									class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-error-500 bg-error-500/10"
								>
									<iconify-icon icon="mdi:arrow-down" width={12}></iconify-icon>
									{metricData.pctChange}%
								</span>
							{:else}
								<span
									class="inline-flex items-center rounded px-1.5 py-0.5 text-surface-500 bg-surface-500/10"
								>
									0%
								</span>
							{/if}
							<span class="text-surface-400 dark:text-surface-500">vs prev period</span>
						</div>
					{/if}
				</div>

				<!-- Goal Progress (if goal is set) -->
				{#if metricData.goal && metricData.pctGoal !== undefined}
					<div class="mt-2 flex flex-col gap-1">
						<div class="flex justify-between text-xs text-surface-500">
							<span>Goal: {formatDisplayValue(metricData.goal)}</span>
							<span class="font-medium {accentTheme.text}">{metricData.pctGoal}%</span>
						</div>
						<div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-500/20">
							<div
								class="h-full rounded-full transition-all duration-300 {accentTheme.bg}"
								style="width: {Math.min(100, metricData.pctGoal)}%"
							></div>
						</div>
					</div>
				{/if}

				<!-- Micro SVG Sparkline (shows if height >= 2 or size permits) -->
				{#if metricData.sparkline && metricData.sparkline.length > 1 && size.h >= 2}
					{@const pts = metricData.sparkline}
					{@const min = Math.min(...pts)}
					{@const max = Math.max(...pts)}
					{@const range = max - min || 1}
					{@const width = 180}
					{@const height = 36}
					{@const coords = pts.map((pt, i) => {
						const x = (i / (pts.length - 1)) * width;
						const y = height - ((pt - min) / range) * (height - 8) - 4;
						return `${x.toFixed(1)},${y.toFixed(1)}`;
					})}
					{@const pathD = `M ${coords.join(' L ')}`}
					{@const areaD = `${pathD} L ${width},${height} L 0,${height} Z`}
					<div class="mt-2 w-full pt-1">
						<svg
							viewBox="0 0 {width} {height}"
							class="h-9 w-full overflow-visible"
							preserveAspectRatio="none"
						>
							<defs>
								<linearGradient id="spark-grad-{widgetId}" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stop-color="currentColor" stop-opacity="0.25" />
									<stop offset="100%" stop-color="currentColor" stop-opacity="0.0" />
								</linearGradient>
							</defs>
							<path d={areaD} fill="url(#spark-grad-{widgetId})" class={accentTheme.text} />
							<path
								d={pathD}
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class={accentTheme.text}
							/>
						</svg>
					</div>
				{/if}

				<!-- Drill-Down Link -->
				<div
					class="mt-2 pt-1 border-t border-surface-500/10 flex items-center justify-between text-xs"
				>
					<a
						href="/collections/{selectedCollection || savedSettings.collectionId}"
						class="inline-flex items-center gap-1 font-medium text-surface-500 hover:{accentTheme.text} transition-colors"
					>
						<span>View collection</span>
						<iconify-icon icon="mdi:arrow-right" width={12}></iconify-icon>
					</a>
					<span class="text-surface-400">Live</span>
				</div>
			{/if}
		</div>
	{/snippet}
</BaseWidget>

<!-- Configuration Modal -->
{#if showSettingsModal}
	<Modal
		open={showSettingsModal}
		title="Configure Collection Metric"
		onclose={() => (showSettingsModal = false)}
	>
		<div class="flex flex-col gap-4 p-4">
			<!-- Widget Title -->
			<div>
				<label
					for="metric-title-{widgetId}"
					class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
				>
					Widget Title
				</label>
				<Input
					id="metric-title-{widgetId}"
					bind:value={customTitle}
					placeholder="e.g. Monthly Revenue"
				/>
			</div>

			<!-- Collection Source -->
			<div>
				<label
					for="metric-collection-{widgetId}"
					class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
				>
					Collection
				</label>
				<select
					id="metric-collection-{widgetId}"
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

			<!-- Aggregation Measure -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label
						for="metric-measure-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Measure
					</label>
					<select
						id="metric-measure-{widgetId}"
						bind:value={selectedMeasure}
						class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
					>
						<option value="count">Count Records</option>
						<option value="sum">Sum</option>
						<option value="avg">Average</option>
						<option value="min">Minimum</option>
						<option value="max">Maximum</option>
					</select>
				</div>

				{#if selectedMeasure !== 'count'}
					<div>
						<label
							for="metric-field-{widgetId}"
							class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
						>
							Number Field
						</label>
						<select
							id="metric-field-{widgetId}"
							bind:value={selectedField}
							class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
						>
							{#if activeSource && activeSource.numberFields.length > 0}
								{#each activeSource.numberFields as f (f.name)}
									<option value={f.name}>{f.label || f.name}</option>
								{/each}
							{:else}
								<option value="">No number fields found</option>
							{/if}
						</select>
					</div>
				{/if}
			</div>

			<!-- Period & Comparison -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label
						for="metric-period-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Time Period
					</label>
					<select
						id="metric-period-{widgetId}"
						bind:value={selectedPeriod}
						class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
					>
						<option value="all">All Time</option>
						<option value="today">Today</option>
						<option value="week">This Week</option>
						<option value="month">This Month</option>
						<option value="year">This Year</option>
						<option value="last30">Last 30 Days</option>
						<option value="last12m">Last 12 Months</option>
					</select>
				</div>

				<div>
					<label
						for="metric-compare-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Comparison
					</label>
					<select
						id="metric-compare-{widgetId}"
						bind:value={compareMode}
						class="w-full rounded border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm text-surface-900 focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
					>
						<option value="previous">Previous Period (%)</option>
						<option value="none">None</option>
					</select>
				</div>
			</div>

			<!-- Goal & Formatting -->
			<div class="grid grid-cols-3 gap-3">
				<div>
					<label
						for="metric-goal-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Goal Target
					</label>
					<Input
						id="metric-goal-{widgetId}"
						bind:value={goalValue}
						type="number"
						placeholder="Optional"
					/>
				</div>
				<div>
					<label
						for="metric-prefix-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Prefix
					</label>
					<Input id="metric-prefix-{widgetId}" bind:value={customPrefix} placeholder="$, €" />
				</div>
				<div>
					<label
						for="metric-suffix-{widgetId}"
						class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400"
					>
						Suffix
					</label>
					<Input id="metric-suffix-{widgetId}" bind:value={customSuffix} placeholder="units, %" />
				</div>
			</div>

			<!-- Color Accent -->
			<div>
				<span class="mb-1 block text-xs font-semibold text-surface-600 dark:text-surface-400">
					Accent Color
				</span>
				<div class="flex gap-2">
					{#each ['tertiary', 'primary', 'success', 'warning', 'secondary'] as col (col)}
						<button
							type="button"
							class="h-7 w-7 rounded-full border-2 transition-transform {colorAccent === col
								? 'scale-110 border-surface-500/40 dark:border-white'
								: 'border-transparent'}"
							style="background-color: var(--color-{col}-500, #3b82f6);"
							onclick={() => (colorAccent = col)}
							aria-label="Select {col} accent"
						></button>
					{/each}
				</div>
			</div>

			<!-- Modal Actions -->
			<div class="mt-4 flex justify-end gap-2 border-t border-surface-500/20 pt-3">
				<Button variant="outline" onclick={() => (showSettingsModal = false)}>Cancel</Button>
				<Button variant="primary" onclick={saveSettings}>Save Configuration</Button>
			</div>
		</div>
	</Modal>
{/if}
