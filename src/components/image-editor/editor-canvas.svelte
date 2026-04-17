<!--
@file: src/components/image-editor/editor-canvas.svelte
@component
**Responsive canvas wrapper using svelte-canvas**
Handles canvas sizing, empty states, and provides proper container
for the image editor canvas with reactive rendering.

#### Props
- `hasImage`: Whether an image is currently loaded
- `containerRef`: Reference to bind the container element
-->

<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Canvas, Layer } from 'svelte-canvas';

	interface BlurRegion {
		id: string;
		x: number;
		y: number;
		width: number;
		height: number;
		rotation: number;
		flipped: boolean;
		strength: number;
	}

	// Props
	let {
		hasImage = false,
		isLoading = false,
		loadingMessage = 'Loading...',
		loadingProgress = undefined,
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
		if (!hasImage) {
			isDragging = true;
		}
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
		if (!hasImage) {
			return;
		}

		if (activeTool?.handleMouseDown) {
			activeTool.handleMouseDown(e, containerWidth, containerHeight);
		} else {
			isPanning = true;
			lastPos = { x: e.clientX, y: e.clientY };
		}
	}

	function getRegionOffsets(imageElement: HTMLImageElement, crop: { x: number; y: number; width: number; height: number } | null) {
		if (crop) {
			return {
				offsetX: -crop.x - crop.width / 2,
				offsetY: -crop.y - crop.height / 2
			};
		}

		return {
			offsetX: -imageElement.width / 2,
			offsetY: -imageElement.height / 2
		};
	}

	function handleMouseMove(e: MouseEvent) {
		if (!hasImage) {
			return;
		}

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
		if (!hasImage) {
			return;
		}
		e.preventDefault();
		const zoomSpeed = 0.001;
		const delta = -e.deltaY;
		const newZoom = storeState.zoom * (1 + delta * zoomSpeed);
		storeState.zoom = Math.max(0.1, Math.min(5, newZoom));
	}

	// Helper: Build CSS filter string from all filter values
	function buildFilterString(filters: Record<string, number>): string {
		const parts: string[] = [];

		// Basic filters
		if (filters.brightness !== undefined && filters.brightness !== 0) {
			parts.push(`brightness(${100 + filters.brightness}%)`);
		}
		if (filters.contrast !== undefined && filters.contrast !== 0) {
			parts.push(`contrast(${100 + filters.contrast}%)`);
		}
		if (filters.saturation !== undefined && filters.saturation !== 0) {
			parts.push(`saturate(${100 + filters.saturation}%)`);
		}

		// Detail adjustments: approximate clarity/sharpness with contrast/brightness/saturation.
		if (filters.clarity !== undefined && filters.clarity !== 0) {
			const clarity = filters.clarity;
			if (clarity > 0) {
				parts.push(`contrast(${100 + clarity * 0.42}%)`);
				parts.push(`saturate(${100 + clarity * 0.18}%)`);
				parts.push(`brightness(${100 - clarity * 0.05}%)`);
			} else {
				const softness = Math.abs(clarity);
				parts.push(`contrast(${100 - softness * 0.26}%)`);
				parts.push(`brightness(${100 + softness * 0.1}%)`);
				parts.push(`saturate(${100 - softness * 0.08}%)`);
			}
		}

		// Tone adjustments are approximated with brightness/contrast because
		// the CSS filter pipeline does not offer a native highlights/shadows filter.
		if (filters.highlights !== undefined && filters.highlights !== 0) {
			const highlights = filters.highlights;
			if (highlights > 0) {
				parts.push(`brightness(${100 + highlights * 0.25}%)`);
				parts.push(`contrast(${100 - highlights * 0.08}%)`);
			} else {
				const lift = Math.abs(highlights);
				parts.push(`contrast(${100 + lift * 0.12}%)`);
				parts.push(`brightness(${100 - lift * 0.08}%)`);
			}
		}
		if (filters.shadows !== undefined && filters.shadows !== 0) {
			const shadows = filters.shadows;
			if (shadows > 0) {
				parts.push(`brightness(${100 + shadows * 0.2}%)`);
				parts.push(`contrast(${100 - shadows * 0.05}%)`);
			} else {
				const depth = Math.abs(shadows);
				parts.push(`brightness(${100 - depth * 0.18}%)`);
				parts.push(`contrast(${100 + depth * 0.1}%)`);
			}
		}

		// Color temperature (warm/cool)
		if (filters.temperature !== undefined && filters.temperature !== 0) {
			// Approximate temperature with sepia + hue-rotate
			const temp = filters.temperature;
			if (temp > 0) {
				parts.push(`sepia(${temp * 0.3}%)`);
				parts.push(`hue-rotate(${-temp * 0.2}deg)`);
			} else {
				parts.push(`hue-rotate(${Math.abs(temp) * 0.3}deg)`);
			}
		}

		// Tint (green/magenta)
		if (filters.tint !== undefined && filters.tint !== 0) {
			parts.push(`hue-rotate(${filters.tint * 1.5}deg)`);
		}

		// Exposure (similar to brightness but different curve)
		if (filters.exposure !== undefined && filters.exposure !== 0) {
			parts.push(`brightness(${100 + filters.exposure * 1.2}%)`);
		}

		// Vibrance (smart saturation boost for less saturated colors)
		if (filters.vibrance !== undefined && filters.vibrance !== 0) {
			parts.push(`saturate(${100 + filters.vibrance * 0.7}%)`);
		}

		return parts.join(' ');
	}

	function applySharpness(canvasContext: CanvasRenderingContext2D, width: number, height: number, filters: Record<string, number>) {
		const sharpness = filters.sharpness ?? 0;
		const clarity = filters.clarity ?? 0;
		const strength = sharpness / 72 + clarity / 92;
		if (strength === 0) {
			return;
		}

		const imageData = canvasContext.getImageData(0, 0, width, height);
		const { data } = imageData;
		const output = new Uint8ClampedArray(data.length);
		const clamp = (value: number) => Math.max(0, Math.min(255, value));

		if (strength < 0) {
			const amount = Math.min(1, Math.abs(strength));
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const index = (y * width + x) * 4;
					let red = 0;
					let green = 0;
					let blue = 0;
					let samples = 0;

					for (let ky = -1; ky <= 1; ky++) {
						const py = Math.max(0, Math.min(height - 1, y + ky));
						for (let kx = -1; kx <= 1; kx++) {
							const px = Math.max(0, Math.min(width - 1, x + kx));
							const sourceIndex = (py * width + px) * 4;
							red += data[sourceIndex];
							green += data[sourceIndex + 1];
							blue += data[sourceIndex + 2];
							samples++;
						}
					}

					const blurredRed = red / samples;
					const blurredGreen = green / samples;
					const blurredBlue = blue / samples;

					output[index] = clamp(data[index] * (1 - amount) + blurredRed * amount);
					output[index + 1] = clamp(data[index + 1] * (1 - amount) + blurredGreen * amount);
					output[index + 2] = clamp(data[index + 2] * (1 - amount) + blurredBlue * amount);
					output[index + 3] = data[index + 3];
				}
			}
			imageData.data.set(output);
			canvasContext.putImageData(imageData, 0, 0);
			return;
		}

		const amount = Math.min(1, strength);
		const sideWeight = -amount * 0.6;
		const centerWeight = 1 + amount * 4.8;
		const totalWeight = centerWeight + sideWeight * 4;
		const normalize = totalWeight !== 0 ? totalWeight : 1;

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const index = (y * width + x) * 4;
				let red = 0;
				let green = 0;
				let blue = 0;
				let alpha = data[index + 3];

				for (let ky = -1; ky <= 1; ky++) {
					const py = Math.max(0, Math.min(height - 1, y + ky));
					for (let kx = -1; kx <= 1; kx++) {
						const px = Math.max(0, Math.min(width - 1, x + kx));
						const sourceIndex = (py * width + px) * 4;
						const weight = kx === 0 && ky === 0 ? centerWeight : kx === 0 || ky === 0 ? sideWeight : 0;
						red += data[sourceIndex] * weight;
						green += data[sourceIndex + 1] * weight;
						blue += data[sourceIndex + 2] * weight;
					}
				}

				output[index] = clamp(red / normalize);
				output[index + 1] = clamp(green / normalize);
				output[index + 2] = clamp(blue / normalize);
				output[index + 3] = alpha;
			}
		}

		imageData.data.set(output);
		canvasContext.putImageData(imageData, 0, 0);
	}

	function drawSourceImage(
		context: CanvasRenderingContext2D,
		imageElement: HTMLImageElement,
		crop: { x: number; y: number; width: number; height: number } | null
	) {
		if (crop) {
			context.drawImage(
				imageElement,
				crop.x,
				crop.y,
				crop.width,
				crop.height,
				-crop.width / 2,
				-crop.height / 2,
				crop.width,
				crop.height
			);
			return;
		}

		context.drawImage(imageElement, -imageElement.width / 2, -imageElement.height / 2, imageElement.width, imageElement.height);
	}

	function drawBlurRegions(
		context: CanvasRenderingContext2D,
		imageElement: HTMLImageElement,
		blurRegions: BlurRegion[],
		crop: { x: number; y: number; width: number; height: number } | null
	) {
		if (!blurRegions.length) {
			return;
		}

		for (const region of blurRegions) {
			const blurRadius = Math.max(1, region.strength / 12);
			const { offsetX, offsetY } = getRegionOffsets(imageElement, crop);
			const rx = region.x + offsetX;
			const ry = region.y + offsetY;

			context.save();

			if (region.rotation !== 0) {
				const cx = rx + region.width / 2;
				const cy = ry + region.height / 2;
				context.translate(cx, cy);
				context.rotate((region.rotation * Math.PI) / 180);
				if (region.flipped) {
					context.scale(-1, 1);
				}
				context.translate(-cx, -cy);
			}

			context.beginPath();
			context.rect(rx, ry, region.width, region.height);
			context.clip();

			context.fillStyle = 'rgba(59, 130, 246, 0.12)';
			context.fillRect(rx, ry, region.width, region.height);
			context.filter = `blur(${blurRadius}px)`;
			drawSourceImage(context, imageElement, crop);
			context.filter = 'none';

			context.restore();
		}
	}

	// Main image render function
	const renderImage = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		const { imageElement, zoom, rotation, flipH, flipV, translateX, translateY, crop, filters, blurRegions, compareMode } = storeState;

		if (!imageElement) {
			return;
		}

		context.save();

		// Move to center of canvas
		context.translate(width / 2 + translateX, height / 2 + translateY);

		// Apply transforms
		context.scale(flipH ? -zoom : zoom, flipV ? -zoom : zoom);
		context.rotate((rotation * Math.PI) / 180);

		const activeFilters = compareMode ? { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0, clarity: 0, vibrance: 0, sharpness: 0 } : filters;

		// Apply all filters
		const filterString = buildFilterString(activeFilters);
		if (filterString) {
			context.filter = filterString;
		}

		// Draw image
		drawSourceImage(context, imageElement, crop);

		if (compareMode) {
			context.restore();
			return;
		}

		applySharpness(context, width, height, activeFilters);
		drawBlurRegions(context, imageElement, Array.isArray(blurRegions) ? blurRegions : [], crop);

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
		class="canvas-container block h-full w-full border-0 p-0 text-left cursor-grab active:cursor-grabbing focus:outline-none select-none touch-none"
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
			min-height: 40vh;
		}
	}
</style>
