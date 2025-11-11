<!--
@file src/routes/(app)/dashboard/widgets/UnifiedMetricsWidget.svelte
@component
**Enterprise Unified Metrics Widget**

Advanced performance monitoring widget integrating with the unified MetricsService
for comprehensive system monitoring and performance analysis.

### Features:
- Real-time unified metrics from MetricsService
- Performance indicators with color-coded alerts
- Request/response time tracking with trend analysis
- Authentication and API performance monitoring
- Cache hit rates and optimization suggestions
- Security metrics integration
- Hook execution time analysis for bottleneck detection

### Props:
- `label`: Widget title (default: 'System Metrics')
- `size`: Widget dimensions for responsive layout
- `showDetails`: Include detailed breakdowns (default: true)
- `autoRefresh`: Enable automatic refresh (default: true)

@example
<UnifiedMetricsWidget label="Performance Center" size={{ w: 2, h: 3 }} />

@enterprise Advanced monitoring for production environments
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Unified Metrics',
		icon: 'mdi:chart-donut',
		description: 'Comprehensive system performance and security metrics',
		defaultSize: { w: 2, h: 3 }
	};
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { logger } from '@utils/logger';
	import BaseWidget from '../BaseWidget.svelte';

	// Props
	let {
		label = 'System Metrics',
		theme = 'light',
		icon = 'mdi:chart-donut',
		widgetId = undefined,
		size = { w: 2, h: 3 },
		showDetails = true,
		autoRefresh = true,
		refreshInterval = 3000,
		onSizeChange = () => {},
		onRemove = () => {}
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: { w: number; h: number };
		showDetails?: boolean;
		autoRefresh?: boolean;
		refreshInterval?: number;
		onSizeChange?: (newSize: { w: number; h: number }) => void;
		onRemove?: () => void;
	}>();

	// Unified metrics interface (matches MetricsService output)
	interface UnifiedMetrics {
		timestamp: number;
		uptime: number;
		requests: {
			total: number;
			errors: number;
			errorRate: number;
			avgResponseTime: number;
		};
		authentication: {
			validations: number;
			failures: number;
			successRate: number;
			cacheHits: number;
			cacheMisses: number;
			cacheHitRate: number;
		};
		api: {
			requests: number;
			errors: number;
			cacheHits: number;
			cacheMisses: number;
			cacheHitRate: number;
		};
		security: {
			rateLimitViolations: number;
			cspViolations: number;
			authFailures: number;
		};
		performance: {
			slowRequests: number;
			avgHookExecutionTime: number;
			bottlenecks: string[];
		};
	}

	// Reactive state
	let metrics = $state<UnifiedMetrics>({
		timestamp: 0,
		uptime: 0,
		requests: { total: 0, errors: 0, errorRate: 0, avgResponseTime: 0 },
		authentication: { validations: 0, failures: 0, successRate: 0, cacheHits: 0, cacheMisses: 0, cacheHitRate: 0 },
		api: { requests: 0, errors: 0, cacheHits: 0, cacheMisses: 0, cacheHitRate: 0 },
		security: { rateLimitViolations: 0, cspViolations: 0, authFailures: 0 },
		performance: { slowRequests: 0, avgHookExecutionTime: 0, bottlenecks: [] }
	});

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let refreshTimer: ReturnType<typeof setInterval> | null = null;
	let lastUpdate = $state(0);

	// Computed performance indicators - using $derived correctly
	let overallHealth = $derived(calculateOverallHealth(metrics));
	let healthColor = $derived(getHealthColor(overallHealth));
	let healthIcon = $derived(getHealthIcon(overallHealth));
	let primaryMetrics = $derived(getPrimaryMetrics(metrics));

	function calculateOverallHealth(m: UnifiedMetrics): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
		const factors = {
			errorRate: m.requests.errorRate,
			responseTime: m.requests.avgResponseTime,
			authSuccessRate: m.authentication.successRate,
			cacheHitRate: (m.authentication.cacheHitRate + m.api.cacheHitRate) / 2,
			securityViolations: m.security.rateLimitViolations + m.security.cspViolations,
			slowRequests: m.performance.slowRequests
		};

		// Critical indicators
		if (factors.errorRate > 10 || factors.responseTime > 5000 || factors.authSuccessRate < 80) {
			return 'critical';
		}

		// Poor performance indicators
		if (factors.errorRate > 5 || factors.responseTime > 2000 || factors.authSuccessRate < 90 || factors.securityViolations > 50) {
			return 'poor';
		}

		// Fair performance indicators
		if (factors.errorRate > 2 || factors.responseTime > 1000 || factors.cacheHitRate < 70 || factors.securityViolations > 20) {
			return 'fair';
		}

		// Good performance indicators
		if (factors.errorRate > 1 || factors.responseTime > 500 || factors.cacheHitRate < 85) {
			return 'good';
		}

		return 'excellent';
	}

	function getHealthColor(health: string): string {
		switch (health) {
			case 'excellent':
				return 'text-green-600';
			case 'good':
				return 'text-green-500';
			case 'fair':
				return 'text-yellow-500';
			case 'poor':
				return 'text-orange-500';
			case 'critical':
				return 'text-red-600 animate-pulse';
			default:
				return 'text-gray-500';
		}
	}

	function getHealthIcon(health: string): string {
		switch (health) {
			case 'excellent':
				return 'mdi:heart-pulse';
			case 'good':
				return 'mdi:heart';
			case 'fair':
				return 'mdi:heart-half';
			case 'poor':
				return 'mdi:heart-broken';
			case 'critical':
				return 'mdi:heart-off';
			default:
				return 'mdi:heart-outline';
		}
	}

	function getPrimaryMetrics(m: UnifiedMetrics) {
		return {
			responseTime: {
				value: m.requests.avgResponseTime,
				formatted: `${m.requests.avgResponseTime.toFixed(0)}ms`,
				status: m.requests.avgResponseTime < 500 ? 'good' : m.requests.avgResponseTime < 1000 ? 'fair' : 'poor'
			},
			errorRate: {
				value: m.requests.errorRate,
				formatted: `${m.requests.errorRate.toFixed(2)}%`,
				status: m.requests.errorRate < 1 ? 'good' : m.requests.errorRate < 5 ? 'fair' : 'poor'
			},
			authSuccess: {
				value: m.authentication.successRate,
				formatted: `${m.authentication.successRate.toFixed(1)}%`,
				status: m.authentication.successRate > 95 ? 'good' : m.authentication.successRate > 90 ? 'fair' : 'poor'
			},
			cacheEfficiency: {
				value: (m.authentication.cacheHitRate + m.api.cacheHitRate) / 2,
				formatted: `${((m.authentication.cacheHitRate + m.api.cacheHitRate) / 2).toFixed(1)}%`,
				status: (m.authentication.cacheHitRate + m.api.cacheHitRate) / 2 > 80 ? 'good' : 'fair'
			}
		};
	}

	function getMetricColor(status: string): string {
		switch (status) {
			case 'good':
				return 'text-green-600';
			case 'fair':
				return 'text-yellow-600';
			case 'poor':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	}

	// Data fetching
	async function fetchMetrics(): Promise<void> {
		try {
			isLoading = true;
			error = null;

			const response = await fetch('/api/metrics/unified');
			if (!response.ok) {
				throw new Error(`Metrics fetch failed: ${response.status}`);
			}

			const data = await response.json();
			metrics = data;
			lastUpdate = Date.now();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fetch metrics';
			logger.error('Unified metrics fetch error:', err);
		} finally {
			isLoading = false;
		}
	}

	// Utility functions
	function formatUptime(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ${hours % 24}h`;
		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
		return `${seconds}s`;
	}

	function formatNumber(num: number): string {
		if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
		if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
		return num.toString();
	}

	function formatLastUpdate(): string {
		if (!lastUpdate) return 'Never';
		const ago = Math.floor((Date.now() - lastUpdate) / 1000);
		if (ago < 60) return `${ago}s ago`;
		return `${Math.floor(ago / 60)}m ago`;
	}

	// Lifecycle
	onMount(() => {
		fetchMetrics();

		if (autoRefresh) {
			refreshTimer = setInterval(fetchMetrics, refreshInterval);
		}
	});

	onDestroy(() => {
		if (refreshTimer) {
			clearInterval(refreshTimer);
		}
	});
</script>

<BaseWidget {label} {theme} {icon} {widgetId} {size} {onSizeChange} onCloseRequest={onRemove} {isLoading} {error}>
	<div class="flex h-full flex-col space-y-3 p-2">
		<!-- Health Status Header -->
		<div class="flex items-center justify-between">
			<div class="flex items-center space-x-2">
				<iconify-icon icon={healthIcon} class="text-xl {healthColor}"></iconify-icon>
				<div>
					<h3 class="font-semibold capitalize">{overallHealth}</h3>
					<p class="text-xs text-gray-500">System Health</p>
				</div>
			</div>
			<div class="text-right">
				<div class="text-xs text-gray-500">Uptime</div>
				<div class="font-mono text-sm">{formatUptime(metrics.uptime)}</div>
			</div>
		</div>

		<!-- Primary Metrics Grid -->
		<div class="grid grid-cols-2 gap-2">
			<div class="rounded bg-surface-100 p-2 dark:bg-surface-700">
				<div class="text-xs text-gray-600 dark:text-gray-400">Response Time</div>
				<div class="font-bold {getMetricColor(primaryMetrics.responseTime.status)}">
					{primaryMetrics.responseTime.formatted}
				</div>
			</div>
			<div class="rounded bg-surface-100 p-2 dark:bg-surface-700">
				<div class="text-xs text-gray-600 dark:text-gray-400">Error Rate</div>
				<div class="font-bold {getMetricColor(primaryMetrics.errorRate.status)}">
					{primaryMetrics.errorRate.formatted}
				</div>
			</div>
			<div class="rounded bg-surface-100 p-2 dark:bg-surface-700">
				<div class="text-xs text-gray-600 dark:text-gray-400">Auth Success</div>
				<div class="font-bold {getMetricColor(primaryMetrics.authSuccess.status)}">
					{primaryMetrics.authSuccess.formatted}
				</div>
			</div>
			<div class="rounded bg-surface-100 p-2 dark:bg-surface-700">
				<div class="text-xs text-gray-600 dark:text-gray-400">Cache Hit</div>
				<div class="font-bold {getMetricColor(primaryMetrics.cacheEfficiency.status)}">
					{primaryMetrics.cacheEfficiency.formatted}
				</div>
			</div>
		</div>

		<!-- Detailed Metrics (if space allows) -->
		{#if showDetails && size.h >= 3}
			<div class="min-h-0 flex-1 space-y-2">
				<!-- Request Statistics -->
				<div class="border-t pt-2">
					<h5 class="mb-1 text-xs font-medium">Request Statistics</h5>
					<div class="grid grid-cols-3 gap-1 text-xs">
						<div class="text-center">
							<div class="font-mono">{formatNumber(metrics.requests.total)}</div>
							<div class="text-gray-500">Total</div>
						</div>
						<div class="text-center">
							<div class="font-mono text-red-600">{formatNumber(metrics.requests.errors)}</div>
							<div class="text-gray-500">Errors</div>
						</div>
						<div class="text-center">
							<div class="font-mono text-yellow-600">{formatNumber(metrics.performance.slowRequests)}</div>
							<div class="text-gray-500">Slow</div>
						</div>
					</div>
				</div>

				<!-- Security Overview -->
				<div class="border-t pt-2">
					<h5 class="mb-1 text-xs font-medium">Security Events</h5>
					<div class="grid grid-cols-3 gap-1 text-xs">
						<div class="text-center">
							<div class="font-mono text-orange-600">{metrics.security.rateLimitViolations}</div>
							<div class="text-gray-500">Rate Limits</div>
						</div>
						<div class="text-center">
							<div class="font-mono text-purple-600">{metrics.security.cspViolations}</div>
							<div class="text-gray-500">CSP Violations</div>
						</div>
						<div class="text-center">
							<div class="font-mono text-red-600">{metrics.security.authFailures}</div>
							<div class="text-gray-500">Auth Fails</div>
						</div>
					</div>
				</div>

				<!-- Performance Bottlenecks -->
				{#if metrics.performance.bottlenecks.length > 0}
					<div class="border-t pt-2">
						<h5 class="mb-1 text-xs font-medium">Performance Bottlenecks</h5>
						<div class="space-y-1">
							{#each metrics.performance.bottlenecks.slice(0, 3) as bottleneck}
								<div class="rounded bg-yellow-100 px-1 py-0.5 text-xs dark:bg-yellow-900/20">
									{bottleneck}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Footer with last update -->
		<div class="border-t pt-1 text-center text-xs text-gray-500">
			Last updated: {formatLastUpdate()}
		</div>
	</div>
</BaseWidget>
