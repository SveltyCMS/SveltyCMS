<!--
@file src/routes/(app)/dashboard/widgets/system-health-widget.svelte
@component
**Modern System Health Monitor - Service status & overall system state using native SVG latency sparkline**
-->

<script lang="ts" module>
export const widgetMeta = {
	name: "System Health",
	icon: "mdi:heart-pulse",
	description: "Monitor system services and overall health",
	defaultSize: { w: 2, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import { toast } from '@src/stores/toast.svelte.ts';
	import BaseWidget from '../base-widget.svelte';

	const {
		label = 'System Health',
		theme = 'light',
		icon = 'mdi:heart-pulse',
		widgetId = undefined,
		size = { w: 2, h: 2 } as WidgetSize,
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

	type SystemState = 'IDLE' | 'INITIALIZING' | 'READY' | 'DEGRADED' | 'FAILED';
	type ServiceHealth = 'healthy' | 'unhealthy' | 'initializing';

	interface ServiceStatus {
		status: ServiceHealth;
		message: string;
		error?: string;
		lastChecked?: number;
		performance?: {
			latency?: number;
			avgLatency?: number;
		};
	}

	interface HealthData {
		overallStatus: SystemState;
		components: Record<string, ServiceStatus>;
		uptime: number;
		timestamp: number;
	}

	// Local state loaded from endpoint
	let fetchedData: any = $state(null);
	let latencyHistory = $state<Record<string, number[]>>({});
	const HISTORY_MAX_POINTS = 12;

	const health = $derived(fetchedData as HealthData | null);

	const overallColor = $derived.by(() => {
		switch (health?.overallStatus) {
			case 'READY': return 'text-emerald-600 dark:text-emerald-400';
			case 'DEGRADED': return 'text-amber-600 dark:text-amber-400';
			case 'FAILED': return 'text-red-600 dark:text-red-400';
			case 'INITIALIZING': return 'text-blue-600 dark:text-blue-400';
			default: return 'text-surface-500';
		}
	});

	function getStateIcon(state: SystemState): string {
		switch (state) {
			case 'READY': return 'mdi:check-circle';
			case 'DEGRADED': return 'mdi:alert-circle';
			case 'FAILED': return 'mdi:close-circle';
			case 'INITIALIZING': return 'mdi:loading';
			default: return 'mdi:pause-circle';
		}
	}

	function formatUptime(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}

	function formatServiceName(name: string): string {
		return name
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, str => str.toUpperCase());
	}

	async function reinitializeSystem() {
		try {
			toast.warning('Reinitializing system...');

			const res = await fetch('/api/system/reinitialize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ force: true })
			});

			if (res.ok) {
				const result = await res.json();
				toast.success(result.message || 'System reinitialized successfully');
			} else {
				throw new Error('Reinitialization failed');
			}
		} catch (err) {
			toast.error(`Reinitialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	}

	function handleDataLoaded(newData: any) {
		fetchedData = newData;
		if (newData?.components) {
			for (const [name, service] of Object.entries(newData.components)) {
				const latency = (service as any).performance?.latency;
				if (latency !== undefined) {
					if (!latencyHistory[name]) {
						latencyHistory[name] = [];
					}
					latencyHistory[name].push(latency);
					if (latencyHistory[name].length > HISTORY_MAX_POINTS) {
						latencyHistory[name].shift();
					}
				}
			}
		}
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/health"
	pollInterval={5000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
	onDataLoaded={handleDataLoaded}
>
	{#snippet children({ data })}
		{const healthData = data as HealthData | null}

		{#if !healthData}
			<div class="flex h-full items-center justify-center">
				<div class="flex flex-col items-center gap-3 text-surface-500">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
					<p class="text-sm">Checking system health...</p>
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col justify-between" role="region" aria-label="System Health Overview">
				{#if size.h === 1}
					<!-- Compact mode layout -->
					<div class="flex items-center justify-between text-xs px-1 w-full h-full min-h-9">
						<div class="flex items-center gap-2">
							<iconify-icon
								icon={getStateIcon(healthData.overallStatus)}
								class="text-lg {overallColor}"
							></iconify-icon>
							<div>
								<span class="font-semibold capitalize {overallColor}">{healthData.overallStatus}</span>
								<span class="text-surface-500 dark:text-surface-400 ms-1">Uptime: {formatUptime(healthData.uptime)}</span>
							</div>
						</div>

						<div class="flex items-center gap-2 font-medium text-surface-600 dark:text-surface-300">
							{#each Object.entries(healthData.components).slice(0, 3) as [name, service]}
								<div class="flex items-center gap-1" title={`${formatServiceName(name)}: ${service.status}`}>
									<span class="relative flex h-1.5 w-1.5">
										<span class="relative inline-flex rounded-full h-1.5 w-1.5
											{service.status === 'healthy' ? 'bg-emerald-500' :
											 service.status === 'unhealthy' ? 'bg-red-500' : 'bg-amber-500'}"></span>
									</span>
									<span class="text-[10px] opacity-80">{formatServiceName(name).substring(0, 2)}</span>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<!-- Full Mode -->
					<div class="flex h-full flex-col gap-4">
						<!-- Overall Status Header -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="relative flex h-6 w-6">
									<iconify-icon
										icon={getStateIcon(healthData.overallStatus)}
										class="text-3xl {overallColor}"
									></iconify-icon>
								</div>
								<div>
									<div class="text-lg font-bold capitalize {overallColor} leading-tight">
										{healthData.overallStatus}
									</div>
									<div class="text-xs text-surface-500 dark:text-surface-400">
										System Uptime • {formatUptime(healthData.uptime)}
									</div>
								</div>
							</div>

							<button
								onclick={reinitializeSystem}
								class="rounded border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-500/10 dark:text-amber-400 transition-all duration-150 flex items-center gap-1.5"
							>
								<iconify-icon icon="mdi:refresh" width={16}></iconify-icon>
								Reinitialize
							</button>
						</div>

						<!-- Services Cards Feed -->
						<div class="flex-1 overflow-y-auto pe-1 space-y-2 custom-scroll max-h-55">
							{#each Object.entries(healthData.components) as [name, service] (name)}
								{const latency = service.performance?.latency}
								{const history = latencyHistory[name] || []}
								<div class="rounded-2xl bg-surface-50 dark:bg-surface-800/40 p-3 border border-surface-200/50 dark:border-surface-700/50 flex items-center justify-between gap-3">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-1.5">
											{#if name === 'database' && service.status === 'healthy'}
												<span class="relative flex h-2 w-2">
													<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
													<span class="relative inline-flex rounded-full h-2 w-2 bg-success-500"></span>
												</span>
											{/if}
											<span class="text-sm font-semibold truncate text-surface-800 dark:text-surface-100">{formatServiceName(name)}</span>
										</div>
										<div class="text-xs text-surface-500 dark:text-surface-400 line-clamp-1 mt-0.5" title={service.message}>
											{service.message}
										</div>
									</div>

									<div class="flex items-center gap-3">
										<!-- Mini SVG Latency Sparkline inside card -->
										{#if history.length > 1}
											{const maxVal = Math.max(...history, 50)}
											{const points = history.map((val, i) => ({
												x: (i / Math.max(1, history.length - 1)) * 40,
												y: 14 - (val / maxVal) * 12
											}))}
											{const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}
											<div class="w-10 h-4 opacity-70 hidden sm:block" aria-hidden="true" title="Latency trend">
												<svg viewBox="0 0 40 14" class="w-full h-full overflow-visible">
													<path d={linePath} fill="none" stroke="rgb(16, 185, 129)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
												</svg>
											</div>
										{/if}

										<div class="flex flex-col items-end gap-0.5">
											<span class="badge text-[10px] px-2 py-0.5 font-medium rounded-full
												{service.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
												 service.status === 'unhealthy' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
												 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}">
												{service.status}
											</span>

											{#if latency !== undefined}
												<span class="text-[9px] font-mono text-surface-500 dark:text-surface-400">
													{latency.toFixed(0)}ms
												</span>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
</BaseWidget>
