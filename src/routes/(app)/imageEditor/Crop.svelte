<!-- Crop.svelte -->
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
				draggable: true
			});
			layer.add(cropBox);
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

<div>
	<select bind:value={cropShape} on:change={initCropTool}>
		<option value="square">Square</option>
		<option value="circular">Circular</option>
	</select>
	<button on:click={applyCrop}>Apply Crop</button>
</div>
