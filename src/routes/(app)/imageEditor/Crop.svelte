<!-- 
@file src/routes/(app)/imageEditor/Crop.svelte
@component
**This component provides cropping functionality for an image within a Konva stage, allowing users to define a crop area and apply the crop**

### Props 
- `layer`: Konva.Layer - The Konva layer where the image and effects are added.
- `imageNode`: Konva.Image - The Konva image node representing the original image.
- `onCropApplied` (optional): Function to be called when the crop is applied.
- `onCancelCrop` (optional): Function to be called when the crop is canceled.
- `onCropReset` (optional): Function to be called when the crop is reset.
-->

<script lang="ts">
	import Konva from 'konva';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		onCrop?: (data: { x: number; y: number; width: number; height: number; shape: string }) => void;
		onCancelCrop?: () => void;
		onCropReset?: () => void;
	}

	const { stage, layer, imageNode, onCrop = () => {}, onCancelCrop = () => {}, onCropReset = () => {} } = $props() as Props;

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
		if (!cropTool) return;

		const cropData = {
			x: cropTool.x(),
			y: cropTool.y(),
			width: cropTool.width ? cropTool.width() : (cropTool as Konva.Circle).radius() * 2,
			height: cropTool.height ? cropTool.height() : (cropTool as Konva.Circle).radius() * 2,
			shape: cropShape
		};

		onCrop(cropData);
	}

	function exitCrop() {
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
	<div class="flex w-full items-center justify-between">
		<div class="flex items-center gap-2">
			<!-- Back button at top of component -->
			<button onclick={exitCrop} aria-label="Exit rotation mode" class="variant-outline-tertiary btn-icon">
				<iconify-icon icon="material-symbols:close-rounded" width="20"></iconify-icon>
			</button>

			<h3 class="relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Crop Settings</h3>
		</div>

		<div class="flex flex-col space-y-2">
			<label for="cropShape" class="text-sm font-medium">Crop Shape:</label>
			<select id="cropShape" bind:value={cropShape} class="select-bordered select">
				<option value="rectangle">Rectangle</option>
				<option value="square">Square</option>
				<option value="circular">Circular</option>
			</select>
		</div>

		<div class="mt-4 flex justify-around gap-4">
			<button onclick={resetCrop} aria-label="Reset Crop" class="variant-outline btn text-center">Reset</button>

			<button onclick={applyCrop} aria-label="Apply Crop" class="variant-filled-primary btn">
				<iconify-icon icon="mdi:crop" width="20"></iconify-icon>
				Apply Crop
			</button>
		</div>
	</div>
</div>
