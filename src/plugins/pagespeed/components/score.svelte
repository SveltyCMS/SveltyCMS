<!--
 @file src/plugins/pagespeed/components/score.svelte
 @component PageSpeed Score Display.
 Shows a color-coded performance badge with tooltip metrics.
-->

<script lang="ts">
	interface Props {
		score?: number; // 0-100
		fcp?: number;
		lcp?: number;
		cls?: number;
		fetchedAt?: string;
	}

	let { score = -1, fcp, lcp, cls, fetchedAt }: Props = $props();

	// Determine color based on Lighthouse thresholds
	const colorClass = $derived.by(() => {
		if (score < 0) return 'bg-surface-200 text-surface-500'; // N/A
		if (score >= 90) return 'bg-success-100 text-success-700 border-success-200'; // 90-100: Good
		if (score >= 50) return 'bg-warning-100 text-warning-700 border-warning-200'; // 50-89: Needs Improvement
		return 'bg-error-100 text-error-700 border-error-200'; // 0-49: Poor
	});

	const formattedDate = $derived(fetchedAt ? new Date(fetchedAt).toLocaleDateString() : 'Never');
</script>

<div class="flex items-center gap-2">
	{#if score >= 0}
		<div
			class="flex h-8 w-12 items-center justify-center rounded-full border font-bold shadow-sm {colorClass}"
			title="PageSpeed Score: {score}/100 (Fetched: {formattedDate})"
		>
			{score}
		</div>
	{:else}
		<div class="flex h-8 w-12 items-center justify-center rounded-full bg-surface-100 text-[10px] uppercase text-surface-400">
			N/A
		</div>
	{/if}

	{#if score >= 0 && (fcp || lcp || cls)}
		<div class="hidden xl:flex flex-col text-[10px] text-surface-500 leading-tight">
			{#if lcp}<span>LCP: {(lcp / 1000).toFixed(1)}s</span>{/if}
			{#if cls}<span>CLS: {cls.toFixed(2)}</span>{/if}
		</div>
	{/if}
</div>

<style>
	/* Optional: Add hover animations */
	div {
		transition: all 0.2s ease-in-out;
	}
</style>
