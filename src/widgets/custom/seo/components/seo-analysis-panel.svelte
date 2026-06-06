<!--
@file src/widgets/custom/Seo/components/SeoAnalysisPanel.svelte
@component
**SEO Analysis Panel**
Displays the overall score and a scrollable list of suggestions.
Designed to be used in a dashboard layout (e.g. side-by-side with preview).
-->

<script lang="ts">
	import { slide } from 'svelte/transition';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import type { SeoAnalysisResult } from '../seo-types';
	import { getReadingEaseDescription } from '@src/utils/seo/readability';
	interface Props {
		analysisResult: SeoAnalysisResult | null;
		content?: string;
		currentId?: string;
		collectionId?: string;
		class?: string;
		expanded?: boolean;
		isAnalyzing?: boolean;
	}

	let { analysisResult, content = '', currentId = '', collectionId = '', class: className = '', expanded = $bindable(false), isAnalyzing = false }: Props = $props();

	let linkSuggestions = $state<Array<{ title: string; url: string; score: number }>>([]);
	let isFetchingLinks = $state(false);
	let abortController: AbortController | null = null;

	async function fetchLinkSuggestions() {
		if (!content) return;

		// Cancel any in-flight request
		if (abortController) {
			abortController.abort();
		}

		abortController = new AbortController();
		isFetchingLinks = true;

		try {
			const response = await fetch('/api/seo/link-suggestions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content, currentId, collectionId }),
				signal: abortController.signal
			});

			if (!response.ok) throw new Error('Network response was not ok');

			const data = await response.json();
			linkSuggestions = data.suggestions || [];
		} catch (err: unknown) {
			if ((err as any).name === 'AbortError') {
				console.log('Fetch aborted');
			} else {
				console.error('Failed to fetch link suggestions', err);
			}
		} finally {
			isFetchingLinks = false;
			abortController = null;
		}
	}
</script>

<div class="card pt-1 preset-tonal-surface flex flex-col overflow-hidden {className} transition-all duration-300 {expanded ? 'h-125' : 'h-16'}">
	<button
		type="button"
		class="flex items-center gap-4 w-full p-3 bg-surface-100-800-token hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors text-left"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-2 flex-1">
			<iconify-icon icon="mdi:information" width="24" class="text-tertiary-500 text-xl"></iconify-icon>
			<h3 class="h3 text-lg!">Analysis</h3>
		</div>

		{#if analysisResult}
			<div class="flex items-center gap-3">
				<div
					class="font-bold {analysisResult.score.overall >= 80
						? 'text-tertiary-500 dark:text-primary-500'
						: analysisResult.score.overall >= 50
							? 'text-warning-500'
							: 'text-error-500'}"
				>
					{Number.isNaN(analysisResult.score.overall) ? '0' : analysisResult.score.overall}%
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
				{#if expanded}
					<iconify-icon icon="mdi:chevron-up" class="text-surface-400"></iconify-icon>
				{:else}
					<iconify-icon icon="mdi:chevron-down" class="text-surface-400"></iconify-icon>
				{/if}
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
			<!-- Metrics Summary -->
			<div class="grid grid-cols-2 gap-2 p-3 bg-surface-50/5 border-b border-surface-500/10">
				<div class="card p-2 preset-soft-surface">
					<div class="text-[10px] uppercase opacity-50 font-bold">Readability</div>
					<div class="text-sm font-bold">{analysisResult.readability.fleschKincaidScore}</div>
					<div class="text-[9px] opacity-70 leading-tight">{getReadingEaseDescription(analysisResult.readability.fleschKincaidScore)}</div>
				</div>
				<div class="card p-2 preset-soft-surface">
					<div class="text-[10px] uppercase opacity-50 font-bold">Word Count</div>
					<div class="text-sm font-bold">{analysisResult.readability.wordCount}</div>
					<div class="text-[9px] opacity-70">~{analysisResult.readability.readingTime} min read</div>
				</div>
			</div>

			<!-- Scrollable Suggestions -->
			<div class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" transition:slide>
				<div>
					<h4 class="text-xs font-bold uppercase opacity-50 mb-2">Suggestions</h4>
					<div class="space-y-2">
				{#if analysisResult.suggestions.length > 0}
					{#each analysisResult.suggestions as suggestion (suggestion.id)}
						{const suggestionIcon =
							suggestion.type === 'error' ? 'mdi:alert-circle' : suggestion.type === 'warning' ? 'mdi:alert' : 'mdi:information'}
						<div
							class="card border-l-4 p-3 {suggestion.type === 'error'
								? 'border-error-500 bg-error-500/10'
								: suggestion.type === 'warning'
									? 'border-warning-500 bg-warning-500/10'
									: 'border-tertiary-500 dark:border-primary-500 bg-tertiary-500 dark:bg-primary-500/10'}"
						>
							<div class="flex items-start gap-2">
								<div class="mt-0.5 shrink-0">
									<iconify-icon
										icon={suggestionIcon}
										width="16"
										class={suggestion.type === 'error' ? 'text-error-500' : suggestion.type === 'warning' ? 'text-warning-500' : 'text-tertiary-500 dark:text-primary-500'}
									></iconify-icon>
								</div>
								<div class="flex-1 min-w-0">
									<SystemTooltip title={suggestion.title}>
										<div class="font-bold text-sm truncate dark:text-surface-50">
											{suggestion.title}
										</div>
									</SystemTooltip>
									<SystemTooltip title={suggestion.description}>
										<p class="text-xs opacity-80 line-clamp-2 dark:text-surface-200">
											{suggestion.description}
										</p>
									</SystemTooltip>
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
					<div class="flex items-center gap-2 rounded-lg border border-success-200 bg-success-50/50 p-3 text-success-700 dark:border-success-900/30 dark:bg-success-950/20 dark:text-success-300">
						<iconify-icon icon="mdi:check-circle" class="text-xl"></iconify-icon>
						<span class="text-sm">No issues found!</span>
					</div>
				{/if}
				</div>
				</div>

				<!-- Internal Link Suggestions -->
				<div class="pt-2 border-t border-surface-500/10">
					<div class="flex items-center justify-between mb-2">
						<h4 class="text-xs font-bold uppercase opacity-50">Internal Linking</h4>
						<button
							class="btn btn-sm preset-tonal-primary py-0.5 px-2 text-[10px]"
							onclick={fetchLinkSuggestions}
							disabled={isFetchingLinks}
						>
							{isFetchingLinks ? 'Searching...' : 'Find Suggestions'}
						</button>
					</div>

					{#if linkSuggestions.length > 0}
						<div class="space-y-2">
							{#each linkSuggestions as link}
								<div class="card p-2 preset-soft-surface text-xs flex items-center justify-between gap-2 group">
									<div class="truncate flex-1">
										<div class="font-bold truncate">{link.title}</div>
										<div class="opacity-50 text-[10px] truncate">{link.url}</div>
									</div>
									<button
										class="btn btn-sm preset-ghost-surface-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
										title="Copy relative URL"
										onclick={() => {
											navigator.clipboard.writeText(link.url);
											// Show toast or simple feedback
										}}
									>
										<iconify-icon icon="mdi:content-copy" width="14"></iconify-icon>
									</button>
								</div>
							{/each}
						</div>
					{:else if !isFetchingLinks}
						<p class="text-[10px] opacity-40 italic text-center py-2">Click button to discover internal link opportunities.</p>
					{/if}
				</div>
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
