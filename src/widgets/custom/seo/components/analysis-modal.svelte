<!--
@file src/widgets/custom/seo/components/analysis-modal.svelte
@component
**Analysis Modal for SEO Widget**
Displays detailed SEO analysis results in a modal overlay.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Loader from '@components/ui/loader.svelte';
	import Modal from '@components/ui/modal.svelte';
	import {
		button_close,
		common_readability,
		common_technical,
		seo_analysis_all_clear,
		seo_analysis_fix,
		seo_analysis_keywords,
		seo_analysis_overall_score,
		seo_analysis_report_title,
		seo_analysis_room_improvement,
		seo_analysis_running,
		trash_th_content
	} from '@src/paraglide/messages';
	import type { SeoAnalysisResult } from '../seo-types';

	interface Props {
		analysisResult: SeoAnalysisResult | null;
		onclose?: () => void;
		show: boolean;
	}

	let { show = $bindable(), analysisResult, onclose = () => {} }: Props = $props();

	function close() {
		show = false;
		onclose();
	}
</script>

<Modal bind:open={show} size="lg" {onclose}>
	{#snippet header()}
		<h3 class="h4 font-bold flex items-center gap-2 text-surface-900 dark:text-white">
			<iconify-icon
				icon="mdi:google-analytics"
				width="22"
				class="text-tertiary-500 dark:text-primary-500"
			></iconify-icon>
			{seo_analysis_report_title()}
		</h3>
	{/snippet}

	<div class="space-y-4">
		{#if analysisResult}
			<!-- Score Overview -->
			<div
				class="flex items-center justify-center p-4 bg-(--admin-bg-card) rounded-(--admin-radius-card) border border-(--admin-border-default) mb-6"
			>
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
					<p class="mt-2 font-bold text-(--admin-text-muted)">
						{seo_analysis_overall_score()}
					</p>
				</div>
				<div class="ms-8 grid grid-cols-2 gap-4 text-sm">
					<div class="flex flex-col">
						<span class="opacity-70">{seo_analysis_keywords()}</span>
						<span
							class="font-bold {analysisResult.score.keywords >= 80
								? 'text-success-500'
								: 'text-warning-500'}">{analysisResult.score.keywords}%</span
						>
					</div>
					<div class="flex flex-col">
						<span class="opacity-70">{trash_th_content()}</span>
						<span
							class="font-bold {analysisResult.score.content >= 80
								? 'text-success-500'
								: 'text-warning-500'}">{analysisResult.score.content}%</span
						>
					</div>
					<div class="flex flex-col">
						<span class="opacity-70">{common_technical()}</span>
						<span
							class="font-bold {analysisResult.score.technical >= 80
								? 'text-success-500'
								: 'text-warning-500'}">{analysisResult.score.technical}%</span
						>
					</div>
					<div class="flex flex-col">
						<span class="opacity-70">{common_readability()}</span>
						<span
							class="font-bold {analysisResult.score.readability >= 80
								? 'text-success-500'
								: 'text-warning-500'}">{analysisResult.score.readability}%</span
						>
					</div>
				</div>
			</div>

			<!-- Suggestions List -->
			{#if analysisResult.suggestions.length > 0}
				<div class="space-y-3">
					<!-- Group by priority/type implicitly by sorting -->
					<h4 class="h4">{seo_analysis_room_improvement()}</h4>
					{#each analysisResult.suggestions as suggestion (suggestion.title)}
						{const suggestionIcon =
							suggestion.type === 'error'
								? 'mdi:alert-circle'
								: suggestion.type === 'warning'
									? 'mdi:alert'
									: 'mdi:information'}
						<div
							class="card border-s-4 p-4 {suggestion.type === 'error'
								? 'border-error-500 bg-error-500/10'
								: suggestion.type === 'warning'
									? 'border-warning-500 bg-warning-500/10'
									: 'border-tertiary-500 dark:border-primary-500 bg-tertiary-500 dark:bg-primary-500/10'}"
						>
							<div class="flex items-start justify-between">
								<div>
									<div class="font-bold flex items-center gap-2">
										<iconify-icon icon={suggestionIcon} width="16"></iconify-icon>
										{suggestion.title}
									</div>
									<p class="text-sm mt-1 opacity-90">{suggestion.description}</p>
									{#if suggestion.fix}
										<div
											class="mt-2 text-xs font-mono bg-surface-500/10 dark:bg-surface-800/50 p-2 rounded-(--admin-radius-input)"
										>
											<strong>{seo_analysis_fix()}</strong>
											{suggestion.fix}
										</div>
									{/if}
								</div>
								<Badge
									variant={suggestion.type === 'error'
										? 'error'
										: suggestion.type === 'warning'
											? 'warning'
											: 'primary'}
									size="sm"
								>
									{suggestion.type}
								</Badge>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="card border-s-4 border-success-500 bg-success-500/10 p-4 flex items-center">
					<iconify-icon icon="mdi:check-circle" class="text-2xl me-2 text-success-500"
					></iconify-icon>
					<span class="text-success-600 dark:text-success-400 font-medium"
						>{seo_analysis_all_clear()}</span
					>
				</div>
			{/if}
		{:else}
			<div class="p-8 text-center">
				<Loader
					variant="circle"
					width="size-16"
					height="size-16"
					class="mx-auto mb-4"
					ariaLabel="Running SEO analysis"
				/>
				<p>{seo_analysis_running()}</p>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<Button variant="surface" onclick={close}>{button_close()}</Button>
	{/snippet}
</Modal>
