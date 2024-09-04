<!-- 
@file: src/routes/(app)/imageEditor/Rotate.svelte
@description: This component provides rotation controls for an image within a Konva stage. 
              Users can rotate the image left, right, or by a custom angle, with options to apply or cancel the rotation.
-->

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	const dispatch = createEventDispatcher();

	let rotationAngle = 0;

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
		imageNode.rotation(rotationAngle);
		layer.batchDraw();
		dispatch('rotate', { angle: rotationAngle });
	}

	function applyRotation() {
		dispatch('rotateApplied', { angle: rotationAngle });
	}

	function cancelRotation() {
		rotationAngle = 0;
		imageNode.rotation(0);
		layer.batchDraw();
		dispatch('rotateCancelled');
	}
</script>

<div class="rotate-controls bg-base-800 absolute left-4 top-4 z-50 flex flex-col space-y-4 rounded-md p-4 text-white shadow-lg">
	<div class="rotate-buttons flex justify-between space-x-4">
		<button on:click={rotateLeft} class="btn-primary btn-circle btn" aria-label="Rotate Left">
			<iconify-icon icon="mdi:rotate-left" width="24" />
			<span class="text-xs">Left</span>
		</button>
		<button on:click={rotateRight} class="btn-primary btn-circle btn" aria-label="Rotate Right">
			<iconify-icon icon="mdi:rotate-right" width="24" />
			<span class="text-xs">Right</span>
		</button>
	</div>
	<div class="custom-rotation flex items-center space-x-4">
		<label for="rotation-angle" class="text-sm font-medium">Custom Angle:</label>
		<input id="rotation-angle" type="range" min="0" max="359" bind:value={rotationAngle} on:input={rotateCustom} class="range" />
		<span>{rotationAngle}°</span>
	</div>
	<div class="action-buttons flex justify-between gap-4">
		<button on:click={applyRotation} class="btn-primary btn">Apply</button>
		<button on:click={cancelRotation} class="btn-error btn">Cancel</button>
	</div>
</div>
