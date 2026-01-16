<!--
@file: /src/routes/(app)/imageEditor/EditorCanvas.svelte
@component
**Responsive canvas wrapper for the Konva stage**
Handles canvas sizing, empty states, and provides proper container
for the image editor canvas with responsive behavior.

#### Props
- `hasImage`: Whether an image is currently loaded
- `containerRef`: Reference to bind the container element
-->

<script lang="ts">
	import type { Snippet } from 'svelte';

	// Props
	let {
		hasImage = false,
		containerRef = $bindable(),
		children
	}: {
		hasImage?: boolean;
		containerRef?: HTMLDivElement;
		children?: Snippet;
	} = $props();

	let mounted = $derived(false);

	$effect(() => {
		mounted = true;
	});
</script>

<div
	class="editor-canvas-wrapper relative flex-1 overflow-hidden rounded-lg border border-surface-200 transition-all duration-300 ease-in-out focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 focus-within:ring-offset-preset-50 dark:focus-within:ring-offset-preset-900 md:rounded-lg md:border md:border-surface-200 max-md:rounded-none max-md:border-0 max-md:border-b max-md:border-t"
>
	<!-- Canvas container - ALWAYS present for Konva stage -->
	<div class="canvas-container h-full w-full transition-all duration-300 ease-in-out" bind:this={containerRef}>
		<!-- Konva stage will be mounted here by ImageEditor -->
	</div>

	<!-- Empty state overlay - shown when no image -->
	{#if !hasImage}
		<div class="empty-state pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
			<div class="empty-state-content flex max-w-md flex-col items-center gap-6 p-8 text-center max-md:p-6">
				<div
					class="empty-icon flex h-20 w-20 items-center justify-center rounded-full bg-surface-200 ring-4 ring-preset-300 dark:bg-surface-700 dark:ring-preset-600 max-md:h-16 max-md:w-16"
				>
					<iconify-icon icon="mdi:image-plus" width="48" class="text-surface-400 dark:text-surface-500"></iconify-icon>
				</div>
				<div class="empty-text">
					<h3 class="mb-2 text-lg font-medium text-surface-700 dark:text-surface-300 max-md:text-base">No Image Selected</h3>
					<p class="text-sm text-surface-500 dark:text-surface-400 max-md:text-xs">Upload an image to start editing</p>
				</div>
				<div class="empty-hints flex flex-col gap-2">
					<div class="hint-item flex items-center justify-center gap-2">
						<iconify-icon icon="mdi:gesture-tap" width="16" class="text-surface-400"></iconify-icon>
						<span class="text-xs text-surface-500 dark:text-surface-400 max-md:text-[10px]"> Drag & drop supported </span>
					</div>
					<div class="hint-item flex items-center justify-center gap-2">
						<iconify-icon icon="mdi:file-image" width="16" class="text-surface-400"></iconify-icon>
						<span class="text-xs text-surface-500 dark:text-surface-400 max-md:text-[10px]"> PNG, JPG, WebP, GIF </span>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Slot for overlays (like crop toolbar) -->
	{@render children?.()}

	<!-- Loading overlay -->
	{#if hasImage && !mounted}
		<div
			class="loading-overlay absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-50/80 backdrop-blur-sm dark:bg-surface-900/80"
		>
			<div class="loading-spinner flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg dark:bg-surface-800">
				<iconify-icon icon="mdi:loading" width="32" class="animate-spin text-primary-500"></iconify-icon>
			</div>
			<span class="text-sm text-surface-600 dark:text-surface-300">Loading image...</span>
		</div>
	{/if}
</div>

<style>
	.editor-canvas-wrapper {
		background-color: rgb(var(--color-preset-50) / 1);
		border-color: rgb(var(--color-preset-200) / 1);
		min-height: 400px;
	}

	:global(.dark) .editor-canvas-wrapper {
		background-color: rgb(var(--color-preset-900) / 1);
		border-color: rgb(var(--color-preset-700) / 1);
	}

	.canvas-container {
		background-color: rgb(var(--color-preset-100) / 1);
		/* Checkered pattern for transparency visualization */
		background-image:
			linear-gradient(45deg, rgba(0, 0, 0, 0.05) 25%, transparent 25%), linear-gradient(-45deg, rgba(0, 0, 0, 0.05) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, rgba(0, 0, 0, 0.05) 75%), linear-gradient(-45deg, transparent 75%, rgba(0, 0, 0, 0.05) 75%);
		background-size: 20px 20px;
		background-position:
			0 0,
			0 10px,
			10px -10px,
			-10px 0px;
	}

	:global(.dark) .canvas-container {
		background-color: rgb(var(--color-preset-800) / 1);
		background-image:
			linear-gradient(45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%), linear-gradient(-45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%), linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%);
	}

	.empty-state {
		background: linear-gradient(to bottom right, rgb(var(--color-preset-50) / 0.95), rgb(var(--color-preset-100) / 0.95));
	}

	:global(.dark) .empty-state {
		background: linear-gradient(to bottom right, rgb(var(--color-preset-900) / 1), rgb(var(--color-preset-800) / 1));
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.editor-canvas-wrapper {
			min-height: 50vh;
		}
	}
</style>
