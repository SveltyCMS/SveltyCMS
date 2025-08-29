<!-- 
@file src/routes/(app)/imageEditor/Zoom.svelte
@component
**Provides image zoom and resize functionality with Konva integration**

### Props 
- `stage`: Konva.Stage - The Konva stage where the image is displayed
- `layer`: Konva.Layer - The Konva layer where the image and effects are added  
- `imageNode`: Konva.Image - The Konva image node representing the original image
-->

<script lang="ts">
	import Konva from 'konva';
	import type { ZoomProps } from './zoomTypes';

	const { stage, layer, imageNode, imageGroup, onZoomApplied, onZoomCancelled } = $props<ZoomProps>();

	let scale = $state(1);
	let minScale = 0.1;
	let maxScale = 5;
	let wheelZoomSpeed = 0.02; // Much smoother wheel zoom
	let buttonZoomSpeed = 0.1; // Separate speed for button controls

	// Initialize zoom with current group scale and enable dragging
	$effect.root(() => {
		// Get initial scale from group if available
		const group = imageGroup ?? imageNode;
		scale = group.scaleX();

		setupEventListeners();
		enableDragging();

		// Cleanup function
		return () => {
			stage.off('wheel');
			stage.off('dblclick');
			disableDragging();
		};
	});

	function setupEventListeners() {
		// Wheel zoom centered on pointer position
		stage.on('wheel', (e: Konva.KonvaEventObject<WheelEvent>) => {
			e.evt.preventDefault();

			const pointer = stage.getPointerPosition();
			if (!pointer) return;

			const group = imageGroup ?? imageNode;
			const oldScale = group.scaleX();

			// Use smoother zoom calculation for wheel events
			const zoomFactor = e.evt.deltaY < 0 ? 1 + wheelZoomSpeed : 1 - wheelZoomSpeed;
			const newScale = oldScale * zoomFactor;

			// Apply zoom bounds
			const boundedScale = Math.max(minScale, Math.min(maxScale, newScale));
			if (boundedScale === oldScale) return; // No change needed

			// Calculate new position to keep zoom centered on pointer
			const mousePointTo = {
				x: (pointer.x - group.x()) / oldScale,
				y: (pointer.y - group.y()) / oldScale
			};

			const newPos = {
				x: pointer.x - mousePointTo.x * boundedScale,
				y: pointer.y - mousePointTo.y * boundedScale
			};

			// Apply zoom and position
			group.scale({ x: boundedScale, y: boundedScale });
			group.position(newPos);

			// Update reactive state
			scale = boundedScale;

			layer.batchDraw();
		});

		// Double-click to reset zoom
		stage.on('dblclick', () => {
			resetZoom();
		});
	}

	function enableDragging() {
		const group = imageGroup ?? imageNode;

		// Enable dragging on the group/image
		group.draggable(true);

		// Add visual feedback when dragging starts
		group.on('dragstart', () => {
			stage.container().style.cursor = 'grabbing';
		});

		// Reset cursor when dragging ends
		group.on('dragend', () => {
			stage.container().style.cursor = 'grab';
			layer.batchDraw();
		});

		// Set grab cursor when hovering
		group.on('mouseenter', () => {
			stage.container().style.cursor = 'grab';
		});

		group.on('mouseleave', () => {
			stage.container().style.cursor = 'default';
		});
	}

	function disableDragging() {
		const group = imageGroup ?? imageNode;

		// Disable dragging
		group.draggable(false);

		// Remove event listeners
		group.off('dragstart');
		group.off('dragend');
		group.off('mouseenter');
		group.off('mouseleave');

		// Reset cursor
		stage.container().style.cursor = 'default';
	}

	function zoom(direction: number) {
		const group = imageGroup ?? imageNode;
		const oldScale = group.scaleX();
		const newScale = oldScale + direction * buttonZoomSpeed;

		// Apply zoom bounds
		const boundedScale = Math.max(minScale, Math.min(maxScale, newScale));
		if (boundedScale === oldScale) return; // No change needed

		// Apply zoom from center
		group.scale({ x: boundedScale, y: boundedScale });
		scale = boundedScale;

		layer.batchDraw();
	}

	function resetZoom() {
		const group = imageGroup ?? imageNode;

		// Reset scale to 1 and center the group
		group.scale({ x: 1, y: 1 });

		// Center the group in the stage
		if (imageGroup) {
			imageGroup.position({
				x: stage.width() / 2,
				y: stage.height() / 2
			});
		}

		scale = 1;
		layer.batchDraw();
	}

	function setZoom(newScale: number) {
		const group = imageGroup ?? imageNode;
		const boundedScale = Math.max(minScale, Math.min(maxScale, newScale));

		group.scale({ x: boundedScale, y: boundedScale });
		scale = boundedScale;

		layer.batchDraw();
	}

	function fitToScreen() {
		if (!imageGroup) return;

		// Calculate scale to fit image in stage with padding
		const padding = 50;
		const stageWidth = stage.width() - padding * 2;
		const stageHeight = stage.height() - padding * 2;

		const imageWidth = imageNode.width();
		const imageHeight = imageNode.height();

		const scaleX = stageWidth / imageWidth;
		const scaleY = stageHeight / imageHeight;
		const fitScale = Math.min(scaleX, scaleY);

		// Apply bounded scale
		const boundedScale = Math.max(minScale, Math.min(maxScale, fitScale));

		imageGroup.scale({ x: boundedScale, y: boundedScale });
		imageGroup.position({
			x: stage.width() / 2,
			y: stage.height() / 2
		});

		scale = boundedScale;
		layer.batchDraw();
	}

	function applyZoomResize() {
		onZoomApplied?.();
	}

	function exitZoomResize() {
		disableDragging();
		resetZoom();
		onZoomCancelled?.();
	}
</script>

<!-- Zoom Controls UI -->
<div class="wrapper p-4">
	<div class="flex w-full items-center justify-between">
		<div class="flex items-center gap-2">
			<!-- Back button at top of component -->
			<button onclick={exitZoomResize} aria-label="Exit zoom mode" class="variant-outline-tertiary btn-icon">
				<iconify-icon icon="material-symbols:close-rounded" width="20"></iconify-icon>
			</button>

			<h3 class="relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Zoom Settings</h3>
		</div>

		<!-- Action Buttons -->
		<div class="mt-4 flex justify-around gap-4">
			<button onclick={resetZoom} aria-label="Reset zoom" class="variant-outline btn">Reset</button>
			<button onclick={fitToScreen} aria-label="Fit to screen" class="variant-outline btn">Fit to Screen</button>
			<button onclick={applyZoomResize} aria-label="Apply zoom" class="variant-filled-primary btn">
				<iconify-icon icon="mdi:check" width="20"></iconify-icon>
				Apply
			</button>
		</div>
	</div>

	<!-- Zoom Controls -->
	<div class="flex items-center justify-around space-x-4">
		<div class="flex flex-col items-center">
			<button onclick={() => zoom(-4)} aria-label="Zoom out" class="btn">
				<iconify-icon icon="mdi:magnify-minus-outline" width="24"></iconify-icon>
				<span class="text-xs">Zoom Out</span>
			</button>
		</div>

		<div class="flex flex-col space-y-2">
			<label for="zoom-level" class="text-sm font-medium">Zoom Level:</label>
			<span class="text-center text-tertiary-500 dark:text-primary-500">
				{Math.round(scale * 100)}%
			</span>
		</div>

		<div class="flex flex-col items-center">
			<button onclick={() => zoom(4)} aria-label="Zoom in" class="btn">
				<iconify-icon icon="mdi:magnify-plus-outline" width="24"></iconify-icon>
				<span class="text-xs">Zoom In</span>
			</button>
		</div>
	</div>

	<!-- Zoom Slider -->
	<div class="mt-4">
		<input
			id="zoom-level"
			type="range"
			min={minScale}
			max={maxScale}
			step="0.05"
			bind:value={scale}
			oninput={() => setZoom(scale)}
			class="range range-primary w-full"
			aria-label="Zoom level slider"
		/>
		<div class="flex justify-between text-xs text-tertiary-500">
			<span>{Math.round(minScale * 100)}%</span>
			<span>{Math.round(maxScale * 100)}%</span>
		</div>
	</div>

	<div class="mt-4 text-center text-sm text-tertiary-500">
		<p>Use mouse wheel to zoom at cursor position</p>
		<p>Click and drag the image to pan around</p>
		<p>Double-click to reset zoom</p>
	</div>
</div>
