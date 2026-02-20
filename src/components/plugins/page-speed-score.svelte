<!--
@file src/components/plugins/page-speed-score.svelte
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
		compact?: boolean;
		score: number | undefined;
	}

	const { score, compact = false }: Props = $props();

	// Calculate color class based on score
	// 0-49 (Red): Poor
	// 50-89 (Orange): Needs Improvement
	// 90-100 (Green): Good
	const scoreColor = $derived.by(() => {
		if (!score && score !== 0) {
			return 'text-surface-200 dark:text-surface-600';
		}
		if (score >= 90) {
			return 'text-success-600 dark:text-success-400';
		}
		if (score >= 50) {
			return 'text-warning-600 dark:text-warning-400';
		}
		return 'text-error-600 dark:text-error-400';
	});

	const scoreBg = $derived.by(() => {
		if (!score && score !== 0) {
			return 'bg-surface-200 dark:bg-surface-700';
		}
		if (score >= 90) {
			return 'bg-success-100 dark:bg-success-900/30';
		}
		if (score >= 50) {
			return 'bg-warning-100 dark:bg-warning-900/30';
		}
		return 'bg-error-100 dark:bg-error-900/30';
	});

	const scoreLabel = $derived.by(() => {
		if (!score && score !== 0) {
			return 'No Data';
		}
		if (score >= 90) {
			return 'Good';
		}
		if (score >= 50) {
			return 'Needs Work';
		}
		return 'Poor';
	});
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
