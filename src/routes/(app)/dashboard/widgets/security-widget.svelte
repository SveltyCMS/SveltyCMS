<!--
@file src/routes/(app)/dashboard/widgets/security-widget.svelte
@component
**Advanced Security Monitor Widget - Real-time threat visibility using native SVG sparkline**
-->

<script lang="ts" module>
export const widgetMeta = {
	name: "Security Monitor",
	icon: "mdi:shield-alert",
	description: "Advanced security threat monitoring and incident response",
	defaultSize: { w: 2, h: 3 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	const {
		label = 'Security Monitor',
		theme = 'light',
		icon = 'mdi:shield-alert',
		widgetId = undefined,
		size = { w: 2, h: 3 } as WidgetSize,
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

	interface SecurityStats {
		activeIncidents: number;
		blockedIPs: number;
		throttledIPs: number;
		cspViolations: number;
		rateLimitHits: number;
		totalIncidents: number;
		threatLevelDistribution: {
			critical: number;
			high: number;
			medium: number;
			low: number;
		};
	}

	// Local state loaded from endpoint
	let fetchedData: any = $state(null);
	let threatHistory = $state<number[]>([]);
	const HISTORY_MAX_POINTS = 15;

	// Derived values for reactivity
	const stats = $derived(fetchedData?.stats as SecurityStats | null);

	const overallThreatLevel = $derived.by(() => {
		if (!stats) return 'safe';
		if (stats.threatLevelDistribution.critical > 0 || stats.activeIncidents > 8) return 'critical';
		if (stats.threatLevelDistribution.high > 0 || stats.activeIncidents > 4) return 'high';
		if (stats.threatLevelDistribution.medium > 0 || stats.activeIncidents > 1) return 'medium';
		return stats.activeIncidents > 0 ? 'low' : 'safe';
	});

	const threatColor = $derived.by(() => {
		switch (overallThreatLevel) {
			case 'critical': return 'text-error-600 dark:text-error-400';
			case 'high': return 'text-warning-600 dark:text-warning-400';
			case 'medium': return 'text-warning-600 dark:text-warning-400';
			case 'low': return 'text-warning-600 dark:text-warning-400';
			default: return 'text-success-600 dark:text-success-400';
		}
	});

	const sparklineStyle = $derived.by(() => {
		switch (overallThreatLevel) {
			case 'critical':
			case 'high':
				return { stroke: 'rgb(239, 68, 68)', stopColor: 'rgb(239, 68, 68)' };
			case 'medium':
				return { stroke: 'rgb(245, 158, 11)', stopColor: 'rgb(245, 158, 11)' };
			case 'low':
				return { stroke: 'rgb(234, 179, 8)', stopColor: 'rgb(234, 179, 8)' };
			default:
				return { stroke: 'rgb(16, 185, 129)', stopColor: 'rgb(16, 185, 129)' };
		}
	});

	function handleDataLoaded(newData: any) {
		fetchedData = newData;
		if (newData?.stats) {
			threatHistory.push(newData.stats.activeIncidents);
			if (threatHistory.length > HISTORY_MAX_POINTS) {
				threatHistory.shift();
			}
		}
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/security"
	pollInterval={8000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
	onDataLoaded={handleDataLoaded}
>
	{#snippet children({ data })}
		{@const statsData = data?.stats as SecurityStats | null}
		{@const activeIncidents = data?.incidents || []}

		{#if !statsData}
			<div class="flex h-full items-center justify-center">
				<div class="flex flex-col items-center gap-3 text-surface-500">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-tertiary-500 border-t-transparent"></div>
					<p class="text-sm">Loading security metrics...</p>
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col justify-between" role="region" aria-label="Security Metrics Summary">
				{#if size.h === 1}
					<!-- Compact mode -->
					<div class="flex items-center justify-between text-xs px-1 w-full h-full min-h-9">
						<div class="flex items-center gap-2">
							<div class="relative flex h-2.5 w-2.5">
								<span class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping {overallThreatLevel === 'critical' || overallThreatLevel === 'high' ? 'bg-error-400' : overallThreatLevel === 'medium' ? 'bg-warning-400' : 'bg-success-400'}"></span>
								<span class="relative inline-flex rounded-full h-2.5 w-2.5 {overallThreatLevel === 'critical' || overallThreatLevel === 'high' ? 'bg-error-500' : overallThreatLevel === 'medium' ? 'bg-warning-500' : 'bg-success-500'}"></span>
							</div>
							<div>
								<span class="font-semibold capitalize {threatColor}">{overallThreatLevel}</span>
								<span class="text-surface-500 dark:text-surface-400 ml-1">({statsData.activeIncidents} active)</span>
							</div>
						</div>

						<!-- Mini Sparkline inside compact mode -->
						{#if threatHistory.length > 1}
							{@const maxVal = Math.max(...threatHistory, 3)}
							{@const points = threatHistory.map((val, i) => ({
								x: (i / Math.max(1, threatHistory.length - 1)) * 60,
								y: 18 - (val / maxVal) * 14 - 2
							}))}
							{@const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}
							<div class="w-16 h-5 opacity-80" aria-hidden="true">
								<svg viewBox="0 0 60 18" class="w-full h-full overflow-visible">
									<path d={linePath} fill="none" stroke={sparklineStyle.stroke} stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</div>
						{/if}

						<div class="flex items-center gap-3 font-medium text-surface-600 dark:text-surface-300">
							<div class="flex items-center gap-1">
								<iconify-icon icon="mdi:shield-remove" class="text-error-500"></iconify-icon>
								<span>{statsData.blockedIPs}</span>
							</div>
							<div class="flex items-center gap-1">
								<iconify-icon icon="mdi:alert-decagram" class="text-purple-500"></iconify-icon>
								<span>{statsData.cspViolations}</span>
							</div>
						</div>
					</div>
				{:else}
					<!-- Full UI Mode -->
					<div class="flex h-full flex-col gap-4">
						<!-- Threat Header -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="relative shrink-0">
									<div class="h-6 w-6 rounded-full flex items-center justify-center {overallThreatLevel === 'critical' ? 'bg-error-500' : overallThreatLevel === 'high' ? 'bg-warning-500' : overallThreatLevel === 'medium' ? 'bg-warning-500' : 'bg-success-500'}">
										<iconify-icon icon={overallThreatLevel === 'safe' ? 'mdi:shield-check' : 'mdi:shield-alert'} class="text-white text-sm"></iconify-icon>
									</div>
									<div class="absolute inset-0 h-6 w-6 rounded-full {overallThreatLevel === 'critical' ? 'bg-error-500' : overallThreatLevel === 'high' ? 'bg-warning-500' : overallThreatLevel === 'medium' ? 'bg-warning-500' : 'bg-success-500'} animate-ping opacity-40"></div>
								</div>
								<div>
									<div class="text-lg font-bold capitalize {threatColor} leading-tight">
										{overallThreatLevel} Threat Level
									</div>
									<div class="text-xs text-surface-500 dark:text-surface-400">
										{statsData.activeIncidents} active security incident{statsData.activeIncidents !== 1 ? 's' : ''}
									</div>
								</div>
							</div>

							<!-- Sparkline Trend Chart -->
							{#if threatHistory.length > 1}
								{@const maxVal = Math.max(...threatHistory, 5)}
								{@const points = threatHistory.map((val, i) => ({
									x: (i / Math.max(1, threatHistory.length - 1)) * 100,
									y: 28 - (val / maxVal) * 22 - 2
								}))}
								{@const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}
								{@const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} 28 L ${points[0].x.toFixed(2)} 28 Z`}

								<div class="w-24 h-8" aria-hidden="true" title="Incident volume trend">
									<svg viewBox="0 0 100 28" class="w-full h-full overflow-visible">
										<defs>
											<linearGradient id="secThreatGrad" x1="0" y1="0" x2="0" y2="1">
												<stop offset="0%" stop-color={sparklineStyle.stopColor} stop-opacity="0.2"/>
												<stop offset="100%" stop-color={sparklineStyle.stopColor} stop-opacity="0"/>
											</linearGradient>
										</defs>
										<path d={areaPath} fill="url(#secThreatGrad)" />
										<path d={linePath} fill="none" stroke={sparklineStyle.stroke} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								</div>
							{/if}
						</div>

						<!-- Key Metrics Grid -->
						<div class="grid grid-cols-2 gap-2">
							<div class="rounded-2xl bg-surface-50 p-3 dark:bg-surface-800/40 border border-surface-200/50 dark:border-surface-700/50 flex flex-col justify-between">
								<div class="text-xs text-surface-500 dark:text-surface-400">Blocked IPs</div>
								<div class="text-2xl font-bold tabular-nums mt-1 text-error-500">{statsData.blockedIPs}</div>
							</div>
							<div class="rounded-2xl bg-surface-50 p-3 dark:bg-surface-800/40 border border-surface-200/50 dark:border-surface-700/50 flex flex-col justify-between">
								<div class="text-xs text-surface-500 dark:text-surface-400">Throttled</div>
								<div class="text-2xl font-bold tabular-nums mt-1 text-warning-500">{statsData.throttledIPs}</div>
							</div>
							<div class="rounded-2xl bg-surface-50 p-3 dark:bg-surface-800/40 border border-surface-200/50 dark:border-surface-700/50 flex flex-col justify-between">
								<div class="text-xs text-surface-500 dark:text-surface-400">CSP Violations</div>
								<div class="text-2xl font-bold tabular-nums mt-1 text-purple-600 dark:text-purple-400">{statsData.cspViolations}</div>
							</div>
							<div class="rounded-2xl bg-surface-50 p-3 dark:bg-surface-800/40 border border-surface-200/50 dark:border-surface-700/50 flex flex-col justify-between">
								<div class="text-xs text-surface-500 dark:text-surface-400">Rate Limits</div>
								<div class="text-2xl font-bold tabular-nums mt-1 text-tertiary-600 dark:text-tertiary-400">{statsData.rateLimitHits}</div>
							</div>
						</div>

						<!-- Active Incidents Feed (if height allows) -->
						{#if size.h >= 3}
							<div class="flex-1 flex flex-col min-h-0">
								<h4 class="mb-2 text-xs font-semibold text-surface-500 dark:text-surface-400 flex items-center gap-1.5 tracking-wider">
									<iconify-icon icon="mdi:alert-circle" class="text-warning-500" ></iconify-icon>
									ACTIVE INCIDENTS ({activeIncidents.length})
								</h4>

								{#if activeIncidents.length > 0}
									<div class="space-y-2 overflow-y-auto pr-1 flex-1 custom-scroll max-h-40">
										{#each activeIncidents as incident (incident.id)}
											<div class="rounded-xl border-l-4 p-2.5 text-xs bg-surface-50 dark:bg-surface-800/40 border-surface-200 dark:border-surface-700
												{incident.threatLevel === 'critical' ? 'border-l-red-500' :
												  incident.threatLevel === 'high' ? 'border-l-orange-500' :
												  incident.threatLevel === 'medium' ? 'border-l-amber-500' : 'border-l-blue-500'}">
												<div class="flex justify-between items-center">
													<div class="font-mono font-medium text-surface-700 dark:text-surface-200">{incident.clientIp}</div>
													<div class="capitalize font-semibold text-[10px] px-1.5 py-0.5 rounded-full
														{incident.threatLevel === 'critical' ? 'bg-error-500/10 text-error-500' :
														  incident.threatLevel === 'high' ? 'bg-warning-500/10 text-warning-500' :
														  incident.threatLevel === 'medium' ? 'bg-warning-500/10 text-warning-500' : 'bg-tertiary-500/10 text-tertiary-500'}">
														{incident.threatLevel}
													</div>
												</div>
												<div class="text-[10px] text-surface-500 dark:text-surface-400 mt-1 flex justify-between">
													<span>{incident.indicatorCount} indicators</span>
													<span>{new Date(incident.timestamp).toLocaleTimeString()}</span>
												</div>
											</div>
										{/each}
									</div>
								{:else}
									<div class="flex flex-1 items-center justify-center rounded-2xl bg-surface-50 dark:bg-surface-800/30 border border-dashed border-surface-200 dark:border-surface-700/80 text-center py-6">
										<div>
											<iconify-icon icon="mdi:shield-check" class="text-4xl text-primary-500/80 animate-pulse" ></iconify-icon>
											<p class="text-xs text-surface-500 dark:text-surface-400 mt-2 font-medium">All systems secure</p>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
</BaseWidget>
