<!-- Zoom.svelte -->
<script lang="ts">
	import Konva from 'konva';
	import { onMount } from 'svelte';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let scale = 1;
	let minScale = 0.1;
	let maxScale = 5;
	let zoomSpeed = 0.1;

	onMount(() => {
		// Center the image initially
		centerImage();

		// Add mouse wheel zoom functionality
		stage.on('wheel', (e) => {
			e.evt.preventDefault();
			const oldScale = stage.scaleX();
			const pointer = stage.getPointerPosition();

			if (!pointer) return;

			const mousePointTo = {
				x: (pointer.x - stage.x()) / oldScale,
				y: (pointer.y - stage.y()) / oldScale
			};

			let direction = e.evt.deltaY > 0 ? -1 : 1;
			let newScale = direction > 0 ? oldScale * 1.1 : oldScale / 1.1;

			newScale = Math.max(minScale, Math.min(maxScale, newScale));

			stage.scale({ x: newScale, y: newScale });

			const newPos = {
				x: pointer.x - mousePointTo.x * newScale,
				y: pointer.y - mousePointTo.y * newScale
			};
			stage.position(newPos);
			stage.batchDraw();

			scale = newScale;
		});

		// Add double-click to reset zoom
		stage.on('dblclick', () => {
			resetZoom();
		});

		// Add drag functionality
		stage.draggable(true);
	});

	function zoom(delta: number) {
		const oldScale = scale;
		scale += delta;
		scale = Math.max(minScale, Math.min(maxScale, scale));

		const oldPos = stage.position();
		const stageCenter = {
			x: stage.width() / 2,
			y: stage.height() / 2
		};

		const newPos = {
			x: stageCenter.x - (stageCenter.x - oldPos.x) * (scale / oldScale),
			y: stageCenter.y - (stageCenter.y - oldPos.y) * (scale / oldScale)
		};

		stage.scale({ x: scale, y: scale });
		stage.position(newPos);
		stage.batchDraw();
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
			width: imageNode.width(),
			height: imageNode.height()
		};

		const newPos = {
			x: (stageSize.width - imageSize.width) / 2,
			y: (stageSize.height - imageSize.height) / 2
		};

		stage.position(newPos);
		stage.batchDraw();
	}
</script>

<div
	class="zoom-controls absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 transform items-center space-x-4 rounded-full bg-gray-800 px-4 py-2 text-white"
>
	<button class="text-2xl font-bold" on:click={() => zoom(-zoomSpeed)}>-</button>
	<span class="min-w-[60px] text-center">{Math.round(scale * 100)}%</span>
	<button class="text-2xl font-bold" on:click={() => zoom(zoomSpeed)}>+</button>
	<button class="ml-2 text-sm" on:click={resetZoom}>Reset</button>
</div>

<style>
	.zoom-controls {
		background-color: rgba(0, 0, 0, 0.6);
	}
</style>
