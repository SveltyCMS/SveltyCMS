<!--
@file src/routes/(app)/dashboard/widgets/disk/index.svelte
@component
**High-performance Disk Usage Widget using native CSS + SVG with multi-disk support**

### Props
- `label` (string): The label for the widget (default: 'Disk Usage')
- `theme` (string): Theme mode ('light' | 'dark')
- `icon` (string): Icon identifier (default: 'mdi:harddisk')
- `size` (WidgetSize): Widget dimensions (default: { w: 1, h: 2 })

### Features:
- Zero-dependency SVG progress ring visualization
- Dynamic multi-disk tabs selector
- Complete dark-mode integration
- Built-in keyboard accessibility
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'Disk Usage',
		icon: 'mdi:disk',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Tooltip from '@components/ui/tooltip.svelte';
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../../base-widget.svelte';
	import {
		dashboard_disk_aria,
		dashboard_disk_free,
		dashboard_disk_fs,
		dashboard_disk_loading,
		dashboard_disk_mount,
		dashboard_disk_please_wait,
		dashboard_disk_select_drive,
		dashboard_disk_total,
		dashboard_disk_used
	} from '@src/paraglide/messages';

	interface DiskInfo {
		filesystem?: string;
		freeGb: string | number;
		mountPoint?: string;
		totalGb: string | number;
		usedGb: string | number;
		usedPercentage: string | number;
	}

	interface FetchedData {
		diskInfo?: Record<string, DiskInfo>;
	}

	const {
		label = 'Disk Usage',
		theme = 'light',
		icon = 'mdi:harddisk',
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

	// Active disk key state
	let activeDiskKey = $state('root');
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/system-info?type=disk"
	pollInterval={10000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: fetchedData }: { data: FetchedData | undefined })}
		{@const disks = (() => {
			if (!fetchedData?.diskInfo) return [];
			return Object.entries(fetchedData.diskInfo).map(([key, value]) => {
				const disk = value as any;
				const total =
					typeof disk.totalGb === 'string' ? parseFloat(disk.totalGb) : disk.totalGb || 0;
				const used = typeof disk.usedGb === 'string' ? parseFloat(disk.usedGb) : disk.usedGb || 0;
				const calculatedPercent = total > 0 ? (used / total) * 100 : 0;
				const rawPercent =
					typeof disk.usedPercentage === 'string'
						? parseFloat(disk.usedPercentage)
						: typeof disk.usedPercentage === 'number'
							? disk.usedPercentage
							: calculatedPercent;
				const percent = Math.min(100, Math.max(0, rawPercent));
				return {
					key,
					name: key === 'root' ? 'Root' : `${key.toUpperCase()}:`,
					total: Math.max(0, total),
					used: Math.max(0, used),
					free: Math.max(0, total - used),
					percent,
					freePercent: Math.max(0, 100 - percent),
					level: percent > 85 ? 'high' : percent > 70 ? 'medium' : 'low',
					mountPoint: disk.mountPoint || '/',
					filesystem: disk.filesystem || ''
				};
			});
		})()}

		{@const disk = disks.find((d) => d.key === activeDiskKey) || disks[0]}

		{#if disk}
			<div
				class="flex h-full flex-col justify-between space-y-3"
				role="region"
				aria-label={dashboard_disk_aria()}
			>
				<!-- Multi-disk Selector tabs (Only shown if more than 1 disk is detected) -->
				{#if disks.length > 1}
					<div
						class="flex flex-wrap gap-1.5 border-b border-(--admin-border-default) pb-2"
						role="tablist"
						aria-label={dashboard_disk_select_drive()}
					>
						{#each disks as d (d.key)}
							<Tooltip
								title={`${d.name} · ${d.used.toFixed(1)} GB used of ${d.total.toFixed(1)} GB`}
								positioning={{ placement: 'top' }}
							>
								<Button
									variant="outline"
									type="button"
									role="tab"
									aria-selected={disk.key === d.key}
									class="px-2.5 py-1 text-xs font-semibold rounded transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-tertiary-500 {disk.key ===
									d.key
										? 'bg-tertiary-500 text-white shadow-sm dark:bg-primary-500'
										: 'bg-surface-500/10 text-(--admin-text-muted) hover:bg-surface-500/20'}"
									onclick={() => (activeDiskKey = d.key)}
								>
									{d.name} ({d.percent.toFixed(0)}%)
								</Button>
							</Tooltip>
						{/each}
					</div>
				{/if}

				<!-- Main Status -->
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<div class="relative">
							<div
								class="h-4 w-4 rounded-full {disk.level === 'high'
									? 'bg-error-500'
									: disk.level === 'medium'
										? 'bg-warning-500'
										: 'bg-success-500'}"
							></div>
							<div
								class="absolute inset-0 h-4 w-4 rounded-full {disk.level === 'high'
									? 'bg-error-500'
									: disk.level === 'medium'
										? 'bg-warning-500'
										: 'bg-success-500'} animate-ping opacity-75"
							></div>
						</div>
						<div>
							<span class="text-3xl font-semibold tabular-nums tracking-tighter"
								>{disk.percent.toFixed(1)}</span
							>
							<span class="text-xl font-medium text-(--admin-text-muted)">%</span>
						</div>
						<span class="text-sm text-(--admin-text-muted)">{dashboard_disk_used()}</span>
					</div>

					<div class="text-end text-sm">
						<div class="font-medium tabular-nums">
							{disk.free.toFixed(1)} GB
							<span class="text-xs text-(--admin-text-muted)">{dashboard_disk_free()}</span>
						</div>
					</div>
				</div>

				<!-- Segmented Visual Bar -->
				<Tooltip
					title={`${disk.used.toFixed(1)} GB used (${disk.percent.toFixed(1)}%) · ${disk.free.toFixed(1)} GB free`}
					positioning={{ placement: 'top' }}
					class="w-full"
				>
					<div
						class="relative h-9 w-full overflow-hidden rounded-2xl bg-surface-500/10 dark:bg-surface-800/60 border border-(--admin-border-default) shadow-inner flex items-center"
					>
						<div
							class="h-full flex items-center justify-center font-semibold text-xs text-white transition-all duration-700 ease-out {disk.level ===
							'high'
								? 'bg-error-500'
								: disk.level === 'medium'
									? 'bg-warning-500'
									: 'bg-tertiary-500 dark:bg-primary-500'}"
							style="width: {disk.percent}%"
						>
							{#if disk.percent > 15}
								<span class="truncate px-1">{disk.used.toFixed(1)} GB</span>
							{/if}
						</div>
						<div
							class="h-full flex-1 flex items-center justify-center font-medium text-xs text-(--admin-text-muted) transition-all duration-700 ease-out"
							style="width: {disk.freePercent}%"
						>
							{#if disk.freePercent > 15}
								<span class="truncate px-1">{disk.free.toFixed(1)} GB</span>
							{/if}
						</div>
					</div>
				</Tooltip>

				<!-- Storage Details -->
				<div class="space-y-3">
					<div
						class="grid {size.w === 1 ? 'grid-cols-2' : 'grid-cols-3'} gap-4 text-center text-sm"
					>
						<div>
							<div class="text-(--admin-text-muted)">
								{dashboard_disk_total()}
							</div>
							<div class="font-semibold tabular-nums mt-0.5">{disk.total.toFixed(1)} GB</div>
						</div>
						<div>
							<div class="text-(--admin-text-muted)">
								{dashboard_disk_used()}
							</div>
							<div
								class="font-semibold tabular-nums mt-0.5 {disk.level === 'high'
									? 'text-error-500'
									: disk.level === 'medium'
										? 'text-warning-500'
										: 'text-tertiary-500 dark:text-primary-500'}"
							>
								{disk.used.toFixed(1)} GB
							</div>
						</div>
						{#if size.w > 1}
							<div>
								<div class="text-(--admin-text-muted)">
									{dashboard_disk_free()}
								</div>
								<div class="font-semibold tabular-nums mt-0.5">{disk.free.toFixed(1)} GB</div>
							</div>
						{/if}
					</div>

					<!-- Progress Ring (optional premium touch) -->
					{#if size.h >= 2}
						<div class="flex justify-center pt-2">
							<Tooltip
								title={`${disk.used.toFixed(1)} GB / ${disk.total.toFixed(1)} GB (${disk.percent.toFixed(1)}% used)`}
								positioning={{ placement: 'top' }}
							>
								<svg width="92" height="92" class="overflow-visible">
									<g style="transform-origin: 46px 46px; transform: rotate(-90deg);">
										<circle
											cx="46"
											cy="46"
											r="38"
											fill="none"
											class="stroke-surface-500/20 dark:stroke-surface-500/30"
											stroke-width="11"
										/>
										<circle
											cx="46"
											cy="46"
											r="38"
											fill="none"
											stroke-width="11"
											stroke-dasharray="238.76"
											stroke-dashoffset={238.76 * (1 - disk.percent / 100)}
											stroke-linecap="round"
											class="transition-all duration-700 {disk.level === 'high'
												? 'stroke-error-500'
												: disk.level === 'medium'
													? 'stroke-warning-500'
													: 'stroke-tertiary-500 dark:stroke-primary-500'}"
										/>
									</g>
									<text
										x="46"
										y="48"
										dominant-baseline="central"
										text-anchor="middle"
										class="text-[19px] font-semibold fill-current text-(--admin-text-body) dark:text-white"
									>
										{disk.percent.toFixed(0)}%
									</text>
								</svg>
							</Tooltip>
						</div>
					{/if}
				</div>

				{#if size.w >= 2}
					<div
						class="flex justify-between text-xs pt-2 border-t border-(--admin-border-default) text-(--admin-text-muted)"
					>
						<span
							>{dashboard_disk_mount()}
							<span class="font-mono text-(--admin-text-body) ms-1">{disk.mountPoint}</span></span
						>
						{#if disk.filesystem}
							<span
								>{dashboard_disk_fs()}
								<span class="font-mono text-(--admin-text-body) ms-1">{disk.filesystem}</span></span
							>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<div
				class="flex h-full flex-col items-center justify-center space-y-3"
				role="status"
				aria-live="polite"
			>
				<div
					class="h-8 w-8 animate-spin rounded-full border-2 border-tertiary-500 border-t-transparent"
				></div>
				<div class="text-center">
					<div class="text-sm font-medium text-(--admin-text-body)">
						{dashboard_disk_loading()}
					</div>
					<div class="text-xs text-(--admin-text-muted)">
						{dashboard_disk_please_wait()}
					</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
	circle {
		transition:
			stroke-dashoffset 0.5s ease-in-out,
			stroke 0.3s;
	}
</style>
