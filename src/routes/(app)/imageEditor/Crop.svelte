<!-- 
@file src/routes/(app)/imageEditor/Crop.svelte
@component
**This component provides cropping functionality for an image within a Konva stage, allowing users to define a crop area and apply the crop**
 

### Props 
- `layer`: Konva.Layer - The Konva layer where the image and effects are added.
- `imageNode`: Konva.Image - The Konva image node representing the original image.
- `on:cropApplied` (optional): Function to be called when the crop is applied.
- `on:cancelCrop` (optional): Function to be called when the crop is canceled.
- `on:cropReset` (optional): Function to be called when the crop is reset.
-->

<script lang="ts">
	import Konva from 'konva';

	interface Props {
		layer: Konva.Layer;
		imageNode: Konva.Image;
		'on:cropApplied'?: () => void;
		'on:cancelCrop'?: () => void;
		'on:cropReset'?: () => void;
	}

	let {
		layer,
		imageNode,
		'on:cropApplied': onCropApplied = () => {},
		'on:cancelCrop': onCancelCrop = () => {},
		'on:cropReset': onCropReset = () => {}
	} = $props() as Props;

	let cropShape = $state<'rectangle' | 'square' | 'circular'>('rectangle');
	let cropTool = $state<Konva.Rect | Konva.Circle | null>(null);
	let transformer = $state<Konva.Transformer | null>(null);
	let cropOverlay = $state<Konva.Rect | null>(null);

	// Initialize crop tool
	$effect.root(() => {
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
		if (!cropTool || !cropOverlay || !transformer) return;

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
		const image = imageNode.image();
		if (image) {
			cropContext.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
		} else {
			console.error('Image is not loaded yet');
		}

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
			cropTool?.destroy();
			cropOverlay?.destroy();
			transformer?.destroy();
			layer.batchDraw();

			onCropApplied();
		};
	}

	function cancelCrop() {
		onCancelCrop();
	}

	function resetCrop() {
		initCropTool();
		onCropReset();
	}

	// Effect to reinitialize crop tool when shape changes
	$effect.root(() => {
		if (cropShape) {
			initCropTool();
		}
	});
</script>

<!-- Crop Controls UI -->
<div class="wrapper">
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
		<button onclick={cancelCrop} aria-label="Cancel Crop" class="preset-filled-error-500 btn">Cancel</button>
		<button onclick={resetCrop} aria-label="Reset Crop" class="preset-outline btn">Reset</button>
		<button onclick={applyCrop} aria-label="Apply Crop" class="preset-filled-primary-500 btn">
			<iconify-icon icon="mdi:crop" width="20"></iconify-icon>
			Apply Crop
		</button>
	</div>
</div>
