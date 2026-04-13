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
		if (score < 0) return 'bg-slate-200 text-slate-500'; // N/A
		if (score >= 90) return 'bg-green-100 text-green-700 border-green-200'; // 90-100: Good
		if (score >= 50) return 'bg-amber-100 text-amber-700 border-amber-200'; // 50-89: Needs Improvement
		return 'bg-red-100 text-red-700 border-red-200'; // 0-49: Poor
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
		<div class="flex h-8 w-12 items-center justify-center rounded-full bg-slate-100 text-[10px] uppercase text-slate-400">
			N/A
		</div>
	{/if}

	{#if score >= 0 && (fcp || lcp || cls)}
		<div class="hidden xl:flex flex-col text-[10px] text-slate-500 leading-tight">
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
