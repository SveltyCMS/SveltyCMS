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

	let mounted = $state(false);

	$effect(() => {
		mounted = true;
	});
</script>

<div class="editor-canvas-wrapper">
	<!-- Canvas container - ALWAYS present for Konva stage -->
	<div class="canvas-container" bind:this={containerRef}>
		<!-- Konva stage will be mounted here by ImageEditor -->
	</div>

	<!-- Empty state overlay - shown when no image -->
	{#if !hasImage}
		<div class="empty-state">
			<div class="empty-state-content">
				<div class="empty-icon">
					<iconify-icon icon="mdi:image-plus" width="48" class="text-surface-400 dark:text-surface-500"></iconify-icon>
				</div>
				<div class="empty-text">
					<h3 class="text-lg font-medium text-surface-700 dark:text-surface-300">No Image Selected</h3>
					<p class="text-sm text-surface-500 dark:text-surface-400">Upload an image to start editing</p>
				</div>
				<div class="empty-hints">
					<div class="hint-item">
						<iconify-icon icon="mdi:gesture-tap" width="16" class="text-surface-400"></iconify-icon>
						<span class="text-xs text-surface-500 dark:text-surface-400"> Drag & drop supported </span>
					</div>
					<div class="hint-item">
						<iconify-icon icon="mdi:file-image" width="16" class="text-surface-400"></iconify-icon>
						<span class="text-xs text-surface-500 dark:text-surface-400"> PNG, JPG, WebP, GIF </span>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Slot for overlays (like crop toolbar) -->
	{@render children?.()}

	<!-- Loading overlay -->
	{#if hasImage && !mounted}
		<div class="loading-overlay">
			<div class="loading-spinner">
				<iconify-icon icon="mdi:loading" width="32" class="animate-spin text-primary-500"></iconify-icon>
			</div>
			<span class="text-sm text-surface-600 dark:text-surface-300">Loading image...</span>
		</div>
	{/if}
</div>

<style>
	.editor-canvas-wrapper {
		position: relative;
		flex: 1 1 0%;
		border-width: 1px;
		overflow: hidden;
		border-radius: 0.5rem;
		background-color: rgb(var(--color-surface-50) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
		min-height: 400px;
	}

	:global(.dark) .editor-canvas-wrapper {
		background-color: rgb(var(--color-surface-900) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.canvas-container {
		height: 100%;
		width: 100%;
		background-color: rgb(var(--color-surface-100) / 1);
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
		background-color: rgb(var(--color-surface-800) / 1);
		background-image:
			linear-gradient(45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%), linear-gradient(-45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%), linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%);
	}

	.empty-state {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		background: linear-gradient(to bottom right, rgb(var(--color-surface-50) / 0.95), rgb(var(--color-surface-100) / 0.95));
	}

	:global(.dark) .empty-state {
		background: linear-gradient(to bottom right, rgb(var(--color-surface-900) / 1), rgb(var(--color-surface-800) / 1));
	}

	.empty-state-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		/* @apply max-w-md; */
	}

	.empty-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		/* @apply ring-4 ring-surface-300 dark:ring-surface-600; */
	}

	.empty-text h3 {
		/* @apply mb-2; */
	}

	.empty-hints {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.hint-item {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.loading-overlay {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		/* @apply bg-surface-50/80 backdrop-blur-sm dark:bg-surface-900/80; */
	}

	.loading-spinner {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background-color: rgb(255 255 255);
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.editor-canvas-wrapper {
			border-bottom-width: 1px;
			border-top-width: 1px;
			min-height: 50vh;
		}

		.empty-state-content {
			/* @apply p-6; */
		}

		.empty-icon {
			/* @apply h-16 w-16; */
		}

		.empty-text h3 {
			font-size: 1rem; line-height: 1.5rem;
		}

		.empty-text p {
			font-size: 0.75rem; line-height: 1rem;
		}

		.hint-item span {
			/* @apply text-[10px]; */
		}
	}

	/* Tablet adjustments */
	@media (min-width: 769px) and (max-width: 1023px) {
		.empty-state-content {
			/* @apply p-6; */
		}
	}

	/* Animation for state transitions */
	.empty-state,
	.canvas-container {
		/* @apply transition-all duration-300 ease-in-out; */
	}

	/* Focus indicators for accessibility */
	.editor-canvas-wrapper:focus-within {
		/* @apply ring-2 ring-primary-500 ring-offset-2 ring-offset-surface-50 dark:ring-offset-surface-900; */
	}
</style>
