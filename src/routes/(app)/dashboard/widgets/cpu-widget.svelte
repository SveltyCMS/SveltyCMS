<!--
@file src/routes/(app)/dashboard/widgets/CPUWidget.svelte
@component
**Reusable widget for displaying CPU usage data with support for dynamic sizing, light/dark mode, and a11y improvements**

@example
<CPUWidget label="CPU Usage" size={{ w: 1, h: 1 }} />

### Props
- `label`: The label for the widget (default: 'CPU Usage')
- `size`: Widget size in columns and rows (e.g., `{ w: 1, h: 1 }`)

### Features:
- Supports light/dark themes
- Fully responsive to width and height changes
- Accessible by keyboard and screen readers
- Optimized Chart.js integration
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "CPU Usage",
	icon: "mdi:cpu-64-bit",
	defaultSize: { w: 1, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	const {
		label = 'CPU Usage',
		theme = 'light',
		icon = 'mdi:cpu-64-bit',
		widgetId = undefined,
		size = { w: 1, h: 1 } as WidgetSize,
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

	let activeIndex = $state<number | null>(null);
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/system-info?type=cpu"
	pollInterval={5000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{const cpu = {
			current: Number(data?.cpuInfo?.historicalLoad?.usage?.at(-1) ?? 0),
			average: data?.cpuInfo?.historicalLoad?.usage?.length
				? Number(data.cpuInfo.historicalLoad.usage.reduce((a: number, b: number) => a + b, 0) / data.cpuInfo.historicalLoad.usage.length)
				: 0,
			level: Number(data?.cpuInfo?.historicalLoad?.usage?.at(-1) ?? 0) > 80 ? 'high' : Number(data?.cpuInfo?.historicalLoad?.usage?.at(-1) ?? 0) > 50 ? 'medium' : 'low',
			usage: (data?.cpuInfo?.historicalLoad?.usage ?? []) as number[],
			timestamps: (data?.cpuInfo?.historicalLoad?.timestamps ?? []) as string[]
		}}

		{#if data?.cpuInfo}
			<!-- SVG Chart / Sparkline Calculations -->
			{const chartHeight = size.h === 1 ? 40 : 150}
			{const points = cpu.usage.map((val: number, i: number) => ({
				x: (i / Math.max(1, cpu.usage.length - 1)) * 300,
				y: chartHeight - (val / 100) * (chartHeight - (size.h === 1 ? 4 : 20)) - (size.h === 1 ? 2 : 10)
			}))}
			{const linePath = points.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}
			{const areaPath = points.length ? `${linePath} L ${points.at(-1)!.x.toFixed(2)} ${chartHeight} L 0 ${chartHeight} Z` : ''}

			<div class="flex h-full flex-col justify-between {size.h === 1 ? 'space-y-1' : 'space-y-3'}">
				{#if size.h === 1}
					<!-- Compact single-row layout -->
					<div class="flex items-center justify-between text-xs px-1">
						<div class="flex items-center space-x-1.5">
							<div class="h-2 w-2 rounded-full {cpu.level === 'high' ? 'bg-error-500' : cpu.level === 'medium' ? 'bg-yellow-500' : 'bg-emerald-500'}"></div>
							<span class="font-bold tabular-nums">{cpu.current.toFixed(1)}%</span>
						</div>
						<span class="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">avg: {cpu.average.toFixed(1)}%</span>
					</div>
				{:else}
					<!-- Header Stats -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class="relative">
								<div class="h-3 w-3 rounded-full {cpu.level === 'high' ? 'bg-error-500' : cpu.level === 'medium' ? 'bg-yellow-500' : 'bg-emerald-500'}"></div>
								<div class="absolute inset-0 h-3 w-3 rounded-full {cpu.level === 'high' ? 'bg-error-500' : cpu.level === 'medium' ? 'bg-yellow-500' : 'bg-emerald-500'} animate-ping opacity-75"></div>
							</div>
							<span class="text-xl font-semibold tabular-nums">{cpu.current.toFixed(1)}%</span>
							<span class="text-sm {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">now</span>
						</div>

						<div class="text-end">
							<div class="text-sm font-medium tabular-nums">{cpu.average.toFixed(1)}% <span class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">avg</span></div>
						</div>
					</div>

					<!-- Progress Bar -->
					<div class="relative h-2 overflow-hidden rounded-full {theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}">
						<div
							class="h-full rounded-full transition-all duration-700 ease-out"
							class:bg-red-500={cpu.level === 'high'}
							class:bg-yellow-500={cpu.level === 'medium'}
							class:bg-blue-500={cpu.level === 'low'}
							style="width: {Math.max(4, cpu.current)}%"
						></div>
					</div>
				{/if}

				<div class="relative grow" style="min-height: {size.h === 1 ? '40px' : size.h >= 2 ? '160px' : '130px'}">
					<svg
						viewBox="0 0 300 {chartHeight}"
						class="w-full h-full overflow-visible"
						preserveAspectRatio="none"
						aria-label="CPU usage over time"
					>
						{#if size.h !== 1}
							<!-- Grid -->
							<g class="stroke-gray-200/60 dark:stroke-gray-800/60">
								<line x1="0" y1="37.5" x2="300" y2="37.5" stroke-dasharray="3 2"/>
								<line x1="0" y1="75" x2="300" y2="75" stroke-dasharray="3 2"/>
								<line x1="0" y1="112.5" x2="300" y2="112.5" stroke-dasharray="3 2"/>
							</g>
						{/if}

						<!-- Area -->
						{#if areaPath}
							<path d={areaPath} fill={theme === 'dark' ? '#6366f120' : '#3b82f620'} />
						{/if}

						<!-- Line -->
						{#if linePath}
							<path
								d={linePath}
								fill="none"
								stroke={theme === 'dark' ? '#6366f1' : '#3b82f6'}
								stroke-width={size.h === 1 ? '1.8' : '2.5'}
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						{/if}

						<!-- Data Points (Only in rich layout) -->
						{#if size.h !== 1}
							{#each points as p, i (i)}
								<circle
									cx={p.x}
									cy={p.y}
									r="12"
									fill="transparent"
									role="img"
									aria-label="Data point"
									onmouseenter={() => (activeIndex = i)}
									onmouseleave={() => (activeIndex = null)}
									class="cursor-crosshair animate-duration-100"
								/>
								{#if activeIndex === i}
									<circle cx={p.x} cy={p.y} r="3.5" fill={theme === 'dark' ? '#a5b4fc' : '#60a5fa'} />
									<circle cx={p.x} cy={p.y} r="7" stroke={theme === 'dark' ? '#6366f1' : '#3b82f6'} stroke-width="1.5" fill="none" class="animate-ping" />
								{/if}
							{/each}
						{/if}
					</svg>

					<!-- Tooltip (Only in rich layout) -->
					{#if size.h !== 1 && activeIndex !== null && points[activeIndex]}
						{const val = cpu.usage[activeIndex]}
						{const time = new Date(cpu.timestamps[activeIndex]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
						<div
							class="absolute pointer-events-none z-20 px-3 py-2 text-xs rounded border shadow-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-gray-200 dark:border-gray-700"
							style="left: {Math.max(20, Math.min(points[activeIndex].x - 45, 220))}px; top: {points[activeIndex].y - 58}px;"
						>
							<div class="font-mono font-semibold text-lg leading-none tabular-nums text-gray-900 dark:text-white">
								{val.toFixed(1)}%
							</div>
							<div class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{time}</div>
						</div>
					{/if}
				</div>

				<!-- Footer Info -->
				{#if size.h !== 1 && (size.w >= 2 || size.h >= 2)}
					<div class="flex justify-between text-xs pt-1 {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} border-t border-gray-100/50 dark:border-gray-800/50">
						<span>Cores: <span class="font-medium text-gray-700 dark:text-gray-300">{data?.cpuInfo?.cores?.count ?? '—'}</span></span>
						<span class="text-end truncate max-w-85">
							{data?.cpuInfo?.cores?.perCore?.[0]?.model?.split(' ').slice(0, 3).join(' ') ?? 'Unknown'}
						</span>
					</div>
				{/if}
			</div>
		{:else}
			<!-- Loading State -->
			<div class="flex h-full items-center justify-center">
				<div class="flex flex-col items-center gap-3">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
					<p class="text-sm {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Fetching CPU metrics...</p>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
	path {
		transition: d 0.5s ease-in-out, stroke 0.3s, fill 0.3s;
	}
	circle {
		transition: cy 0.5s ease-in-out, cx 0.5s ease-in-out;
	}
</style>
