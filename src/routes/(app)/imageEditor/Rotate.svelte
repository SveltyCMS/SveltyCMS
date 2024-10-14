<!-- 
@file: src/routes/(app)/imageEditor/Rotate.svelte
@description: This component provides rotation controls for an image within a Konva stage. 
              Users can rotate the image left, right, or by a custom angle, with options to apply or cancel the rotation.
-->

<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	const dispatch = createEventDispatcher();

	let rotationAngle = 0;
	let gridLayer: Konva.Layer;

	onMount(() => {
		createGridLayer();
	});

	// Function to create the grid layer
	function createGridLayer() {
		gridLayer = new Konva.Layer();

		const lineColor = 'rgba(211, 211, 211, 0.7)'; // Light gray color with some transparency

		const width = stage.width();
		const height = stage.height();
		const cellWidth = width / 3;
		const cellHeight = height / 3;

		// Create vertical grid lines
		for (let i = 1; i < 3; i++) {
			const verticalLine = new Konva.Line({
				points: [i * cellWidth, 0, i * cellWidth, height],
				stroke: lineColor,
				strokeWidth: 1
			});
			gridLayer.add(verticalLine);
		}

		// Create horizontal grid lines
		for (let i = 1; i < 3; i++) {
			const horizontalLine = new Konva.Line({
				points: [0, i * cellHeight, width, i * cellHeight],
				stroke: lineColor,
				strokeWidth: 1
			});
			gridLayer.add(horizontalLine);
		}

		// Add the grid layer to the stage but keep it hidden initially
		stage.add(gridLayer);
		gridLayer.hide();
	}

	function centerRotationPoint() {
		const imageWidth = imageNode.width();
		const imageHeight = imageNode.height();

		imageNode.offsetX(imageWidth / 2);
		imageNode.offsetY(imageHeight / 2);

		imageNode.x(stage.width() / 2);
		imageNode.y(stage.height() / 2);
	}

	function rotateLeft() {
		rotationAngle = (rotationAngle - 90) % 360;
		rotateImage();
	}

	function rotateRight() {
		rotationAngle = (rotationAngle + 90) % 360;
		rotateImage();
	}

	function rotateCustom() {
		rotateImage();
	}

	function rotateImage() {
		centerRotationPoint();
		imageNode.rotation(rotationAngle);
		layer.batchDraw();
		gridLayer.show(); // Show the grid when rotating
		gridLayer.batchDraw();
		dispatch('rotate', { angle: rotationAngle });
	}

	function applyRotation() {
		gridLayer.hide(); // Hide the grid when rotation is applied
		layer.batchDraw();
		dispatch('rotateApplied', { angle: rotationAngle });
	}

	function cancelRotation() {
		resetRotation();
		gridLayer.hide(); // Hide the grid when rotation is canceled
		layer.batchDraw();
		dispatch('rotateCancelled');
	}

	function resetRotation() {
		rotationAngle = 0;
		imageNode.rotation(0);
		gridLayer.hide(); // Hide the grid when resetting
		layer.batchDraw();
		dispatch('rotateReset');
	}
</script>

<div class="wrapper">
	<div class="flex items-center justify-around">
		<button on:click={rotateLeft} class="btn flex flex-col items-center" aria-label="Rotate Left">
			<iconify-icon icon="mdi:rotate-left" width="24" />
			<span class="text-xs text-tertiary-500 dark:text-primary-500">Left</span>
		</button>

		<label for="rotation-angle" class="text-center text-sm font-medium">
			Custom Angle:
			<span class="ml-2 text-tertiary-500 dark:text-primary-500">{rotationAngle}°</span>
		</label>

		<button on:click={rotateRight} class=" btn flex flex-col items-center" aria-label="Rotate Right">
			<iconify-icon icon="mdi:rotate-right" width="24" />
			<span class="text-xs text-tertiary-500 dark:text-primary-500">Right</span>
		</button>
	</div>

	<div class="mt-2 flex items-center justify-center space-x-4">
		<input
			id="rotation-angle"
			type="range"
			min="-180"
			max="180"
			step="1"
			bind:value={rotationAngle}
			on:input={rotateCustom}
			class="h-2 w-full cursor-pointer rounded-full bg-gray-300"
		/>
	</div>

	<div class="mt-4 flex justify-around gap-4">
		<button on:click={cancelRotation} class="variant-filled-error btn">Cancel</button>
		<button on:click={resetRotation} class="variant-outline btn">Reset</button>
		<button on:click={applyRotation} class="variant-filled-primary btn">Apply</button>
	</div>
</div>
