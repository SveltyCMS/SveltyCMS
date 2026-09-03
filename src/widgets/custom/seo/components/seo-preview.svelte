<!--
@file src/widgets/custom/seo/components/seo-preview.svelte
@component
**SEO search preview for the SEO widget**

Shows a Google-like snippet with desktop/mobile width and an optional word-emphasis overlay.

@example
<SeoPreview bind:title={title} bind:description={description} bind:hostUrl={hostUrl} bind:SeoPreviewToggle={SeoPreviewToggle} />

#### Props
- `title` {string} - Title text
- `description` {string} - Description text
- `hostUrl` {string} - Host URL
- `keywords` {string[]} - Focus-keyword tokens for heatmap highlighting
- `SeoPreviewToggle` {boolean} - Mobile preview when true

#### Features
- Desktop / mobile SERP truncation by pixel width
- Heatmap overlay for keywords, power words, and front-of-snippet words
- Heatmap is snippet emphasis only — not live Google click data
-->

<script module lang="ts">
	import Button from '@components/ui/button.svelte';
	import { widget_seo_powerwords } from '@src/paraglide/messages';

	const POWER_WORDS = new Set(
		widget_seo_powerwords()
			.split(',')
			.map((w: string) => w.trim().toLowerCase())
	);
</script>

<script lang="ts">
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { fade } from 'svelte/transition';
	import {
		classifyHeatmapWord,
		formatSerpUrl,
		SERP_DESC_DESKTOP_PX,
		SERP_DESC_MOBILE_PX,
		SERP_TITLE_DESKTOP_PX,
		SERP_TITLE_MOBILE_PX,
		truncateToPx
	} from '../seo-serp';

	function renderHeatmap(text: string, keywords: string[]) {
		return text
			.split(/\s+/)
			.filter(Boolean)
			.map((word, i) => ({
				word,
				role: classifyHeatmapWord(word, i, keywords, POWER_WORDS)
			}));
	}

	interface Props {
		description: string;
		hostUrl: string;
		keywords?: string[];
		SeoPreviewToggle?: boolean;
		title: string;
	}

	let { title, description, hostUrl, keywords = [], SeoPreviewToggle = $bindable(false) }: Props = $props();

	let heatmapMode = $state(false);

	let debouncedTitle = $state('');
	let debouncedDesc = $state('');

	$effect(() => {
		const t = setTimeout(() => {
			debouncedTitle = title;
			debouncedDesc = description;
		}, 300);
		return () => clearTimeout(t);
	});

	let heatmapDataTitle = $derived(renderHeatmap(debouncedTitle || title || 'Page Title', keywords));
	let heatmapDataDesc = $derived(renderHeatmap(debouncedDesc || description || 'Page description goes here...', keywords));

	const titleLimitPx = $derived(SeoPreviewToggle ? SERP_TITLE_MOBILE_PX : SERP_TITLE_DESKTOP_PX);
	const descLimitPx = $derived(SeoPreviewToggle ? SERP_DESC_MOBILE_PX : SERP_DESC_DESKTOP_PX);

	const previewTitle = $derived(truncateToPx(title || 'Page Title', titleLimitPx, 'title'));
	const previewDescription = $derived(
		truncateToPx(description || 'Page description goes here...', descLimitPx, 'description')
	);

	const serpUrl = $derived(formatSerpUrl(hostUrl || publicEnv.HOST_PROD || 'example.com'));
</script>

<div class="mt-0 dark:text-surface-50">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
		<div class="min-w-0">
			<h3 class="text-sm font-semibold">Search preview</h3>
			<p class="mt-0.5 text-xs text-surface-400">How this snippet may appear in Google search results.</p>
		</div>

		<div class="btn-group overflow-hidden rounded-lg border border-surface-500/30 dark:border-surface-500/40" role="group" aria-label="Preview mode">
			<Button
				variant={!SeoPreviewToggle ? 'primary' : 'ghost'}
				type="button"
				size="sm"
				onclick={() => (SeoPreviewToggle = false)}
				aria-label="Desktop view"
				aria-pressed={!SeoPreviewToggle}
				class="min-w-0 rounded-none px-2.5 py-1.5! text-xs font-medium hover:brightness-100"
			>
				<iconify-icon icon="mdi:monitor" width={18} aria-hidden="true"></iconify-icon>
				<span class="hidden sm:inline">Desktop</span>
			</Button>

			<Button
				variant={SeoPreviewToggle ? 'primary' : 'ghost'}
				type="button"
				size="sm"
				onclick={() => (SeoPreviewToggle = true)}
				aria-label="Mobile view"
				aria-pressed={SeoPreviewToggle}
				class="min-w-0 rounded-none px-2.5 py-1.5! text-xs font-medium hover:brightness-100"
			>
				<iconify-icon icon="mdi:cellphone" width={18} aria-hidden="true"></iconify-icon>
				<span class="hidden sm:inline">Mobile</span>
			</Button>

			<Button
				variant={heatmapMode ? 'primary' : 'ghost'}
				type="button"
				size="sm"
				onclick={() => (heatmapMode = !heatmapMode)}
				aria-pressed={heatmapMode}
				aria-label="Toggle snippet emphasis overlay"
				class="min-w-0 rounded-none px-2.5 py-1.5! text-xs font-medium hover:brightness-100"
			>
				<iconify-icon icon="mdi:fire" width={18} aria-hidden="true"></iconify-icon>
				<span class="hidden sm:inline">Heatmap</span>
			</Button>
		</div>
	</div>

	<div
		class="rounded-lg border border-surface-500/30 bg-white p-4 dark:border-surface-500/40 dark:bg-surface-900 {SeoPreviewToggle ? 'max-w-93.75 mx-auto' : 'w-full'}"
		data-testid="seo-search-preview"
	>
		<div class="mb-1 flex items-center gap-2 text-xs text-surface-500 dark:text-surface-50">
			<div class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-200 dark:bg-surface-700">
				<iconify-icon icon="mdi:earth" width={24} aria-hidden="true"></iconify-icon>
			</div>
			<div class="flex min-w-0 flex-col leading-none">
				<span class="font-bold text-surface-600 dark:text-surface-400">{serpUrl.site || publicEnv.HOST_PROD || 'Your Site'}</span>
				<span class="truncate text-[10px]">{serpUrl.breadcrumb}</span>
			</div>
		</div>

		<div class="mb-1">
			{#if heatmapMode}
				<h3 class="relative text-lg font-medium leading-tight text-tertiary-500 dark:text-primary-500">
					{#each heatmapDataTitle as { word, role }, i (i)}
						<span class="relative inline-block me-1">
							<span
								class="seo-heat-blob absolute inset-s-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md"
								data-role={role}
							></span>
							<span class="relative z-10">{word}</span>
						</span>
					{/each}
				</h3>
			{:else}
				<h3 class="text-lg font-medium leading-tight text-tertiary-500 dark:text-primary-500 hover:underline">{previewTitle}</h3>
			{/if}
		</div>

		<div>
			{#if heatmapMode}
				<p class="text-sm leading-normal text-surface-600 dark:text-surface-400">
					{#each heatmapDataDesc as { word, role }, i (i)}
						<span class="relative inline-block me-1">
							<span
								class="seo-heat-blob seo-heat-blob-desc absolute inset-s-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md"
								data-role={role}
							></span>
							<span class="relative z-10">{word}</span>
						</span>
					{/each}
				</p>
			{:else}
				<p class="text-sm leading-normal text-surface-600 dark:text-white">{previewDescription}</p>
			{/if}
		</div>
	</div>

	{#if heatmapMode}
		<div class="mt-3 space-y-2" transition:fade>
			<p class="text-[11px] text-surface-400">
				Highlights keywords, power words, and early words in this snippet. This is not live Google click data.
			</p>
			<div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px]">
				<div class="flex items-center gap-1.5 p-1 rounded bg-surface-500/10 dark:bg-surface-800">
					<div class="w-2 h-2 rounded-full bg-error-500"></div>
					<span>Keyword</span>
				</div>
				<div class="flex items-center gap-1.5 p-1 rounded bg-surface-500/10 dark:bg-surface-800">
					<div class="w-2 h-2 rounded-full bg-warning-500"></div>
					<span>Power word</span>
				</div>
				<div class="flex items-center gap-1.5 p-1 rounded bg-surface-500/10 dark:bg-surface-800">
					<div class="w-2 h-2 rounded-full bg-warning-400"></div>
					<span>Front of snippet</span>
				</div>
				<div class="flex items-center gap-1.5 p-1 rounded bg-surface-500/10 dark:bg-surface-800">
					<div class="w-2 h-2 rounded-full bg-success-500"></div>
					<span>Longer word</span>
				</div>
				<div class="flex items-center gap-1.5 p-1 rounded bg-surface-500/10 dark:bg-surface-800">
					<div class="w-2 h-2 rounded-full bg-tertiary-500"></div>
					<span>Other</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.seo-heat-blob {
		width: 120%;
		height: 120%;
		z-index: 0;
	}
	.seo-heat-blob-desc {
		width: 140%;
		height: 140%;
	}
	.seo-heat-blob[data-role='keyword'] {
		background-color: color-mix(in oklab, var(--color-error-500) 80%, transparent);
	}
	.seo-heat-blob[data-role='power'] {
		background-color: color-mix(in oklab, var(--color-warning-500) 80%, transparent);
	}
	.seo-heat-blob[data-role='prominent'] {
		background-color: color-mix(in oklab, var(--color-warning-500) 60%, transparent);
	}
	.seo-heat-blob[data-role='length'] {
		background-color: color-mix(in oklab, var(--color-success-500) 50%, transparent);
	}
	.seo-heat-blob[data-role='neutral'] {
		background-color: color-mix(in oklab, var(--color-tertiary-500) 30%, transparent);
	}
</style>
