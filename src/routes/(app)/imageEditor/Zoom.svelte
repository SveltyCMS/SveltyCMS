<!-- 
@file: ImageZoomResize.svelte
@description: This component allows users to zoom and resize an image within a Konva stage. 
              It provides zoom controls as well as options to resize the image while maintaining the aspect ratio.
-->

<script lang="ts">
	import Konva from 'konva';
	import { onMount } from 'svelte';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let scale = 1;
	let width = imageNode.width();
	let height = imageNode.height();
	let minScale = 0.1;
	let maxScale = 5;
	let maintainAspectRatio = true;
	let zoomSpeed = 0.1;

	onMount(() => {
		centerImage();

		stage.on('wheel', (e) => {
			e.evt.preventDefault();
			zoom(e.evt.deltaY > 0 ? -zoomSpeed : zoomSpeed);
		});

		stage.on('dblclick', () => {
			resetZoom();
		});

		stage.draggable(true);
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
</script>

<div
	class="controls-container bg-base-900/75 border-base-100 absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 transform items-center space-x-4 rounded-full border p-2 shadow-lg"
>
	<button class="btn-circle btn" on:click={() => zoom(-zoomSpeed)} aria-label="Zoom Out">-</button>
	<span class="min-w-[60px] text-center text-sm font-semibold">{Math.round(scale * 100)}%</span>
	<button class="btn-circle btn" on:click={() => zoom(zoomSpeed)} aria-label="Zoom In">+</button>
	<button class="btn btn-sm ml-2" on:click={resetZoom} aria-label="Reset Zoom">Reset</button>
</div>

<div class="resize-controls bg-base-800 absolute right-4 top-4 z-50 rounded-md p-4 text-white shadow-lg">
	<h3 class="mb-4 text-lg font-bold">Resize Image</h3>
	<div class="flex flex-col space-y-2">
		<label class="label">
			Width:
			<input type="number" bind:value={width} on:input={() => updateDimensions('width')} class="input-bordered input w-full" />
		</label>
		<label class="label">
			Height:
			<input type="number" bind:value={height} on:input={() => updateDimensions('height')} class="input-bordered input w-full" />
		</label>
		<label class="flex items-center space-x-2">
			<input type="checkbox" bind:checked={maintainAspectRatio} class="checkbox-primary checkbox" />
			<span>Maintain Aspect Ratio</span>
		</label>
	</div>
	<button on:click={resize} class="btn-primary btn mt-4 w-full">Apply Resize</button>
</div>
