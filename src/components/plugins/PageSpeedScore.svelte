<!--
@file src/components/plugins/PageSpeedScore.svelte
@component Component to display Google PageSpeed Insights score

Props:
- `score`: number | undefined
- `compact`: boolean

Features:
- Score display
- Compact mode
-->

<script lang="ts">
	interface Props {
		score: number | undefined;
		compact?: boolean;
	}

	const { score, compact = false }: Props = $props();

	// Calculate color class based on score
	// 0-49 (Red): Poor
	// 50-89 (Orange): Needs Improvement
	// 90-100 (Green): Good
	const scoreColor = $derived(
		!score
			? 'text-surface-200 dark:text-surface-600'
			: score >= 90
				? 'text-success-600 dark:text-success-400'
				: score >= 50
					? 'text-warning-600 dark:text-warning-400'
					: 'text-error-600 dark:text-error-400'
	);

	const scoreBg = $derived(
		!score
			? 'bg-surface-200 dark:bg-surface-700'
			: score >= 90
				? 'bg-success-100 dark:bg-success-900/30'
				: score >= 50
					? 'bg-warning-100 dark:bg-warning-900/30'
					: 'bg-error-100 dark:bg-error-900/30'
	);

	const scoreLabel = $derived(!score ? 'No Data' : score >= 90 ? 'Good' : score >= 50 ? 'Needs Work' : 'Poor');
</script>

{#if compact}
	<div class="flex items-center gap-2">
		<div class="flex h-8 w-8 items-center justify-center rounded-full {scoreBg}">
			<span class="text-xs font-bold {scoreColor}">{score || '—'}</span>
		</div>
	</div>
{:else}
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
