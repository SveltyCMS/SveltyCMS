<!--
@file src/widgets/custom/Seo/components/SeoAnalysisPanel.svelte
@component
**SEO Analysis Panel**
Displays the overall score and a scrollable list of suggestions.
Designed to be used in a dashboard layout (e.g. side-by-side with preview).
-->

<script lang="ts">
import { logger } from "@utils/logger";
	import Button from '@components/ui/button.svelte';
	import Loader from '@components/ui/loader.svelte';
	import { slide } from 'svelte/transition';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import type { SeoAnalysisResult } from '../seo-types';
	import { getReadingEaseDescription } from '@src/utils/readability';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
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
				headers: clientJsonHeaders(),
				body: JSON.stringify({ content, currentId, collectionId }),
				signal: abortController.signal
			});

			if (!response.ok) throw new Error('Network response was not ok');

			const data = await response.json();
			linkSuggestions = data.suggestions || [];
		} catch (err: unknown) {
			if ((err as any).name === 'AbortError') {
				logger.debug('Fetch aborted');
			} else {
				logger.error('Failed to fetch link suggestions', err);
			}
		} finally {
			isFetchingLinks = false;
			abortController = null;
		}
	}
</script>

<div class="flex flex-col overflow-hidden rounded-lg border border-surface-500/30 bg-white dark:border-surface-500/40 dark:bg-surface-900 {className}">
	<button
		type="button"
		class="flex w-full items-center gap-3 bg-white px-6 py-3 text-start transition-colors hover:bg-surface-500/10 dark:bg-surface-900 dark:hover:bg-surface-500/20"
		onclick={() => (expanded = !expanded)}
		aria-label="Toggle SEO analysis{analysisResult ? `, ${Number.isNaN(analysisResult.score.overall) ? 0 : analysisResult.score.overall}%` : ''}"
		aria-expanded={expanded}
	>
		<div class="flex items-center gap-2 flex-1">
			<iconify-icon icon="mdi:information" width="24" class="text-tertiary-500 text-xl"></iconify-icon>
			<h3 class="h3 text-lg!">Analysis</h3>
		</div>

		{#if analysisResult}
			<div class="flex items-center gap-3">
				<div
					class="font-bold {analysisResult.score.overall >= 80
						? 'text-success-500'
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
		<iconify-icon
			icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}
			class="shrink-0 text-surface-400"
			aria-hidden="true"
		></iconify-icon>
	</button>

	{#if expanded}
		{#if isAnalyzing}
			<div class="flex flex-col items-center justify-center p-6 text-surface-400 opacity-50">
				<Loader variant="circle" width="size-8" height="size-8" class="mb-2" ariaLabel="Analyzing SEO" />
				<span class="text-xs">Analyzing...</span>
			</div>
		{:else if analysisResult}
			<!-- Metrics Summary -->
			<div class="grid grid-cols-2 gap-3 px-6 py-3 bg-surface-500/10 border-b border-surface-500/20">
				<div class="rounded-lg border border-surface-500/20 bg-white p-3 dark:border-surface-600 dark:bg-surface-800">
					<div class="text-[10px] uppercase tracking-wide text-surface-500 font-bold">Readability</div>
					<div class="text-lg font-bold">{analysisResult.readability.fleschKincaidScore}</div>
					<div class="text-[11px] text-surface-500 leading-tight">{getReadingEaseDescription(analysisResult.readability.fleschKincaidScore)}</div>
				</div>
				<div class="rounded-lg border border-surface-500/20 bg-white p-3 dark:border-surface-600 dark:bg-surface-800">
					<div class="text-[10px] uppercase tracking-wide text-surface-500 font-bold">Word Count</div>
					<div class="text-lg font-bold">{analysisResult.readability.wordCount}</div>
					<div class="text-[11px] text-surface-500">~{analysisResult.readability.readingTime} min read</div>
				</div>
			</div>

			<!-- Scrollable Suggestions -->
			<div class="max-h-80 overflow-y-auto px-6 py-3 space-y-4 custom-scrollbar" transition:slide>
				<div>
					<h4 class="text-xs font-bold uppercase tracking-wide text-surface-500 mb-3">Suggestions</h4>
					<div class="space-y-3">
				{#if analysisResult.suggestions.length > 0}
					{#each analysisResult.suggestions as suggestion (suggestion.id)}
						{const suggestionIcon =
							suggestion.type === 'error' ? 'mdi:alert-circle' : suggestion.type === 'warning' ? 'mdi:alert' : 'mdi:information'}
						<div
							class="rounded-lg border-s-4 p-3 {suggestion.type === 'error'
								? 'border-error-500 bg-error-500/10'
								: suggestion.type === 'warning'
									? 'border-warning-500 bg-warning-500/10'
									: 'border-tertiary-500 dark:border-primary-500 bg-tertiary-500/10 dark:bg-primary-500/10'}"
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
										<p class="text-xs opacity-80 line-clamp-2 dark:text-surface-400">
											{suggestion.description}
										</p>
									</SystemTooltip>
									{#if suggestion.fix}
										<div class="mt-2 text-[11px] bg-surface-500/10 dark:bg-surface-700 p-2 rounded">
											<strong>Fix:</strong>
											{suggestion.fix}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				{:else}
					<div class="flex items-center gap-2 rounded border border-success-500/30 bg-success-500/50 p-3 text-success-600 dark:border-success-500/40 dark:bg-success-900/20 dark:text-success-400">
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
						<Button variant="primary"
							onclick={fetchLinkSuggestions}
							disabled={isFetchingLinks}
						 size="sm" class="py-0.5 px-2 text-[10px]">
							{isFetchingLinks ? 'Searching...' : 'Find Suggestions'}
						</Button>
					</div>

					{#if linkSuggestions.length > 0}
						<div class="space-y-2">
							{#each linkSuggestions as link (link.url)}
								<div class="card p-2 preset-soft-surface text-xs flex items-center justify-between gap-2 group">
									<div class="truncate flex-1">
										<div class="font-bold truncate">{link.title}</div>
										<div class="opacity-50 text-[10px] truncate">{link.url}</div>
									</div>
									<Button variant="ghost" size="sm" class="p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Copy relative URL" aria-label="Copy relative URL" onclick={() => { navigator.clipboard.writeText(link.url); }}>
										<iconify-icon icon="mdi:content-copy" width="14"></iconify-icon>
									</Button>
								</div>
							{/each}
						</div>
					{:else if !isFetchingLinks}
						<p class="text-[10px] opacity-40 italic text-center py-2">Click button to discover internal link opportunities.</p>
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center p-6 text-surface-400 opacity-50">
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
		background-color: var(--color-surface-400, rgba(156, 163, 175, 0.5));
		border-radius: 20px;
	}
</style>
