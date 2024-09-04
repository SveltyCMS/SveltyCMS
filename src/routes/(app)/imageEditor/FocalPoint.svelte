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
	const dispatch = createEventDispatcher();

	onMount(() => {
		createFocalPoint(); // Ensure focal point is created at the center when component mounts
		setupEventListeners();
	});

	function createFocalPoint() {
		// Ensure only one focal point exists by destroying the previous one if it exists
		if (focalPoint) {
			focalPoint.destroy();
		}

		focalPoint = new Konva.Group({
			x: stage.width() / 2,
			y: stage.height() / 2,
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

		updateFocalPoint();
		focalPointActive = true; // Ensure the focal point is marked as active
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

		const relativeX = (focalPointPos.x - imageRect.x) / imageRect.width;
		const relativeY = (focalPointPos.y - imageRect.y) / imageRect.height;

		dispatch('focalPointChange', { x: relativeX, y: relativeY });
		layer.draw();
	}

	function toggleFocalPoint() {
		if (focalPointActive) {
			// Remove the focal point
			focalPoint?.destroy();
			focalPoint = null;
			focalPointActive = false;
		} else {
			// Reset focal point to center
			createFocalPoint();
		}
		layer.draw();
	}
</script>

<div class="focal-point-controls bg-base-800 absolute bottom-4 right-4 z-50 rounded-md p-2 text-white shadow-lg">
	<button class="btn-secondary btn" on:click={toggleFocalPoint}>
		{focalPointActive ? 'Remove' : 'Reset'} Focal Point
	</button>
</div>
