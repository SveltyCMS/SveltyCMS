<!-- 
@file src/r	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		imageGroup?: Konva.Group;
		onCrop?: (data: { x: number; y: number; width: number; height: number; shape: string }) => void;
		onCancelCrop?: () => void;
		onCropReset?: () => void;
	}

	const { stage, layer, imageNode, imageGroup, onCrop = () => {}, onCancelCrop = () => {}, onCropReset = () => {} } = $props() as Props;)/imageEditor/Crop.svelte
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
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		imageGroup?: Konva.Group;
		onCrop?: (data: { x: number; y: number; width: number; height: number; shape: string }) => void;
		onCancelCrop?: () => void;
		onCropReset?: () => void;
	}

	const { stage, layer, imageNode, imageGroup, onCrop = () => {}, onCancelCrop = () => {}, onCropReset = () => {} } = $props() as Props;

	let cropShape = $state<'rectangle' | 'square' | 'circular'>('rectangle');
	let aspectRatio = $state<'free' | '1:1' | '4:3' | '16:9' | '9:16' | '3:2'>('free');
	let cropTool = $state<Konva.Rect | Konva.Circle | null>(null);
	let transformer = $state<Konva.Transformer | null>(null);
	let cropOverlay = $state<Konva.Group | Konva.Rect | null>(null);

	// Initialize crop tool
	$effect.root(() => {
		initCropTool();
	});

	function initCropTool() {
		// Clear previous crop tool and transformer
		if (cropTool) cropTool.destroy();
		if (transformer) transformer.destroy();
		if (cropOverlay) cropOverlay.destroy();

		// Work with group container if available, otherwise use imageNode
		const container = imageGroup ?? imageNode;
		const imageWidth = imageNode.width();
		const imageHeight = imageNode.height();
		const size = Math.min(imageWidth, imageHeight) / 3; // Better initial size

		// Get container position and scale for proper positioning
		const containerX = container.x();
		const containerY = container.y();
		const containerScale = container.scaleX();

		// Create a sophisticated overlay that highlights the crop area
		const stage = storeState.stage;
		if (stage) {
			cropOverlay = new Konva.Group();
			
			const stageWidth = stage.width();
			const stageHeight = stage.height();
			
			// Create four rectangles to dim everything except the crop area
			const topRect = new Konva.Rect({
				x: 0,
				y: 0,
				width: stageWidth,
				height: containerY - (imageHeight * containerScale) / 2,
				fill: 'rgba(0, 0, 0, 0.6)',
				listening: false
			});
			
			const bottomRect = new Konva.Rect({
				x: 0,
				y: containerY + (imageHeight * containerScale) / 2,
				width: stageWidth,
				height: stageHeight - (containerY + (imageHeight * containerScale) / 2),
				fill: 'rgba(0, 0, 0, 0.6)',
				listening: false
			});
			
			const leftRect = new Konva.Rect({
				x: 0,
				y: containerY - (imageHeight * containerScale) / 2,
				width: containerX - (imageWidth * containerScale) / 2,
				height: imageHeight * containerScale,
				fill: 'rgba(0, 0, 0, 0.6)',
				listening: false
			});
			
			const rightRect = new Konva.Rect({
				x: containerX + (imageWidth * containerScale) / 2,
				y: containerY - (imageHeight * containerScale) / 2,
				width: stageWidth - (containerX + (imageWidth * containerScale) / 2),
				height: imageHeight * containerScale,
				fill: 'rgba(0, 0, 0, 0.6)',
				listening: false
			});
			
			cropOverlay.add(topRect, bottomRect, leftRect, rightRect);
		} else {
			// Fallback to simple overlay
			cropOverlay = new Konva.Rect({
				x: containerX - (imageWidth * containerScale) / 2,
				y: containerY - (imageHeight * containerScale) / 2,
				width: imageWidth * containerScale,
				height: imageHeight * containerScale,
				fill: 'rgba(0, 0, 0, 0.4)',
				listening: false
			});
		}

		layer.add(cropOverlay);
		imageEditorStore.registerTempNodes(cropOverlay);

		// Initialize the crop tool positioned relative to the container
		if (cropShape === 'circular') {
			cropTool = new Konva.Circle({
				x: containerX,
				y: containerY,
				radius: (size * containerScale) / 2,
				stroke: '#ff6b6b',
				strokeWidth: 2,
				dash: [5, 5],
				draggable: true,
				name: 'cropTool'
			});
		} else {
			let cropWidth = size * containerScale;
			let cropHeight = size * containerScale;

			// Apply aspect ratio
			if (aspectRatio === '1:1' || cropShape === 'square') {
				cropHeight = cropWidth;
			} else if (aspectRatio === '4:3') {
				cropHeight = cropWidth * (3 / 4);
			} else if (aspectRatio === '16:9') {
				cropHeight = cropWidth * (9 / 16);
			} else if (aspectRatio === '9:16') {
				cropHeight = cropWidth * (16 / 9);
				if (cropHeight > imageHeight * containerScale * 0.8) {
					cropHeight = imageHeight * containerScale * 0.8;
					cropWidth = cropHeight * (9 / 16);
				}
			} else if (aspectRatio === '3:2') {
				cropHeight = cropWidth * (2 / 3);
			} else if (cropShape === 'rectangle' && aspectRatio === 'free') {
				cropHeight = cropWidth * 0.75; // Default rectangle ratio
			}

			cropTool = new Konva.Rect({
				x: containerX - cropWidth / 2,
				y: containerY - cropHeight / 2,
				width: cropWidth,
				height: cropHeight,
				stroke: '#ff6b6b',
				strokeWidth: 2,
				dash: [5, 5],
				draggable: true,
				name: 'cropTool'
			});
		}

		layer.add(cropTool);
		imageEditorStore.registerTempNodes(cropTool);

		// Configure the transformer tool with better settings
		transformer = new Konva.Transformer({
			nodes: [cropTool],
			keepRatio: cropShape === 'square' || cropShape === 'circular' || aspectRatio !== 'free',
			enabledAnchors:
				cropShape === 'circular'
					? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
					: ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left'],
			anchorStrokeWidth: 1,
			anchorStroke: '#ff6b6b',
			anchorFill: 'white',
			anchorSize: 8,
			borderStroke: '#ff6b6b',
			borderStrokeWidth: 1,
			boundBoxFunc: (oldBox, newBox) => {
				// Minimum size constraints
				const minSize = 20;
				if (newBox.width < minSize || newBox.height < minSize) {
					return oldBox;
				}

				// Keep within image bounds
				const container = imageGroup ?? imageNode;
				const containerX = container.x();
				const containerY = container.y();
				const containerScale = container.scaleX();
				const imageWidth = imageNode.width() * containerScale;
				const imageHeight = imageNode.height() * containerScale;

				const bounds = {
					x: containerX - imageWidth / 2,
					y: containerY - imageHeight / 2,
					width: imageWidth,
					height: imageHeight
				};

				// Constrain to image bounds
				if (
					newBox.x < bounds.x ||
					newBox.y < bounds.y ||
					newBox.x + newBox.width > bounds.x + bounds.width ||
					newBox.y + newBox.height > bounds.y + bounds.height
				) {
					return oldBox;
				}

				return newBox;
			}
		});

		layer.add(transformer);
		imageEditorStore.registerTempNodes(transformer);

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

		const container = imageGroup ?? imageNode;
		const containerX = container.x();
		const containerY = container.y();
		const containerScale = container.scaleX();

		let cropData;

		if (cropShape === 'circular') {
			const circle = cropTool as Konva.Circle;
			const radius = circle.radius();
			cropData = {
				x: circle.x() - radius,
				y: circle.y() - radius,
				width: radius * 2,
				height: radius * 2,
				shape: cropShape
			};
		} else {
			const rect = cropTool as Konva.Rect;
			cropData = {
				x: rect.x(),
				y: rect.y(),
				width: rect.width(),
				height: rect.height(),
				shape: cropShape
			};
		}

		// Convert coordinates relative to the original image
		const imageWidth = imageNode.width();
		const imageHeight = imageNode.height();

		// Calculate relative coordinates within the original image
		const relativeX = (cropData.x - containerX + (imageWidth * containerScale) / 2) / containerScale;
		const relativeY = (cropData.y - containerY + (imageHeight * containerScale) / 2) / containerScale;
		const relativeWidth = cropData.width / containerScale;
		const relativeHeight = cropData.height / containerScale;

		// Ensure crop bounds are within image bounds
		const boundedCrop = {
			x: Math.max(0, Math.min(relativeX, imageWidth - 1)),
			y: Math.max(0, Math.min(relativeY, imageHeight - 1)),
			width: Math.max(1, Math.min(relativeWidth, imageWidth - relativeX)),
			height: Math.max(1, Math.min(relativeHeight, imageHeight - relativeY)),
			shape: cropShape
		};

		onCrop(boundedCrop);
	}

	function exitCrop() {
		onCancelCrop();
	}

	function resetCrop() {
		initCropTool();
		onCropReset();
	}

	// Effect to reinitialize crop tool when shape or aspect ratio changes
	$effect.root(() => {
		if (cropShape || aspectRatio) {
			initCropTool();
		}
	});
</script>

<!-- Crop Controls UI -->
<div class="wrapper p-2 sm:p-4">
	<!-- All controls in one horizontal line -->
	<div class="mb-3 grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
		<!-- Close button -->
		<div class="flex flex-col justify-end space-y-1">
			<label class="text-xs font-medium text-transparent">Close:</label>
			<button onclick={exitCrop} aria-label="Exit crop mode" class="variant-outline-tertiary btn btn-sm w-full">
				<iconify-icon icon="material-symbols:close-rounded" width="16"></iconify-icon>
			</button>
		</div>

		<!-- Shape dropdown -->
		<div class="flex flex-col space-y-1">
			<label for="cropShape" class="text-xs font-medium">Shape:</label>
			<select id="cropShape" bind:value={cropShape} class="select-bordered select-sm select w-full">
				<option value="rectangle">Rectangle</option>
				<option value="square">Square</option>
				<option value="circular">Circular</option>
			</select>
		</div>

		{#if cropShape === 'rectangle'}
			<!-- Aspect Ratio dropdown -->
			<div class="flex flex-col space-y-1">
				<label for="aspectRatio" class="text-xs font-medium">Aspect:</label>
				<select id="aspectRatio" bind:value={aspectRatio} class="select-bordered select-sm select w-full">
					<option value="free">Free</option>
					<option value="1:1">1:1</option>
					<option value="4:3">4:3</option>
					<option value="16:9">16:9</option>
					<option value="9:16">9:16</option>
					<option value="3:2">3:2</option>
				</select>
			</div>
		{/if}
	</div>

	<!-- Compact Controls Layout -->
	<div class="space-y-3">
		<!-- Action Buttons - Stacked on mobile -->
		<div class="flex flex-col gap-2 sm:flex-row">
			<button onclick={resetCrop} aria-label="Reset Crop" class="variant-outline btn btn-sm flex-1"> Reset </button>
			<button onclick={applyCrop} aria-label="Apply Crop" class="variant-filled-primary btn btn-sm flex-1">
				<iconify-icon icon="mdi:crop" width="16"></iconify-icon>
				Apply
			</button>
		</div>

		<!-- Compact Instructions -->
		<div class="rounded bg-secondary-100 p-2 dark:bg-secondary-800">
			<div class="text-center text-xs text-secondary-600 dark:text-secondary-300">
				<p class="mb-1 font-medium">Drag to position, resize corners/edges</p>
			</div>
		</div>
	</div>
</div>
