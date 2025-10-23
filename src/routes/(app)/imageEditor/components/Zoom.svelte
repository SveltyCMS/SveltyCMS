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

	const { stage, layer, imageNode, onZoomApplied, onZoomCancelled } = $props<ZoomProps>();

	let scale = $state(1);
	let width = $state(imageNode.width());
	let height = $state(imageNode.height());
	let minScale = 0.1;
	let maxScale = 5;
	let maintainAspectRatio = $state(true);
	let zoomSpeed = 0.1;

	// Initialize stage event listeners
	$effect.root(() => {
		centerImage();

		stage.on('wheel', (e: Konva.KonvaEventObject<WheelEvent>) => {
			e.evt.preventDefault();
			e.evt.preventDefault();
			zoom(e.evt.deltaY > 0 ? -zoomSpeed : zoomSpeed);
		});

		stage.on('dblclick', () => {
			resetZoom();
		});

		stage.draggable(true);

		// Cleanup function
		return () => {
			stage.off('wheel');
			stage.off('dblclick');
			stage.draggable(false);
		};
	});

	function zoom(delta: number) {
		const oldScale = scale;
		scale += delta;
		scale = Math.max(minScale, Math.min(maxScale, scale));

		const stageCenter = {
			x: stage.width() / 2,
			y: stage.height() / 2
		};

		const newPos = {
			x: stageCenter.x - (stageCenter.x - stage.x()) * (scale / oldScale),
			y: stageCenter.y - (stageCenter.y - stage.y()) * (scale / oldScale)
		};

		stage.scale({ x: scale, y: scale });
		stage.position(newPos);
		stage.batchDraw();
		// No longer dispatching events, using callback props instead
	}

	function resize() {
		imageNode.width(width);
		imageNode.height(height);
		stage.scale({ x: scale, y: scale }); // Maintain zoom level
		layer.draw();
	}

	function resetZoom() {
		scale = 1;
		stage.scale({ x: 1, y: 1 });
		centerImage();
		stage.batchDraw();
		// No longer dispatching events, using callback props instead
	}

	function centerImage() {
		const stageSize = {
			width: stage.width(),
			height: stage.height()
		};

		const imageSize = {
			width: imageNode.width() * scale,
			height: imageNode.height() * scale
		};

		const newPos = {
			x: (stageSize.width - imageSize.width) / 2,
			y: (stageSize.height - imageSize.height) / 2
		};

		stage.position(newPos);
		stage.batchDraw();
	}

	function updateDimensions(changedDimension: 'width' | 'height') {
		if (maintainAspectRatio) {
			const aspectRatio = imageNode.width() / imageNode.height();
			if (changedDimension === 'width') {
				height = width / aspectRatio;
			} else {
				width = height * aspectRatio;
			}
		}
		resize();
	}

	function applyZoomResize() {
		onZoomApplied?.();
	}

	function exitZoomResize() {
		onZoomCancelled?.();
	}
</script>

<!-- Zoom and Resize Controls UI -->
<div class="wrapper p-4">
	<div class="flex w-full items-center justify-between">
		<div class="flex items-center gap-2">
			<!-- Back button at top of component -->
			<button onclick={exitZoomResize} aria-label="Exit rotation mode" class="variant-outline-tertiary btn-icon">
				<iconify-icon icon="material-symbols:close-rounded" width="20"></iconify-icon>
			</button>

			<h3 class="relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Rotation Settings</h3>
		</div>

		<!-- Action Buttons -->
		<div class="mt-4 flex justify-around gap-4">
			<button onclick={resetZoom} aria-label="Reset zoom" class="variant-outline btn"> Reset Zoom </button>
			<button onclick={applyZoomResize} aria-label="Apply zoom and resize" class="variant-filled-primary btn">
				<iconify-icon icon="mdi:check" width="20"></iconify-icon>
				Apply
			</button>
		</div>
	</div>

	<!-- Zoom Controls -->
	<div class="flex items-center justify-around space-x-4">
		<div class="flex flex-col items-center">
			<button onclick={() => zoom(-zoomSpeed)} aria-label="Zoom out" class="btn">
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
			<button onclick={() => zoom(zoomSpeed)} aria-label="Zoom in" class="btn">
				<iconify-icon icon="mdi:magnify-plus-outline" width="24"></iconify-icon>
				<span class="text-xs">Zoom In</span>
			</button>
		</div>
	</div>

	<!-- Resize Controls -->
	<div class="mt-4">
		<div class="flex items-center justify-around space-x-2">
			<label class="label text-center">
				Width:
				<input
					type="number"
					bind:value={width}
					oninput={() => updateDimensions('width')}
					class="input text-center"
					aria-label="Image width in pixels"
				/>
			</label>
			<label class="label text-center">
				Height:
				<input
					type="number"
					bind:value={height}
					oninput={() => updateDimensions('height')}
					class="input text-center"
					aria-label="Image height in pixels"
				/>
			</label>
		</div>
		<div class="mt-1 flex items-center justify-around space-x-2">
			<label class="flex space-x-2">
				<input type="checkbox" bind:checked={maintainAspectRatio} class="checkbox-primary checkbox" aria-label="Maintain aspect ratio" />
				<span>Maintain Aspect Ratio</span>
			</label>
		</div>
	</div>
</div>
