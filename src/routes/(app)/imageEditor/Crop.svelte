<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';

	export let cropShape: 'rect' | 'round' = 'rect'; // The shape of the crop area
	export let cropTop = 100;
	export let cropLeft = 100;
	export let cropRight = 300;
	export let cropBottom = 300;
	export let cropCenter = 0;

	// Define ImageSize for Overlay
	export let CONT_WIDTH: number;
	export let CONT_HEIGHT: number;

	function handleMove(event: { detail: { x: number; y: number } }) {
		// Calculate the center of the image
		let imageCenterX = CONT_WIDTH / 2;
		let imageCenterY = CONT_HEIGHT / 2;

		// Calculate the offset from the center of the image
		let offsetX = event.detail.x - imageCenterX;
		let offsetY = event.detail.y - imageCenterY;

		// Adjust the crop area position based on the offset
		cropLeft -= offsetX;
		cropTop -= offsetY;

		// Update the cropCenter variable for responsive resizing
		cropCenter = (cropLeft + cropRight) / 2;
	}

	function handleResize(event: { detail: { x: number; y: number; corner: string } }) {
		console.log('Resize event handled');
		// Update the separate variables based on corner
		switch (event.detail.corner) {
			case 'TopLeft':
				cropTop += event.detail.y;
				cropLeft += event.detail.x;
				break;
			case 'TopRight':
				cropTop += event.detail.y;
				cropRight -= event.detail.x;
				break;
			case 'BottomLeft':
				cropBottom -= event.detail.y;
				cropLeft += event.detail.x;
				break;
			case 'BottomRight':
				cropBottom -= event.detail.y;
				cropRight -= event.detail.x;
				break;
			case 'Center':
				cropCenter += event.detail.x;
				cropCenter += event.detail.y;
				break;
			default:
				break;
		}
	}
</script>

<div class="relative" style={`width: ${CONT_WIDTH}; height: ${CONT_HEIGHT};`}>
	<!-- Wrap the crop area element inside the MouseHandler component tag -->
	<MouseHandler on:move={handleMove} on:resize={handleResize}>
		<!-- Use some CSS properties to create a shape for the crop area element -->
		<div
			class="crop-area absolute border-4 border-error-500 bg-white bg-opacity-20"
			style={`top: ${cropTop}px; left: ${cropLeft}px; width: ${cropRight - cropLeft}px; height: ${cropBottom - cropTop}px; border-radius: ${
				cropShape === 'round' ? '50%' : '0'
			};`}
		>
			<!-- Add 4 div elements with the corner class and data-corner attribute to make them draggable -->
			<div class="corner top-left" data-corner="TopLeft"></div>
			<div class="corner top-right" data-corner="TopRight"></div>
			<div class="corner bottom-left" data-corner="BottomLeft"></div>
			<div class="corner bottom-right" data-corner="BottomRight"></div>

			<!-- Add additional corners and lines to create a 3x3 grid -->
			<div class="corner" data-corner="TopLeft"></div>
			<div class="corner" data-corner="TopRight"></div>
			<div class="corner" data-corner="BottomLeft"></div>
			<div class="corner" data-corner="BottomRight"></div>

			<!-- Add a div element for the Center -->
			<div class="corner" data-corner="Center"></div>
		</div>
	</MouseHandler>

	<!-- Pass the new props to the slot tag -->
	<slot />
</div>

<style lang="postcss">
	.corner {
		position: absolute;
		width: 10px;
		height: 10px;
		background-color: greenyellow;
		border: 1px solid darkgray;
		border-radius: 50%;
		cursor: pointer;
	}
	.corner[data-corner='TopLeft'] {
		top: 10px;
		left: 10px;
		cursor: nwse-resize;
	}
	.corner[data-corner='TopRight'] {
		top: 10px;
		right: 10px;
		cursor: nesw-resize;
	}
	.corner[data-corner='BottomLeft'] {
		bottom: 10px;
		left: 10px;
		cursor: nesw-resize;
	}
	.corner[data-corner='BottomRight'] {
		bottom: 10px;
		right: 10px;
		cursor: nwse-resize;
	}

	.corner[data-corner='Center'] {
		background-color: blue;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 20px;
		height: 20px;
		border: 1px solid white;
		cursor: move;
	}
</style>
