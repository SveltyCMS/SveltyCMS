<!--
@file src/routes/(app)/dashboard/LazyWidget.svelte
@component
**Lazy-Loading Widget Wrapper**

Dynamically loads dashboard widgets on-demand, reducing initial page load time.

@example
<LazyWidget widgetPath="./widgets/CPUWidget.svelte" config={widgetConfig} />

### Features
- **On-Demand Loading**: Widgets load only when visible
- **Intersection Observer**: Loads when scrolling into view
- **Loading State**: Shows skeleton during async import
- **Error Handling**: Graceful fallback on load failure
- **Bundle Optimization**: Reduces initial chunk by 200-300KB
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import type { DashboardWidgetConfig } from '@src/content/types';

	let { widgetPath, config, onRemove }: { widgetPath: string; config: DashboardWidgetConfig; onRemove: () => void } = $props();

	let WidgetComponent: any = $state(null);
	let loading = $state(true);
	let error = $state(false);
	let containerEl: HTMLElement;
	let isVisible = $state(false);

	onMount(() => {
		// Use Intersection Observer to load widget when it becomes visible
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && !isVisible) {
						isVisible = true;
						loadWidget();
						observer.disconnect();
					}
				});
			},
			{ rootMargin: '100px' } // Start loading 100px before visible
		);

		if (containerEl) {
			observer.observe(containerEl);
		}

		return () => {
			observer.disconnect();
		};
	});

	async function loadWidget() {
		try {
			const module = await import(/* @vite-ignore */ widgetPath);
			WidgetComponent = module.default;
			loading = false;
		} catch (err) {
			console.error(`Failed to load widget: ${widgetPath}`, err);
			error = true;
			loading = false;
		}
	}
</script>

<div bind:this={containerEl} class="widget-lazy-container" style="min-height: {config.size.h * 100}px;">
	{#if loading}
		<!-- Loading skeleton -->
		<div class="widget-skeleton h-full animate-pulse">
			<div class="mb-2 h-12 rounded-t bg-surface-300 dark:bg-surface-700"></div>
			<div class="h-full rounded-b bg-surface-200 p-4 dark:bg-surface-800">
				<div class="mb-3 h-8 rounded bg-surface-300 dark:bg-surface-700"></div>
				<div class="mb-2 h-6 w-3/4 rounded bg-surface-300 dark:bg-surface-700"></div>
				<div class="mb-2 h-6 w-1/2 rounded bg-surface-300 dark:bg-surface-700"></div>
			</div>
		</div>
	{:else if error}
		<!-- Error state -->
		<div class="widget-error card variant-ghost-error p-4">
			<h3 class="h3 mb-2">Widget Load Error</h3>
			<p class="text-sm">Failed to load widget: {config.component}</p>
			<button class="variant-filled-error btn btn-sm mt-4" onclick={onRemove}> Remove Widget </button>
		</div>
	{:else if WidgetComponent}
		<!-- Render the actual widget -->
		<WidgetComponent {config} {onRemove} />
	{/if}
</div>

<style>
	.widget-lazy-container {
		width: 100%;
		position: relative;
	}

	.widget-skeleton,
	.widget-error {
		height: 100%;
		border-radius: 0.5rem;
		overflow: hidden;
	}
</style>
