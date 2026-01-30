<!--
@file: src/components/imageEditor/EditorCanvas.svelte
@component
**Responsive canvas wrapper for the Konva stage**
Handles canvas sizing, empty states, and provides proper container
for the image editor canvas with responsive behavior.

#### Props
- `hasImage`: Whether an image is currently loaded
- `containerRef`: Reference to bind the container element
-->

<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	// Props
	let {
		hasImage = false,
		isLoading = false,
		loadingMessage = 'Loading...',
		loadingProgress = undefined,
		showZoomControls = false,
		containerRef = $bindable(),
		containerWidth = $bindable(0),
		containerHeight = $bindable(0),
		ondrop,
		onupload,
		onzoom,
		children
	}: {
		hasImage?: boolean;
		isLoading?: boolean;
		loadingMessage?: string;
		loadingProgress?: number;
		showZoomControls?: boolean;
		containerRef?: HTMLDivElement;
		containerWidth?: number;
		containerHeight?: number;
		ondrop?: (file: File) => void;
		onupload?: () => void;
		onzoom?: (type: 'in' | 'out' | 'reset') => void;
		children?: Snippet;
	} = $props();

	let mounted = $state(false);
	let isDragging = $state(false);
	let resizeObserver: ResizeObserver;

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (!hasImage) isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const files = e.dataTransfer?.files;
		if (files && files[0]) {
			ondrop?.(files[0]);
		}
	}

	onMount(() => {
		mounted = true;

		if (containerRef) {
			resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const { width, height } = entry.contentRect;
					if (width > 0 && height > 0) {
						containerWidth = width;
						containerHeight = height;
					}
				}
			});
			resizeObserver.observe(containerRef);
		}

		return () => {
			resizeObserver?.disconnect();
		};
	});
</script>

<div
	class="editor-canvas-wrapper relative flex-1 overflow-hidden rounded-lg border border-surface-200 transition-all duration-300 ease-in-out focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 focus-within:ring-offset-surface-50 dark:focus-within:ring-offset-surface-900 md:rounded-lg md:border md:border-surface-200 max-md:rounded-none max-md:border-0 max-md:border-b max-md:border-t"
	role="region"
	aria-label="Image editor canvas"
	aria-busy={isLoading}
>
	<!-- Canvas container - ALWAYS present for Konva stage -->
	<div
		class="canvas-container h-full w-full transition-all duration-300 ease-in-out"
		class:border-2={isDragging}
		class:border-primary-500={isDragging}
		class:border-dashed={isDragging}
		class:bg-primary-50={isDragging}
		class:dark:bg-primary-900={isDragging}
		bind:this={containerRef}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		role="button"
		aria-label={hasImage ? 'Loaded image' : 'No image loaded'}
		tabindex={hasImage ? 0 : -1}
		onkeydown={() => {}}
	>
		<!-- Konva stage will be mounted here by ImageEditor -->
	</div>

	<!-- Zoom controls slot -->
	{#if hasImage && showZoomControls}
		<div class="absolute top-4 right-4 z-30 flex gap-2">
			<button class="btn btn-sm preset-filled-surface-200 shadow-md" onclick={() => onzoom?.('out')} aria-label="Zoom out">
				<iconify-icon icon="mdi:magnify-minus" width="18"></iconify-icon>
			</button>
			<button class="btn btn-sm preset-filled-surface-200 shadow-md" onclick={() => onzoom?.('reset')} aria-label="Reset zoom">
				<iconify-icon icon="mdi:magnify" width="18"></iconify-icon>
			</button>
			<button class="btn btn-sm preset-filled-surface-200 shadow-md" onclick={() => onzoom?.('in')} aria-label="Zoom in">
				<iconify-icon icon="mdi:magnify-plus" width="18"></iconify-icon>
			</button>
		</div>
	{/if}

	<!-- Visual Feedback for Container Issues -->
	{#if mounted && (containerWidth === 0 || containerHeight === 0)}
		<div class="absolute inset-0 flex items-center justify-center bg-warning-50/90 dark:bg-warning-900/90 z-30 pointer-events-none">
			<div class="text-center p-4">
				<iconify-icon icon="mdi:alert" width="32" class="text-warning-600 mb-2"></iconify-icon>
				<p class="text-sm text-warning-700 dark:text-warning-300">Canvas container has no size. Check parent layout.</p>
				<p class="text-xs text-warning-600 dark:text-warning-400 mt-1">
					Size: {containerWidth}×{containerHeight}
				</p>
			</div>
		</div>
	{/if}

	<!-- Empty state overlay - shown when no image -->
	{#if !hasImage}
		<div class="empty-state pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
			<div class="empty-state-content flex max-w-md flex-col items-center gap-6 p-8 text-center max-md:p-6">
				<div
					class="empty-icon flex h-20 w-20 items-center justify-center rounded-full bg-surface-200 ring-4 ring-surface-300 dark:bg-surface-700 dark:ring-surface-600 max-md:h-16 max-md:w-16"
				>
					<iconify-icon icon="mdi:image-plus" width="48" class="text-surface-400 dark:text-surface-500"></iconify-icon>
				</div>
				<div class="empty-text">
					<h3 class="mb-2 text-lg font-medium text-surface-700 dark:text-surface-300 max-md:text-base">No Image Selected</h3>
					<p class="text-sm text-surface-500 dark:text-surface-50 max-md:text-xs">Upload an image to start editing</p>
				</div>

				<div class="pointer-events-auto">
					<button class="btn preset-filled-primary-500 gap-2" onclick={() => onupload?.()}>
						<iconify-icon icon="mdi:upload" width="20"></iconify-icon>
						<span>Upload Image</span>
					</button>
				</div>

				<div class="empty-hints flex flex-col gap-2 mt-2">
					<div class="hint-item flex items-center justify-center gap-2">
						<iconify-icon icon="mdi:gesture-tap" width="16" class="text-surface-400"></iconify-icon>
						<span class="text-xs text-surface-500 dark:text-surface-50 max-md:text-[10px]"> Drag & drop supported </span>
					</div>
					<div class="hint-item flex items-center justify-center gap-2">
						<iconify-icon icon="mdi:file-image" width="16" class="text-surface-400"></iconify-icon>
						<span class="text-xs text-surface-500 dark:text-surface-50 max-md:text-[10px]"> PNG, JPG, WebP, GIF </span>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Slot for overlays (like crop toolbar) -->
	{@render children?.()}

	<!-- Loading overlay -->
	{#if (hasImage && !mounted) || isLoading}
		<div
			class="loading-overlay absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-50/80 backdrop-blur-sm dark:bg-surface-900/80 z-20"
			transition:fade={{ duration: 200 }}
		>
			<div class="loading-spinner flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg dark:bg-surface-800">
				<iconify-icon icon="mdi:loading" width="32" class="animate-spin text-primary-500"></iconify-icon>
			</div>
			<span class="text-sm text-surface-600 dark:text-surface-300">{loadingMessage}</span>

			<!-- Add progress bar if available -->
			{#if loadingProgress !== undefined}
				<div class="w-64 h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden mt-2">
					<div class="h-full bg-primary-500 transition-all duration-300" style="width: {loadingProgress}%"></div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.editor-canvas-wrapper {
		background-color: rgb(var(--color-surface-50) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
		min-height: 400px;
	}

	:global(.dark) .editor-canvas-wrapper {
		background-color: rgb(var(--color-surface-900) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.canvas-container {
		background-color: rgb(var(--color-surface-100) / 1);
		background-image: repeating-conic-gradient(rgba(0, 0, 0, 0.05) 0% 25%, transparent 0% 50%) 50% / 20px 20px;
	}

	:global(.dark) .canvas-container {
		background-color: rgb(var(--color-surface-800) / 1);
		background-image: repeating-conic-gradient(rgba(255, 255, 255, 0.03) 0% 25%, transparent 0% 50%) 50% / 20px 20px;
	}

	.empty-state {
		background: linear-gradient(to bottom right, rgb(var(--color-surface-50) / 0.95), rgb(var(--color-surface-100) / 0.95));
	}

	:global(.dark) .empty-state {
		background: linear-gradient(to bottom right, rgb(var(--color-surface-900) / 1), rgb(var(--color-surface-800) / 1));
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.editor-canvas-wrapper {
			min-height: 50vh;
		}
	}
</style>
