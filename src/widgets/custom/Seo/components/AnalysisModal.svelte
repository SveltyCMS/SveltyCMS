<!--
@file src/widgets/custom/Seo/components/AnalysisModal.svelte
@component
**Analysis Modal for SEO Widget**
Displays detailed SEO analysis results in a modal overlay.
-->

<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import type { SeoAnalysisResult } from '../seoTypes';

	interface Props {
		show: boolean;
		analysisResult: SeoAnalysisResult | null;
		close?: () => void;
	}

	let { show = $bindable(), analysisResult, close = () => {} }: Props = $props();

	function closeModal() {
		show = false;
		close();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (show && event.key === 'Escape') {
			close();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-999 bg-surface-50/50 dark:bg-surface-950/50 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
		onclick={closeModal}
		role="presentation"
	></div>

	<!-- Modal -->
	<div
		class="fixed left-1/2 top-1/2 z-1000 -translate-x-1/2 -translate-y-1/2 shadow-xl"
		transition:scale={{ duration: 200, start: 0.95 }}
		role="dialog"
		aria-modal="true"
	>
		<div class="card w-[90vw] max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-surface-100 dark:bg-surface-800">
			<!-- Header -->
			<header class="card-header flex items-center justify-between border-b border-surface-500/20 p-4">
				<h3 class="h3 flex items-center gap-2">
					<iconify-icon icon="mdi:google-analytics" class="text-primary-500"></iconify-icon>
					SEO Analysis Report
				</h3>
				<button type="button" class="btn-icon btn-icon-sm preset-ghost-surface-500" onclick={closeModal} aria-label="Close">
					<iconify-icon icon="mdi:close" width="24"></iconify-icon>
				</button>
			</header>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto p-4 space-y-4">
				{#if analysisResult}
					<!-- Score Overview -->
					<div class="flex items-center justify-center p-4 bg-surface-200-800 rounded-xl mb-6">
						<div class="text-center">
							<div
								class="radial-progress text-4xl font-bold {analysisResult.score.overall >= 80
									? 'text-success-500'
									: analysisResult.score.overall >= 50
										? 'text-warning-500'
										: 'text-error-500'}"
								style="--value:{analysisResult.score.overall}; --size:6rem;"
							>
								{analysisResult.score.overall}%
							</div>
							<p class="mt-2 font-bold text-surface-600 dark:text-surface-300">Overall Score</p>
						</div>
						<div class="ml-8 grid grid-cols-2 gap-4 text-sm">
							<div class="flex flex-col">
								<span class="opacity-70">Keywords</span>
								<span class="font-bold {analysisResult.score.keywords >= 80 ? 'text-success-500' : 'text-warning-500'}"
									>{analysisResult.score.keywords}%</span
								>
							</div>
							<div class="flex flex-col">
								<span class="opacity-70">Content</span>
								<span class="font-bold {analysisResult.score.content >= 80 ? 'text-success-500' : 'text-warning-500'}"
									>{analysisResult.score.content}%</span
								>
							</div>
							<div class="flex flex-col">
								<span class="opacity-70">Technical</span>
								<span class="font-bold {analysisResult.score.technical >= 80 ? 'text-success-500' : 'text-warning-500'}"
									>{analysisResult.score.technical}%</span
								>
							</div>
							<div class="flex flex-col">
								<span class="opacity-70">Readability</span>
								<span class="font-bold {analysisResult.score.readability >= 80 ? 'text-success-500' : 'text-warning-500'}"
									>{analysisResult.score.readability}%</span
								>
							</div>
						</div>
					</div>

					<!-- Suggestions List -->
					{#if analysisResult.suggestions.length > 0}
						<div class="space-y-3">
							<!-- Group by priority/type implicitly by sorting -->
							<h4 class="h4">Room for Improvement</h4>
							{#each analysisResult.suggestions as suggestion}
								<div
									class="card p-4 border-l-4 {suggestion.type === 'error'
										? 'border-error-500 bg-error-500/10'
										: suggestion.type === 'warning'
											? 'border-warning-500 bg-warning-500/10'
											: 'border-primary-500 bg-primary-500/10'}"
								>
									<div class="flex items-start justify-between">
										<div>
											<div class="font-bold flex items-center gap-2">
												<iconify-icon
													icon={suggestion.type === 'error' ? 'mdi:alert-circle' : suggestion.type === 'warning' ? 'mdi:alert' : 'mdi:information'}
												></iconify-icon>
												{suggestion.title}
											</div>
											<p class="text-sm mt-1 opacity-90">{suggestion.description}</p>
											{#if suggestion.fix}
												<div class="mt-2 text-xs font-mono bg-surface-100 dark:bg-surface-600/50 p-2 rounded">
													<strong>Fix:</strong>
													{suggestion.fix}
												</div>
											{/if}
										</div>
										<span
											class="badge {suggestion.type === 'error'
												? 'preset-filled-error-500'
												: suggestion.type === 'warning'
													? 'preset-filled-warning-500'
													: 'preset-filled-primary-500'} uppercase text-[10px]"
										>
											{suggestion.type}
										</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="alert preset-soft-success-500">
							<iconify-icon icon="mdi:check-circle" class="text-2xl mr-2"></iconify-icon>
							<span>Great job! No specific issues found.</span>
						</div>
					{/if}
				{:else}
					<div class="p-8 text-center">
						<div class="placeholder-circle animate-pulse w-16 h-16 mx-auto mb-4"></div>
						<p>Running Analysis...</p>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<footer class="card-footer p-4 border-t border-surface-500/20 flex justify-end">
				<button class="btn preset-filled-surface-500" onclick={closeModal}>Close</button>
			</footer>
		</div>
	</div>
{/if}
