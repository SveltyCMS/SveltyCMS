<!-- Crop.svelte -->
<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';

	// Define your props for the Crop.svelte component
	export let cropShape: 'rect' | 'round' = 'rect'; // The shape of the crop area
	export let cropTop: number;
	export let cropLeft: number;
	export let cropRight: number;
	export let cropBottom: number;
	export let cropCenter: number;

	// Define ImageSize for Overlay
	export let CONT_WIDTH: number;
	export let CONT_HEIGHT: number;

	// Define a function to handle the move event from the MouseHandler component
	function handleMove(event: { detail: { x: number; y: number } }) {
		// Update the separate variables with the event data
		cropCenter += event.detail.x;
		cropCenter += event.detail.y;
	}

	// Define a function to handle the resize event from the MouseHandler component
	function handleResize(event: { detail: { x: number; y: number; corner: string } }) {
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
			class="absolute border border-white"
			style={`top: calc(50% + ${cropTop}px + ${cropCenter}px); left: calc(50% + ${cropLeft}px + ${cropCenter}px); width: ${
				cropRight - cropLeft
			}px; height: ${cropBottom - cropTop}px; transform: translate(-50%, -50%); border-radius: ${cropShape === 'round' ? '50%' : '0'};`}
		>
			<!-- Add 4 div elements with the corner class and data-corner attribute to make them draggable -->
			<div class="corner" data-corner="TopLeft"></div>
			<div class="corner" data-corner="TopRight"></div>
			<div class="corner" data-corner="BottomLeft"></div>
			<div class="corner" data-corner="BottomRight"></div>
			<!-- Add a div element for the Center -->
			<div class="corner" data-corner="Center"></div>
		</div>

		<!-- Pass the new props to the slot tag -->
		<slot />
	</MouseHandler>
</div>

<style>
	.corner {
		position: absolute;
		width: 10px;
		height: 10px;
		background-color: white;
		border: 2px solid black;
		cursor: pointer;
	}
	.corner[data-corner='TopLeft'] {
		top: -5px;
		left: -5px;
	}
	.corner[data-corner='TopRight'] {
		top: -5px;
		right: -5px;
	}
	.corner[data-corner='BottomLeft'] {
		bottom: -5px;
		left: -5px;
	}
	.corner[data-corner='BottomRight'] {
		bottom: -5px;
		right: -5px;
	}
	.corner[data-corner='Center'] {
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}
</style>
