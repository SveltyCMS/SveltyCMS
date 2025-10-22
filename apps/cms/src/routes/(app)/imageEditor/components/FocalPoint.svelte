<!-- 
@file src/routes/(app)/imageEditor/FocalPoint.svelte
@component
**This component allows users to set or reset a focal point on the image**

### Props 
- `stage`: Konva.Stage - The Konva stage where the image is displayed.
- `layer`: Konva.Layer - The Konva layer where the image and effects are added.
- `imageNode`: Konva.Image - The Konva image node representing the original image.
-->

<script lang="ts">
	import Konva from 'konva';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		onFocalpoint?: (data: { x: number; y: number }) => void;
		onFocalpointApplied?: () => void;
		onFocalpointRemoved?: () => void;
	}

	const { stage, layer, imageNode, onFocalpoint = () => {}, onFocalpointApplied = () => {}, onFocalpointRemoved = () => {} } = $props() as Props;

	let focalPoint: Konva.Group | null = $state(null);
	let focalPointActive = $state(false);
	let relativeX: number = $state(0);
	let relativeY: number = $state(0);

	// Initialize focal point and event listeners
	$effect.root(() => {
		createFocalPoint(); // Create focal point at the center of the image
		setupEventListeners();

		// Cleanup function
		return () => {
			if (focalPoint) {
				focalPoint.destroy();
			}
			stage.off('click');
		};
	});

	function createFocalPoint() {
		// Ensure only one focal point exists by destroying the previous one if it exists
		if (focalPoint) {
			focalPoint.destroy();
		}

		// Create focal point in the center of the image
		const imageCenterX = stage.width() / 2;
		const imageCenterY = stage.height() / 2;

		focalPoint = new Konva.Group({
			x: imageCenterX,
			y: imageCenterY,
			draggable: true
		});

		const outerCircle = new Konva.Circle({
			radius: 20,
			stroke: 'white',
			strokeWidth: 2,
			dash: [5, 5]
		});

		const innerCircle = new Konva.Circle({
			radius: 5,
			fill: 'red'
		});

		const crosshairVertical = new Konva.Line({
			points: [0, -15, 0, 15],
			stroke: 'white',
			strokeWidth: 2
		});

		const crosshairHorizontal = new Konva.Line({
			points: [-15, 0, 15, 0],
			stroke: 'white',
			strokeWidth: 2
		});

		focalPoint.add(outerCircle, innerCircle, crosshairVertical, crosshairHorizontal);
		layer.add(focalPoint);
		layer.draw();

		// Update focal point coordinates to (0, 0) at the center
		updateFocalPoint();
		focalPointActive = true;
	}

	function setupEventListeners() {
		stage.on('click', (e) => {
			if (e.target === stage || e.target === imageNode) {
				if (!focalPointActive || !focalPoint) {
					return;
				}
				const position = stage.getPointerPosition();
				if (position && focalPoint) {
					focalPoint.position({
						x: position.x,
						y: position.y
					});
					updateFocalPoint();
				}
			}
		});

		focalPoint?.on('dragmove', () => {
			updateFocalPoint();
		});

		focalPoint?.on('mouseenter', () => {
			document.body.style.cursor = 'move';
		});

		focalPoint?.on('mouseleave', () => {
			document.body.style.cursor = 'default';
		});
	}

	function updateFocalPoint() {
		if (!focalPoint) return;

		const imageRect = imageNode.getClientRect();
		const focalPointPos = focalPoint.position();

		// Calculate the relative position where (0,0) is the center of the image
		relativeX = (focalPointPos.x - imageRect.x) / imageRect.width - 0.5;
		relativeY = (focalPointPos.y - imageRect.y) / imageRect.height - 0.5;

		// Trigger reactivity manually
		relativeX = Number(relativeX.toFixed(2));
		relativeY = Number(relativeY.toFixed(2));

		onFocalpoint({ x: relativeX, y: relativeY });
		layer.draw();
	}

	function resetFocalPoint() {
		// Reset focal point to the center of the image
		createFocalPoint();
		layer.draw();
	}

	function exitFocalPoint() {
		onFocalpointApplied();
	}

	function removeFocalPoint() {
		// Remove the focal point
		if (focalPoint) {
			focalPoint.destroy();
			focalPoint = null;
			focalPointActive = false;
			relativeX = 0;
			relativeY = 0;
			onFocalpointRemoved();
		}
		layer.draw();
	}
</script>

<!-- Focal Point Controls UI -->
<div class="wrapper">
	<div class="flex w-full items-center justify-between">
		<div class="flex items-center gap-2">
			<!-- Back button at top of component -->
			<button onclick={exitFocalPoint} aria-label="Exit rotation mode" class="variant-outline-tertiary btn-icon">
				<iconify-icon icon="material-symbols:close-rounded" width="20"></iconify-icon>
			</button>

			<h3 class="relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Rotation Settings</h3>
		</div>

		<!-- Action Buttons -->
		<div class="mt-4 flex justify-around gap-4">
			<button onclick={removeFocalPoint} class="variant-filled-error btn" aria-label="Remove focal point"> Remove Focal Point </button>
			<button onclick={resetFocalPoint} class="variant-filled-primary btn" aria-label="Reset focal point to center"> Reset Focal Point </button>
		</div>
	</div>

	<div class="flex flex-col items-center justify-around space-y-2">
		<p class="text-sm font-medium">Focal Point Position:</p>
		<div class="flex space-x-4">
			<p class="text-sm">
				X: <span class="text-tertiary-500 dark:text-primary-500">{relativeX.toFixed(2)}</span>
			</p>
			<p class="text-sm">
				Y: <span class="text-tertiary-500 dark:text-primary-500">{relativeY.toFixed(2)}</span>
			</p>
		</div>
	</div>
</div>
