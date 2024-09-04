<!-- 
@file src/routes/(app)/imageEditor/Crop.svelte
@description This component provides cropping functionality for an image within a Konva stage, allowing users to define a crop area and apply the crop.
-->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	const dispatch = createEventDispatcher();

	let cropShape: 'rectangle' | 'square' | 'circular' = 'rectangle';
	let cropTool: Konva.Rect | Konva.Circle;
	let transformer: Konva.Transformer;
	let cropOverlay: Konva.Rect;

	onMount(() => {
		initCropTool();
	});

	function initCropTool() {
		// Clear previous crop tool and transformer
		if (cropTool) cropTool.destroy();
		if (transformer) transformer.destroy();
		if (cropOverlay) cropOverlay.destroy();

		const imageWidth = imageNode.width();
		const imageHeight = imageNode.height();
		const size = Math.min(imageWidth, imageHeight) / 2;

		// Create an overlay to dim the area outside the crop region
		cropOverlay = new Konva.Rect({
			x: 0,
			y: 0,
			width: imageWidth,
			height: imageHeight,
			fill: 'rgba(0, 0, 0, 0.5)',
			globalCompositeOperation: 'destination-over',
			listening: false
		});

		layer.add(cropOverlay);

		// Initialize the crop tool
		if (cropShape === 'circular') {
			cropTool = new Konva.Circle({
				x: imageWidth / 2,
				y: imageHeight / 2,
				radius: size / 2,
				stroke: 'white',
				strokeWidth: 3, // Consistent stroke width
				draggable: true,
				name: 'cropTool'
			});
		} else {
			cropTool = new Konva.Rect({
				x: (imageWidth - size) / 2,
				y: (imageHeight - size) / 2,
				width: size,
				height: cropShape === 'square' ? size : size * 0.75,
				stroke: 'white',
				strokeWidth: 3, // Consistent stroke width
				draggable: true,
				name: 'cropTool'
			});
		}

		layer.add(cropTool);

		// Configure the transformer tool
		transformer = new Konva.Transformer({
			nodes: [cropTool],
			keepRatio: cropShape !== 'rectangle',
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
			anchorStrokeWidth: 2,
			anchorSize: 10,
			borderStrokeWidth: 2,
			boundBoxFunc: (oldBox, newBox) => {
				// Limit resize
				if (newBox.width < 30 || newBox.height < 30) {
					return oldBox;
				}
				return newBox;
			}
		});

		layer.add(transformer);

		cropTool.on('transform', () => {
			if (cropTool instanceof Konva.Circle) {
				const scaleX = cropTool.scaleX();
				cropTool.radius(cropTool.radius() * scaleX);
				cropTool.scaleX(1);
				cropTool.scaleY(1);
			}
		});

		layer.draw();
	}

	function applyCrop() {
		let crop;
		if (cropTool instanceof Konva.Circle) {
			crop = {
				x: cropTool.x() - cropTool.radius(),
				y: cropTool.y() - cropTool.radius(),
				width: cropTool.radius() * 2,
				height: cropTool.radius() * 2,
				shape: 'circular'
			};
		} else {
			crop = {
				x: cropTool.x(),
				y: cropTool.y(),
				width: cropTool.width() * cropTool.scaleX(),
				height: cropTool.height() * cropTool.scaleY(),
				shape: cropShape
			};
		}

		dispatch('crop', crop);
	}

	function cancelCrop() {
		dispatch('cancelCrop');
	}

	$: {
		if (cropShape) {
			initCropTool();
		}
	}
</script>

<!-- Crop Controls UI -->
<div class="crop-controls bg-base-800 absolute left-4 top-4 z-50 flex flex-col space-y-4 rounded-md p-4 text-white shadow-lg">
	<div class="control-group">
		<label for="cropShape" class="text-sm font-medium">Crop Shape:</label>
		<select id="cropShape" bind:value={cropShape} class="select-bordered select text-black">
			<option value="rectangle">Rectangle</option>
			<option value="square">Square</option>
			<option value="circular">Circular</option>
		</select>
	</div>
	<p class="instructions text-sm">Drag the corners to resize the crop area</p>
	<div class="button-group flex justify-between gap-4">
		<button on:click={applyCrop} class="btn-primary btn">
			<iconify-icon icon="mdi:crop" width="20" />
			Apply Crop
		</button>
		<button on:click={cancelCrop} class="btn-secondary btn">Cancel</button>
	</div>
</div>
