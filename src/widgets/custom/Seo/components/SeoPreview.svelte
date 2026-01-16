<!--
@file src/widgets/custom/Seo/components/SeoPreview.svelte
@component
**SEO Preview widget for SEO Widget**

@example
<SeoPreview bind:title={title} bind:description={description} bind:hostUrl={hostUrl} bind:SeoPreviewToggle={SeoPreviewToggle} />

#### Props
- `title` {string} - Title text
- `description` {string} - Description text
- `hostUrl` {string} - Host URL
- `SeoPreviewToggle` {boolean} - Preview toggle

#### Features
- Translatable
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { fade } from 'svelte/transition';

	// Logic for Heatmap
	const POWER_WORDS = new Set(
		m.widget_seo_powerwords
			? m
					.widget_seo_powerwords()
					.split(',')
					.map((w) => w.trim().toLowerCase())
			: []
	);

	function getHeatColor(word: string, index: number): string {
		const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
		if (!lower) return 'transparent';

		// 1. Keyword match (Highest - Red)
		if (keywords && keywords.some((k) => lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower))) {
			return 'rgba(239, 68, 68, 0.8)';
		}

		// 2. Power Word match (Yellow - Gold)
		if (POWER_WORDS.has(lower)) {
			return 'rgba(234, 179, 8, 0.8)';
		}

		// 3. Position (Start of sentence is hot/Prominent - Orange)
		if (index < 3) {
			return 'rgba(249, 115, 22, 0.6)';
		}

		// 4. Length / Interest (Green)
		if (lower.length > 4) {
			return 'rgba(34, 197, 94, 0.5)';
		}

		// 5. Neutral (Blue)
		return 'rgba(59, 130, 246, 0.3)';
	}

	function renderHeatmap(text: string) {
		return text.split(' ').map((word, i) => {
			const color = getHeatColor(word, i);
			return { word, color };
		});
	}

	interface Props {
		title: string;
		description: string;
		hostUrl: string;
		keywords?: string[];
		SeoPreviewToggle: boolean;
		ontogglePreview?: () => void;
	}

	const { title, description, hostUrl, keywords = [], SeoPreviewToggle, ontogglePreview = () => {} }: Props = $props();

	let heatmapMode = $state(false);

	function handleTogglePreview() {
		ontogglePreview();
	}
</script>

<div class="mt-4 border-t border-surface-500 pt-4 dark:border-surface-700">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-4">
		<h3 class="h3">SEO Preview</h3>

		<div class="flex items-center gap-2">
			<!-- Device Toggle -->
			<div class="preset-filled-surface-500  [&>*+*]:border-surface-500">
				<button
					type="button"
					onclick={() => !SeoPreviewToggle && handleTogglePreview()}
					class="{!SeoPreviewToggle ? 'preset-filled-primary-500' : ''} btn btn-sm"
					title="Desktop View"
				>
					<iconify-icon icon="mdi:monitor" width="18"></iconify-icon>
				</button>
				<button
					type="button"
					onclick={() => SeoPreviewToggle && handleTogglePreview()}
					class="{SeoPreviewToggle ? 'preset-filled-primary-500' : ''} btn btn-sm"
					title="Mobile View"
				>
					<iconify-icon icon="mdi:cellphone" width="18"></iconify-icon>
				</button>
			</div>

			<!-- Heatmap Toggle -->
			<button
				type="button"
				class="btn btn-sm {heatmapMode ? 'preset-filled-warning-500' : 'preset-filled-surface-500'}"
				onclick={() => (heatmapMode = !heatmapMode)}
				title="Toggle Heatmap Visualization"
			>
				<iconify-icon icon="mdi:fire" width="18" class="mr-1"></iconify-icon>
				Heatmap
			</button>
		</div>
	</div>

	<!-- Preview Card -->
	<div class="card preset-glass-surface p-4 transition-all duration-200 {SeoPreviewToggle ? 'max-w-[375px] mx-auto' : 'w-full'}">
		<!-- URL Line -->
		<div class="mb-1 flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
			<div class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-200 dark:bg-surface-700">
				<iconify-icon icon="mdi:earth" width="14" class="text-surface-700 dark:text-surface-300"></iconify-icon>
			</div>
			<div class="flex flex-col leading-none">
				<span class="font-bold text-surface-700 dark:text-surface-300">{publicEnv.HOST_PROD || 'Your Site'}</span>
				<span class="truncate text-[10px]">{hostUrl}</span>
			</div>
			<iconify-icon icon="mdi:dots-vertical" class="ml-auto"></iconify-icon>
		</div>

		<!-- Title -->
		<div class="mb-1">
			{#if heatmapMode}
				<h3 class="relative text-lg font-medium leading-tight text-tertiary-500 dark:text-primary-500">
					{#each renderHeatmap(title || 'Page Title') as { word, color }}
						<span class="relative inline-block mr-1">
							<span
								class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md"
								style="background-color: {color}; width: 120%; height: 120%; z-index: 0;"
							></span>
							<span class="relative z-10">{word}</span>
						</span>
					{/each}
				</h3>
			{:else}
				<h3 class="text-lg font-medium leading-tight text-primary-500 hover:underline dark:text-primary-400">
					{title || 'Page Title'}
				</h3>
			{/if}
		</div>

		<!-- Description -->
		<div>
			{#if heatmapMode}
				<p class="text-sm leading-normal text-surface-600 dark:text-surface-300">
					{#each renderHeatmap(description || 'Page description goes here...') as { word, color }}
						<span class="relative inline-block mr-1">
							<span
								class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md"
								style="background-color: {color}; width: 140%; height: 140%; z-index: 0;"
							></span>
							<span class="relative z-10">{word}</span>
						</span>
					{/each}
				</p>
			{:else}
				<p class="text-sm leading-normal text-surface-600 dark:text-surface-300">
					{description || 'Page description goes here...'}
				</p>
			{/if}
		</div>
	</div>

	{#if heatmapMode}
		<div class="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px]" transition:fade>
			<div class="flex items-center gap-1.5 p-1 rounded bg-surface-100 dark:bg-surface-800">
				<div class="w-2 h-2 rounded-full bg-error-500"></div>
				<span>Keyword</span>
			</div>
			<div class="flex items-center gap-1.5 p-1 rounded bg-surface-100 dark:bg-surface-800">
				<div class="w-2 h-2 rounded-full bg-yellow-500"></div>
				<span>Power Word</span>
			</div>
			<div class="flex items-center gap-1.5 p-1 rounded bg-surface-100 dark:bg-surface-800">
				<div class="w-2 h-2 rounded-full bg-orange-400"></div>
				<span>Prominent</span>
			</div>
			<div class="flex items-center gap-1.5 p-1 rounded bg-surface-100 dark:bg-surface-800">
				<div class="w-2 h-2 rounded-full bg-primary-500"></div>
				<span>Good Length</span>
			</div>
			<div class="flex items-center gap-1.5 p-1 rounded bg-surface-100 dark:bg-surface-800">
				<div class="w-2 h-2 rounded-full bg-tertiary-500"></div>
				<span>Neutral</span>
			</div>
		</div>
	{/if}
</div>
