<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';
	import { onMount } from 'svelte';

	// Define your props for the Crop.svelte component
	export let cropTop: number = 100;
	export let cropLeft: number = 100;
	export let cropRight: number = 300;
	export let cropBottom: number = 300;
	export let cropCenter: number = 0;
	export let cropRotate: number = 0;
	export let cropShape: 'rect' | 'round' = 'rect';

	// Define ImageSize for Overlay
	export let CONT_WIDTH: number;
	export let CONT_HEIGHT: number;

	// Initialize your crop area here
	onMount(() => {
		// You might use the `sharp` library to crop the image from +page.server.ts
		// // Create a sharp instance with the image to be cropped
		// const image = sharp('path/to/image.jpg');
		// // Define the crop area
		// const cropArea = {
		//   left: cropLeft,
		//   top: cropTop,
		//   width: cropRight - cropLeft,
		//   height: cropBottom - cropTop,
		// };
		// // Apply the crop effect
		// image.extract(cropArea);
		// // Output the cropped image to a file
		// image.toFile('path/to/cropped_image.jpg');
	});

	function handleMove(event: { detail: { x: number; y: number } }) {
		// Calculate offset from the image center
		const offsetTop = event.detail.y - CONT_HEIGHT / 2;
		const offsetX = event.detail.x - CONT_WIDTH / 2;

		// Update crop top and left based on the offset
		cropTop = cropCenter + offsetTop;
		cropLeft = cropCenter + offsetX;
	}

	function handleResize(event: { detail: { x: number; y: number; corner: string } }) {
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

	function handleRotate(event: { detail: { x: number; y: number } }) {
		cropRotate += event.detail.x;
	}

	function handleReset() {
		// Reset the crop area
		cropTop = 100;
		cropLeft = 100;
		cropRight = 300;
		cropBottom = 300;
		cropCenter = 0;
		cropRotate = 0;
	}
</script>

<div class="relative" style={`width: ${CONT_WIDTH}px; height: ${CONT_HEIGHT}px;`}>
	<!-- Wrap the crop area element inside the MouseHandler component tag -->
	<MouseHandler
		bind:TopLeft={cropLeft}
		bind:TopRight={cropRight}
		bind:BottomLeft={cropLeft}
		bind:BottomRight={cropRight}
		bind:Center={cropCenter}
		bind:Rotate={cropRotate}
		bind:cropShape
		{CONT_WIDTH}
		{CONT_HEIGHT}
		on:move={handleMove}
		on:resize={handleResize}
		on:rotate={handleRotate}
	>
		<div
			class="absolute grid grid-cols-2 grid-rows-2"
			style={`top: ${cropTop}px; left: ${cropLeft}px; width: ${cropRight - cropLeft}px; height: ${
				cropBottom - cropTop
			}px; transform: translate(-50%, -50%) rotate(${cropRotate}deg); border-radius: 5px;`}
		>
			<!-- Use a button element -->
			<div
				class="variant-filled-surface btn-group absolute -top-14 left-0 -translate-x-1/2 -translate-y-1/2 divide-x divide-surface-400 rounded-full"
			>
				<!-- Reset Crop -->
				<button type="button" on:click={handleReset} class="">
					<iconify-icon icon="ic:round-restart-alt" width="14" />
				</button>
			</div>
			<!-- Add additional corners and lines to create a 3x3 grid -->
			<div class="corner" data-corner="TopLeft"></div>
			<div class="corner" data-corner="TopRight"></div>
			<div class="corner" data-corner="BottomLeft"></div>
			<div class="corner" data-corner="BottomRight"></div>
			<!-- Add a div element for the Center -->
			<div class="corner" data-corner="Center"></div>
			<!-- Add a div element for the Rotate -->
			<div class="corner" data-corner="Rotate"></div>
			<!-- Add flexible border lines -->
			<div class="middle-horizontal line"></div>
			<div class="middle-vertical line"></div>
		</div>
	</MouseHandler>
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
