<!-- 
@file src/routes/(app)/imageEditor/FocalPoint.svelte
@description This component allows users to set or reset a focal point on the image.
-->

<script lang="ts">
	import Konva from 'konva';
	import { onMount, createEventDispatcher } from 'svelte';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let focalPoint: Konva.Group | null = null;
	let focalPointActive = false;
	let relativeX: number = 0;
	let relativeY: number = 0;
	const dispatch = createEventDispatcher();

	onMount(() => {
		createFocalPoint(); // Create focal point at the center of the image when the component mounts
		setupEventListeners();
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

		dispatch('focalPointChange', { x: relativeX, y: relativeY });
		layer.draw();
	}

	function resetFocalPoint() {
		// Reset focal point to the center of the image
		createFocalPoint();
		layer.draw();
	}

	function removeFocalPoint() {
		// Remove the focal point
		if (focalPoint) {
			focalPoint.destroy();
			focalPoint = null;
			focalPointActive = false;
			relativeX = 0;
			relativeY = 0;
			dispatch('focalPointRemoved');
		}
		layer.draw();
	}
</script>

<!-- Focal Point Controls UI -->
<div class="wrapper bg-base-800 fixed bottom-0 left-0 right-0 z-50 flex flex-col space-y-4 p-4 text-white shadow-lg">
	<div class="flex flex-col items-center justify-around space-y-2">
		<p class="text-sm font-medium">Focal Point Position:</p>
		<div class="flex space-x-4">
			<p class="text-sm">X: <span class="text-tertiary-500 dark:text-primary-500">{relativeX.toFixed(2)}</span></p>
			<p class="text-sm">Y: <span class="text-tertiary-500 dark:text-primary-500">{relativeY.toFixed(2)}</span></p>
		</div>
	</div>
	<div class="mt-4 flex justify-around gap-4">
		<button on:click={removeFocalPoint} class="variant-filled-error btn"> Remove Focal Point </button>
		<button on:click={resetFocalPoint} class="variant-filled-primary btn"> Reset Focal Point </button>
	</div>
</div>
