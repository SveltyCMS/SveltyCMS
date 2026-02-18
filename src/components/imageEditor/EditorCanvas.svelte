<!--
@file: src/components/imageEditor/EditorCanvas.svelte
@component
**Responsive canvas wrapper using svelte-canvas**
Handles canvas sizing, empty states, and provides proper container
for the image editor canvas with reactive rendering.

#### Props
- `hasImage`: Whether an image is currently loaded
- `containerRef`: Reference to bind the container element
-->

<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Canvas, Layer } from 'svelte-canvas';

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
		activeTool = null,
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
		activeTool?: any;
		ondrop?: (file: File) => void;
		onupload?: () => void;
		onzoom?: (type: 'in' | 'out' | 'reset') => void;
		children?: Snippet;
	} = $props();

	let mounted = $state(false);
	let isDragging = $state(false);
	let isPanning = $state(false);
	let lastPos = { x: 0, y: 0 };
	let resizeObserver: ResizeObserver;

	const storeState = imageEditorStore.state;

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (!hasImage) { isDragging = true; }
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const files = e.dataTransfer?.files;
		if (files?.[0]) {
			ondrop?.(files[0]);
		}
	}

	// Interactive Panning & Tool Delegation
	function handleMouseDown(e: MouseEvent) {
		if (!hasImage) { return; }

		if (activeTool?.handleMouseDown) {
			activeTool.handleMouseDown(e, containerWidth, containerHeight);
		} else {
			isPanning = true;
			lastPos = { x: e.clientX, y: e.clientY };
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (!hasImage) { return; }

		if (activeTool?.handleMouseMove) {
			activeTool.handleMouseMove(e, containerWidth, containerHeight);
		} else if (isPanning) {
			const dx = e.clientX - lastPos.x;
			const dy = e.clientY - lastPos.y;
			storeState.translateX += dx;
			storeState.translateY += dy;
			lastPos = { x: e.clientX, y: e.clientY };
		}
	}

	function handleMouseUp(e: MouseEvent) {
		if (activeTool?.handleMouseUp) {
			activeTool.handleMouseUp(e, containerWidth, containerHeight);
		}
		isPanning = false;
	}

	function handleWheel(e: WheelEvent) {
		if (!hasImage) { return; }
		e.preventDefault();
		const zoomSpeed = 0.001;
		const delta = -e.deltaY;
		const newZoom = storeState.zoom * (1 + delta * zoomSpeed);
		storeState.zoom = Math.max(0.1, Math.min(5, newZoom));
	}

	// Main image render function
	const renderImage = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		const { imageElement, zoom, rotation, flipH, flipV, translateX, translateY, crop, filters } = storeState;

		if (!imageElement) { return; }

		context.save();

		// Move to center of canvas
		context.translate(width / 2 + translateX, height / 2 + translateY);

		// Apply transforms
		context.scale(flipH ? -zoom : zoom, flipV ? -zoom : zoom);
		context.rotate((rotation * Math.PI) / 180);

		// Apply filters
		let filterString = '';
		if (filters.brightness !== 0) { filterString += `brightness(${100 + filters.brightness}%) `; }
		if (filters.contrast !== 0) { filterString += `contrast(${100 + filters.contrast}%) `; }
		if (filters.saturation !== 0) { filterString += `saturate(${100 + filters.saturation}%) `; }
		if (filterString) { context.filter = filterString.trim(); }

		// Draw image
		if (crop) {
			context.drawImage(imageElement, crop.x, crop.y, crop.width, crop.height, -crop.width / 2, -crop.height / 2, crop.width, crop.height);
		} else {
			context.drawImage(imageElement, -imageElement.width / 2, -imageElement.height / 2, imageElement.width, imageElement.height);
		}

		context.restore();
	};

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
	aria-label="Image editor canvas - pan with mouse, zoom with wheel"
	aria-busy={isLoading}
	bind:this={containerRef}
>
	<!-- svelte-canvas component -->
	<button
		class="canvas-container block h-full w-full border-0 p-0 text-left cursor-grab active:cursor-grabbing focus:outline-none"
		class:border-2={isDragging}
		class:border-primary-500={isDragging}
		class:border-dashed={isDragging}
		class:bg-primary-50={isDragging}
		class:dark:bg-primary-900={isDragging}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseleave={handleMouseUp}
		onwheel={handleWheel}
		onkeydown={(e) => {
			// Basic keyboard support for pan/zoom
			if (e.key === '+' || e.key === '=') {
				imageEditorStore.state.zoom = imageEditorStore.state.zoom * 1.1;
			} else if (e.key === '-' || e.key === '_') {
				imageEditorStore.state.zoom = imageEditorStore.state.zoom / 1.1;
			}
		}}
		aria-label="Interactive image canvas. Use mouse to pan, wheel to zoom, and +/- keys to zoom."
	>
		{#if containerWidth > 0 && containerHeight > 0}
			<Canvas width={containerWidth} height={containerHeight}>
				<Layer render={renderImage} />
				<!-- Additional layers for widgets can be added here or via children snippet -->
				{@render children?.()}
			</Canvas>
		{/if}
	</button>

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
				<p class="text-xs text-warning-600 dark:text-warning-400 mt-1">Size: {containerWidth}×{containerHeight}</p>
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
		min-height: 400px;
		background-color: rgb(var(--color-surface-50) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
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
