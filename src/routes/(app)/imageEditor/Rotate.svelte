<!-- 
@file src/routes/(app)/imageEditor/Rotate.svelte
@component
**Provides image rotation functionality with Konva integration**

### Props 
- `stage`: Konva.Stage - The Konva stage where the image is displayed
- `layer`: Konva.Layer - The Konva layer where the image and effects are added  
- `imageNode`: Konva.Image - The Konva image node representing the original image
-->

<script lang="ts">
	import Konva from 'konva';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		onRotate?: (angle: number) => void;
		onRotateApplied?: () => void;
		onRotateCancelled?: () => void;
		onRotateReset?: () => void;
	}

	const { stage, layer, imageNode, onRotate, onRotateApplied, onRotateCancelled, onRotateReset } = $props() as Props;

	let rotationAngle = $state(0);
	let gridLayer = $state<Konva.Layer | null>(null);

	// Initialize grid layer
	$effect.root(() => {
		createGridLayer();
		return () => {
			if (gridLayer) {
				gridLayer.destroy();
			}
		};
	});

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
		gridLayer?.show();
		gridLayer?.batchDraw();
		onRotate?.(rotationAngle);
	}

	function applyRotation() {
		gridLayer?.hide();
		layer.batchDraw();
		onRotateApplied?.();
	}

	function exitRotation() {
		onRotateCancelled?.();
	}

	function resetRotation() {
		rotationAngle = 0;
		imageNode.rotation(0);
		gridLayer?.hide();
		layer.batchDraw();
		onRotateReset?.();
	}
</script>

<!-- Rotation Controls UI -->
<div class="wrapper p-4">
	<div class="flex w-full items-center justify-between">
		<div class="flex items-center gap-2">
			<!-- Back button at top of component -->
			<button onclick={exitRotation} aria-label="Exit rotation mode" class="variant-outline-tertiary btn-icon">
				<iconify-icon icon="material-symbols:close-rounded" width="20"></iconify-icon>
			</button>

			<h3 class="relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Rotation Settings</h3>
		</div>

		<div class="mt-4 flex justify-around gap-4">
			<button onclick={resetRotation} aria-label="Reset rotation" class="variant-outline btn"> Reset </button>
			<button onclick={applyRotation} aria-label="Apply rotation" class="variant-filled-primary btn">
				<iconify-icon icon="mdi:check" width="20"></iconify-icon>
				Apply
			</button>
		</div>
	</div>

	<div class="flex items-center justify-around space-x-4">
		<div class="flex flex-col items-center">
			<button onclick={rotateLeft} aria-label="Rotate 90 degrees left" class="btn">
				<iconify-icon icon="mdi:rotate-left" width="24"></iconify-icon>
				<span class="text-xs">90° Left</span>
			</button>
		</div>

		<div class="flex flex-col space-y-2">
			<label for="rotation-angle" class="text-sm font-medium">Rotation Angle:</label>
			<span class="text-center text-tertiary-500 dark:text-primary-500">
				{rotationAngle}°
			</span>
		</div>

		<div class="flex flex-col items-center">
			<button onclick={rotateRight} aria-label="Rotate 90 degrees right" class="btn">
				<iconify-icon icon="mdi:rotate-right" width="24"></iconify-icon>
				<span class="text-xs">90° Right</span>
			</button>
		</div>
	</div>

	<div class="mt-4">
		<input
			id="rotation-angle"
			type="range"
			min="-180"
			max="180"
			step="1"
			bind:value={rotationAngle}
			oninput={rotateCustom}
			class="range range-primary w-full"
			aria-label="Rotation angle slider"
		/>
	</div>
</div>
