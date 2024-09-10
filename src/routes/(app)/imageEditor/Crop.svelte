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
		const size = Math.min(imageWidth, imageHeight) / 4; // Reduced initial size

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
		const cropCanvas = document.createElement('canvas');
		const cropContext = cropCanvas.getContext('2d');

		if (!cropContext) return;

		// Get the crop area's dimensions
		let cropX, cropY, cropWidth, cropHeight;

		if (cropTool instanceof Konva.Circle) {
			cropX = cropTool.x() - cropTool.radius();
			cropY = cropTool.y() - cropTool.radius();
			cropWidth = cropTool.radius() * 2;
			cropHeight = cropTool.radius() * 2;

			cropCanvas.width = cropWidth;
			cropCanvas.height = cropHeight;

			cropContext.arc(cropTool.radius(), cropTool.radius(), cropTool.radius(), 0, Math.PI * 2, false);
			cropContext.clip();
		} else {
			cropX = cropTool.x();
			cropY = cropTool.y();
			cropWidth = cropTool.width() * cropTool.scaleX();
			cropHeight = cropTool.height() * cropTool.scaleY();

			cropCanvas.width = cropWidth;
			cropCanvas.height = cropHeight;
		}

		// Draw the cropped area of the image onto the canvas
		cropContext.drawImage(imageNode.image(), cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

		// Update the Konva imageNode with the cropped image
		const croppedImage = new Image();
		croppedImage.src = cropCanvas.toDataURL();

		croppedImage.onload = () => {
			imageNode.image(croppedImage);
			imageNode.width(cropWidth);
			imageNode.height(cropHeight);
			imageNode.x(0);
			imageNode.y(0);

			// Remove crop tool and overlay
			cropTool.destroy();
			cropOverlay.destroy();
			transformer.destroy();
			layer.batchDraw();

			dispatch('cropApplied');
		};
	}

	function cancelCrop() {
		dispatch('cancelCrop');
	}

	function resetCrop() {
		initCropTool();
		dispatch('cropReset');
	}

	$: {
		if (cropShape) {
			initCropTool();
		}
	}
</script>

<!-- Crop Controls UI -->
<div class="wrapper bg-base-800 fixed bottom-0 left-0 right-0 z-50 flex flex-col space-y-4 p-4 text-white shadow-lg">
	<div class="flex items-center justify-around space-x-4">
		<div class="flex flex-col space-y-2">
			<label for="cropShape" class="text-sm font-medium">Crop Shape:</label>
			<select id="cropShape" bind:value={cropShape} class="select-bordered select">
				<option value="rectangle">Rectangle</option>
				<option value="square">Square</option>
				<option value="circular">Circular</option>
			</select>
		</div>
	</div>
	<div class="mt-4 flex justify-around gap-4">
		<button on:click={cancelCrop} class="variant-filled-error btn">Cancel</button>
		<button on:click={resetCrop} class="variant-outline btn">Reset</button>
		<button on:click={applyCrop} class="variant-filled-primary btn">
			<iconify-icon icon="mdi:crop" width="20" />
			Apply Crop
		</button>
	</div>
</div>
