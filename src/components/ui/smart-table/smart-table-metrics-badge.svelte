<!--
@file src/components/ui/smart-table/smart-table-metrics-badge.svelte
@component
**Compact list-query metrics badge (observability).**

Shows p50/p95 latency and cache hit rate. Prefer SSR `summary` from page load
(server ring buffer is not shared with the browser). Falls back to client-side
`summarizeListQueryMetrics` when samples exist in-process.

Visible when `?debug=table` or `forceShow` is true.

### Props
- `source` (string): Metrics source key (default CollectionService).
- `summary` (object): Optional SSR snapshot `{ count, p50Ms, p95Ms, hitRate, avgMs }`.
- `forceShow` (boolean): Show without query param.
-->

<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { summarizeListQueryMetrics } from '@utils/list-query-metrics';

	export type ListMetricsSummary = {
		count: number;
		hitRate: number;
		p50Ms: number;
		p95Ms: number;
		avgMs: number;
	};

	let {
		source = 'CollectionService.getCollectionData',
		summary: summaryProp = null,
		forceShow = false
	}: {
		source?: string;
		summary?: ListMetricsSummary | null;
		forceShow?: boolean;
	} = $props();

	const show = $derived(
		forceShow || page.url.searchParams.get('debug') === 'table'
	);

	// Prefer SSR prop; client-side buffer is empty unless samples were recorded in-browser
	const summary = $derived.by((): ListMetricsSummary | null => {
		if (!show) return null;
		void page.url.search;
		if (summaryProp && summaryProp.count > 0) return summaryProp;
		if (browser) {
			const local = summarizeListQueryMetrics(source);
			return local.count > 0 ? local : null;
		}
		return null;
	});
</script>

{#if show && summary && summary.count > 0}
	<div
		class="inline-flex items-center gap-2 rounded-md border border-surface-200 bg-surface-50 px-2 py-1 font-mono text-[10px] text-surface-600 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300"
		role="status"
		aria-label="Table query metrics"
		title="List query metrics (server samples; add ?debug=table)"
	>
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">list</span>
		<span>n={summary.count}</span>
		<span>p50={summary.p50Ms}ms</span>
		<span>p95={summary.p95Ms}ms</span>
		<span>hit={(summary.hitRate * 100).toFixed(0)}%</span>
	</div>
{/if}
