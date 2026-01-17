<!--
@file src/components/plugins/PageSpeedScore.svelte
@component
Display PageSpeed Insights score with color coding

Props:
- score: Performance score (0-100)
- compact: Whether to show compact version
-->

<script lang="ts">
	interface Props {
		score?: number;
		compact?: boolean;
	}

	const { score = 0, compact = false }: Props = $props();

	// Color coding based on Google PageSpeed Insights thresholds
	const scoreColor = $derived.by(() => {
		if (!score) return 'text-surface-400';
		if (score >= 90) return 'text-success-500';
		if (score >= 50) return 'text-warning-500';
		return 'text-error-500';
	});

	const scoreBg = $derived.by(() => {
		if (!score) return 'bg-surface-200 dark:bg-surface-700';
		if (score >= 90) return 'bg-success-100 dark:bg-success-900';
		if (score >= 50) return 'bg-warning-100 dark:bg-warning-900';
		return 'bg-error-100 dark:bg-error-900';
	});

	const scoreLabel = $derived.by(() => {
		if (!score) return 'N/A';
		if (score >= 90) return 'Good';
		if (score >= 50) return 'Needs Work';
		return 'Poor';
	});
</script>

{#if compact}
	<!-- Compact version for table cells -->
	<div class="flex items-center gap-2">
		<div class="flex h-8 w-8 items-center justify-center rounded-full {scoreBg}">
			<span class="text-xs font-bold {scoreColor}">{score || '—'}</span>
		</div>
	</div>
{:else}
	<!-- Full version with label -->
	<div class="flex items-center gap-3">
		<div class="flex h-12 w-12 items-center justify-center rounded-full {scoreBg}">
			<span class="text-sm font-bold {scoreColor}">{score || '—'}</span>
		</div>
		<div class="flex flex-col">
			<span class="text-sm font-medium">{score || 'No data'}</span>
			<span class="text-xs text-surface-500">{scoreLabel}</span>
		</div>
	</div>
{/if}
