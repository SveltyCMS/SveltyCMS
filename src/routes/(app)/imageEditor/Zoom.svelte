<!-- 
@file: ImageZoomResize.svelte
@description: This component allows users to zoom and resize an image within a Konva stage. 
              It provides zoom controls as well as options to resize the image while maintaining the aspect ratio.
-->

<script lang="ts">
	import Konva from 'konva';
	import { onMount, createEventDispatcher } from 'svelte';

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

	const dispatch = createEventDispatcher();

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

	function exitZoomResize() {
		dispatch('exitZoomResize');
	}
</script>

<!-- Zoom Controls -->
<div
	class="variant-filled-surface btn-group btn-group absolute bottom-32 left-1/2 z-50 -translate-x-1/2 transform items-center space-x-4 rounded-full border p-2 opacity-90"
>
	<button class="btn-icon" on:click={() => zoom(-zoomSpeed)} aria-label="Zoom Out">-</button>
	<span class="min-w-[20px] text-center text-sm font-semibold text-tertiary-500 dark:text-primary-500">{Math.round(scale * 100)}%</span>
	<button class="btn-icon" on:click={() => zoom(zoomSpeed)} aria-label="Zoom In">+</button>
	<button class="btn rounded-none border-l border-surface-200" on:click={resetZoom} aria-label="Reset Zoom">Reset</button>
</div>

<!-- Resize and Exit Controls -->
<div class="wrapper">
	<div class="flex items-center justify-around space-x-2">
		<label class="label text-center">
			Width:
			<input type="number" bind:value={width} on:input={() => updateDimensions('width')} class=" input text-center" />
		</label>
		<label class="label text-center">
			Height:
			<input type="number" bind:value={height} on:input={() => updateDimensions('height')} class="input text-center" />
		</label>
	</div>
	<div class="flex items-center justify-around space-x-2">
		<label class="flex space-x-2">
			<input type="checkbox" bind:checked={maintainAspectRatio} class="checkbox-primary checkbox" />
			<span>Maintain Aspect Ratio</span>
		</label>
	</div>
	<div class="mt-4 flex justify-between space-x-2">
		<button on:click={resize} class="variant-filled-primary btn w-full">Apply Resize</button>
		<button on:click={exitZoomResize} class="variant-outline btn w-full">Exit</button>
	</div>
</div>
