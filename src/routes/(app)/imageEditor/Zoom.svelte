<!-- 
@file src/routes/(app)/imageEditor/Zoom.svelte
@component
**This component allows users to zoom and resize an image within a Konva stage**
It provides zoom controls as well as options to resize the image while maintaining the aspect ratio

#### Props
- `stage`: Konva.Stage - The Konva stage where the image is displayed.
- `layer`: Konva.Layer - The Konva layer where the image and effects are added.
- `imageNode`: Konva.Image - The Konva image node representing the original image.
- `on:exitZoomResize` (optional): Function to be called when the zoom and resize is exited.
-->

<script lang="ts">
	import Konva from 'konva';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		'on:exitZoomResize'?: () => void;
	}

	let { stage, layer, imageNode, 'on:exitZoomResize': onExitZoomResize = () => {} } = $props() as Props;

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

		stage.on('wheel', (e) => {
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

	function exitZoomResize() {
		onExitZoomResize();
	}
</script>

<!-- Zoom Controls -->
<div
	class="preset-filled-surface-500 absolute bottom-32 left-1/2 z-50 -translate-x-1/2 transform items-center space-x-4 rounded-full border p-2 opacity-90"
>
	<button class="btn-icon" onclick={() => zoom(-zoomSpeed)} aria-label="Zoom Out">-</button>
	<span class="text-tertiary-500 dark:text-primary-500 min-w-[20px] text-center text-sm font-semibold">{Math.round(scale * 100)}%</span>
	<button class="btn-icon" onclick={() => zoom(zoomSpeed)} aria-label="Zoom In">+</button>
	<button class="btn border-surface-200 rounded-none border-l" onclick={resetZoom} aria-label="Reset Zoom">Reset</button>
</div>

<!-- Resize and Exit Controls -->
<div class="wrapper">
	<div class="flex items-center justify-around space-x-2">
		<label class="label text-center">
			Width:
			<input type="number" bind:value={width} oninput={() => updateDimensions('width')} class=" input text-center" />
		</label>
		<label class="label text-center">
			Height:
			<input type="number" bind:value={height} oninput={() => updateDimensions('height')} class="input text-center" />
		</label>
	</div>
	<div class="flex items-center justify-around space-x-2">
		<label class="flex space-x-2">
			<input type="checkbox" bind:checked={maintainAspectRatio} class="checkbox-primary checkbox" />
			<span>Maintain Aspect Ratio</span>
		</label>
	</div>
	<div class="mt-4 flex justify-between space-x-2">
		<button onclick={resize} class="preset-filled-primary-500 btn w-full">Apply Resize</button>
		<button onclick={exitZoomResize} class="preset-outline btn w-full">Exit</button>
	</div>
</div>
