<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	const dispatch = createEventDispatcher();

	let cropShape: 'square' | 'circular' = 'square';
	let cropBox: Konva.Rect;
	let cropCircle: Konva.Circle;

	function initCropTool() {
		const imageWidth = imageNode.width();
		const imageHeight = imageNode.height();
		const size = Math.min(imageWidth, imageHeight) / 2;

		// Remove any existing crop tools
		if (cropBox) cropBox.destroy();
		if (cropCircle) cropCircle.destroy();

		if (cropShape === 'square') {
			cropBox = new Konva.Rect({
				x: (imageWidth - size) / 2,
				y: (imageHeight - size) / 2,
				width: size,
				height: size,
				stroke: 'white',
				strokeWidth: 2,
				draggable: true,
				resizeEnabled: true
			});
			layer.add(cropBox);

			// Enable resizing of the rectangle
			cropBox.on('transform', () => {
				cropBox.width(cropBox.width() * cropBox.scaleX());
				cropBox.height(cropBox.height() * cropBox.scaleY());
				cropBox.scaleX(1);
				cropBox.scaleY(1);
			});
		} else {
			cropCircle = new Konva.Circle({
				x: imageWidth / 2,
				y: imageHeight / 2,
				radius: size / 2,
				stroke: 'white',
				strokeWidth: 2,
				draggable: true
			});
			layer.add(cropCircle);

			// Enable resizing of the circle
			cropCircle.on('transform', () => {
				const radius = cropCircle.radius() * cropCircle.scaleX();
				cropCircle.radius(radius);
				cropCircle.scaleX(1);
				cropCircle.scaleY(1);
			});
		}

		layer.draw();
	}

	function applyCrop() {
		let x, y, width, height;
		if (cropShape === 'square') {
			x = cropBox.x();
			y = cropBox.y();
			width = cropBox.width();
			height = cropBox.height();
		} else {
			x = cropCircle.x() - cropCircle.radius();
			y = cropCircle.y() - cropCircle.radius();
			width = cropCircle.radius() * 2;
			height = cropCircle.radius() * 2;
		}

		dispatch('crop', { x, y, width, height, shape: cropShape });
	}

	$: {
		if (stage && layer && imageNode) {
			initCropTool();
		}
	}
</script>

<div class="crop-controls rounded-md bg-surface-300 p-2 dark:bg-surface-700">
	<div class="flex items-center justify-between">
		<label for="cropShape" class="text-sm text-gray-700 dark:text-gray-300">Crop Shape:</label>
		<select id="cropShape" bind:value={cropShape} on:change={initCropTool} class="input-select">
			<option value="square">Square</option>
			<option value="circular">Circular</option>
		</select>
	</div>
	<button on:click={applyCrop} class="variant-outline-tertiary mt-4 w-full dark:variant-outline-secondary">
		<iconify-icon icon="mdi:crop" width="24" class="mb-1 text-tertiary-600" />
		<p class="config-text">Apply Crop</p>
	</button>
</div>

<style>
	.crop-controls {
		background-color: var(--surface-300);
		padding: 16px;
		border-radius: 8px;
	}

	.input-select {
		width: 100%;
		padding: 8px;
		margin-top: 8px;
		border-radius: 4px;
		border: 1px solid var(--border);
		background-color: var(--background);
		color: var(--text-primary);
	}

	.input-select:focus {
		outline: none;
		border-color: var(--primary);
	}

	button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 12px;
		border-radius: 8px;
	}

	button p.config-text {
		margin-top: 4px;
		font-size: 12px;
		color: var(--tertiary-600);
	}

	button .iconify-icon {
		margin-bottom: 4px;
		color: var(--tertiary-600);
	}
</style>
