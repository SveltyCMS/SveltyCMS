<!--
@file src/widgets/custom/Seo/components/SeoAnalysisPanel.svelte
@component
**SEO Analysis Panel**
Displays the overall score and a scrollable list of suggestions.
Designed to be used in a dashboard layout (e.g. side-by-side with preview).
-->

<script lang="ts">
	import type { SeoAnalysisResult } from '../seoTypes';
	import { slide } from 'svelte/transition';

	interface Props {
		analysisResult: SeoAnalysisResult | null;
		class?: string;
		expanded?: boolean;
		isAnalyzing?: boolean;
	}

	let { analysisResult, class: className = '', expanded = $bindable(false), isAnalyzing = false }: Props = $props();
</script>

<div class="card preset-soft-surface-500 flex flex-col overflow-hidden {className} transition-all duration-300 {expanded ? 'h-[500px]' : 'h-16'}">
	<button
		type="button"
		class="flex items-center gap-4 w-full p-3 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors text-left"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-2 flex-1">
			<iconify-icon icon="mdi:google-analytics" class="text-tertiary-500 text-xl"></iconify-icon>
			<h3 class="h3 !text-lg">Analysis</h3>
		</div>

		{#if analysisResult}
			<div class="flex items-center gap-3">
				<div
					class="font-bold text-lg {analysisResult.score.overall >= 80
						? 'text-success-500'
						: analysisResult.score.overall >= 50
							? 'text-warning-500'
							: 'text-error-500'}"
				>
					{isNaN(analysisResult.score.overall) ? '0' : analysisResult.score.overall}%
				</div>
				<div class="text-xs opacity-70 hidden sm:block">
					{#if analysisResult.score.overall >= 80}
						Excellent
					{:else if analysisResult.score.overall >= 50}
						Good Start
					{:else}
						Needs Work
					{/if}
				</div>
				<iconify-icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} class="text-surface-400"></iconify-icon>
			</div>
		{:else}
			<div class="text-xs opacity-50">
				{#if isAnalyzing}
					Analyzing...
				{:else}
					No data
				{/if}
			</div>
		{/if}
	</button>

	{#if expanded}
		{#if isAnalyzing}
			<div class="flex-1 flex flex-col items-center justify-center text-surface-400 opacity-50 p-4">
				<div class="placeholder-circle animate-pulse w-8 h-8 mb-2"></div>
				<span class="text-xs">Analyzing...</span>
			</div>
		{:else if analysisResult}
			<!-- Scrollable Suggestions -->
			<div class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar border-t border-surface-500/20" transition:slide>
				{#if analysisResult.suggestions.length > 0}
					{#each analysisResult.suggestions as suggestion}
						<div
							class="card p-3 border-l-4 {suggestion.type === 'error'
								? 'border-error-500 bg-error-500/10'
								: suggestion.type === 'warning'
									? 'border-warning-500 bg-warning-500/10'
									: 'border-primary-500 bg-primary-500/10'}"
						>
							<div class="flex items-start gap-2">
								<div class="mt-0.5 shrink-0">
									<iconify-icon
										icon={suggestion.type === 'error' ? 'mdi:alert-circle' : suggestion.type === 'warning' ? 'mdi:alert' : 'mdi:information'}
										class={suggestion.type === 'error' ? 'text-error-500' : suggestion.type === 'warning' ? 'text-warning-500' : 'text-primary-500'}
									></iconify-icon>
								</div>
								<div class="flex-1 min-w-0">
									<div class="font-bold text-sm truncate" title={suggestion.title}>{suggestion.title}</div>
									<p class="text-xs opacity-80 line-clamp-2" title={suggestion.description}>{suggestion.description}</p>
									{#if suggestion.fix}
										<div class="mt-1.5 text-[10px] font-mono bg-surface-100 dark:bg-surface-700 p-1.5 rounded opacity-80">
											<strong>Fix:</strong>
											{suggestion.fix}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				{:else}
					<div class="alert preset-soft-success-500">
						<iconify-icon icon="mdi:check-circle" class="text-xl"></iconify-icon>
						<span class="text-sm">No issues found!</span>
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex-1 flex flex-col items-center justify-center text-surface-400 opacity-50 p-4">
				<span class="text-xs">Run analysis to see results.</span>
			</div>
		{/if}
	{/if}
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 6px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 20px;
	}
</style>
