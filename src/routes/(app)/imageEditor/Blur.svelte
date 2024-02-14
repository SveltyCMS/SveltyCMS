<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';

	import { onMount } from 'svelte';

	// Define your props for the Blur.svelte component that considers the image dimensions
	// export let blurAmount: number = 5; // The blur amount in pixels
	export let blurTop: number;
	export let blurLeft: number;
	export let blurRight: number;
	export let blurBottom: number;
	export let blurCenter: number;
	export let blurRotate: number = 0;

	// Define ImageSize for Overlay
	export let CONT_WIDTH: number;
	export let CONT_HEIGHT: number;

	onMount(async () => {
		// Initialize your blur area here
		// You might use the `sharp` library to apply the blur effect from +page.server.ts
		// // Create a sharp instance with the image to be blurred
		// const image = sharp('path/to/image.jpg');
		// // Define the blur radius
		const blurRadius = 5;
		// // Apply the blur effect
		// image.blur(blurRadius);
		// // Output the blurred image to a file
		// image.toFile('path/to/blurred_image.jpg');
	});

	function handleMove(event: { detail: { x: number; y: number } }) {
		// console.log('Move event handled');

		// Calculate offset from the image center
		const offsetTop = event.detail.y - CONT_HEIGHT / 2;
		const offsetX = event.detail.x - CONT_WIDTH / 2;

		// Update blur top and left based on the offset
		blurTop = blurCenter + offsetTop;
		blurLeft = blurCenter + offsetX;
	}

	function handleResize(event: { detail: { x: number; y: number; corner: string } }) {
		// console.log('Resize event handled');

		switch (event.detail.corner) {
			case 'TopLeft':
				blurTop = blurTop + event.detail.y;
				blurLeft = blurLeft + event.detail.x;
				break;
			case 'TopRight':
				blurTop = blurTop + event.detail.y;
				blurRight = blurRight - event.detail.x;
				break;
			case 'BottomLeft':
				blurBottom = blurBottom - event.detail.y;
				blurLeft = blurLeft + event.detail.x;
				break;
			case 'BottomRight':
				blurBottom = blurBottom - event.detail.y;
				blurRight = blurRight - event.detail.x;
				break;
			case 'Center':
				blurCenter = blurCenter + event.detail.x;
				blurCenter = blurCenter + event.detail.y;
				break;
			default:
				break;
		}

		// Update the position of the corners based on the new values of blurTop, blurLeft, blurRight, and blurBottom
		const corners = document.querySelectorAll('.corner');
		corners.forEach((corner) => {
			const cornerData = (corner as HTMLElement).dataset.corner;
			if (cornerData === 'TopLeft') {
				(corner as HTMLElement).style.top = `${blurTop}px`;
				(corner as HTMLElement).style.left = `${blurLeft}px`;
			} else if (cornerData === 'TopRight') {
				(corner as HTMLElement).style.top = `${blurTop}px`;
				(corner as HTMLElement).style.right = `${CONT_WIDTH - blurRight}px`;
			} else if (cornerData === 'BottomLeft') {
				(corner as HTMLElement).style.bottom = `${CONT_HEIGHT - blurBottom}px`;
				(corner as HTMLElement).style.left = `${blurLeft}px`;
			} else if (cornerData === 'BottomRight') {
				(corner as HTMLElement).style.bottom = `${CONT_HEIGHT - blurBottom}px`;
				(corner as HTMLElement).style.right = `${CONT_WIDTH - blurRight}px`;
			}
		});
	}

	function handleRotate(event: { detail: { x: number; y: number } }) {
		// console.log('Rotate event handled');

		blurRotate += event.detail.x;
	}

	function handleDelete() {
		// console.log('Delete event handled');

		// You can add logic here to reset or remove the blur area
		blurTop = 0;
		blurLeft = 0;
		blurRight = 0;
		blurBottom = 0;
		blurCenter = 0;
		blurRotate = 0;

		// Set the visible prop to false if you have a visibility control
		//visible = false;
	}

	function handleAdd() {
		// console.log('Add  event handled');
		// Update the separate variables with the event data
	}
</script>

<div class="relative" style={`width: ${CONT_WIDTH}px; height: ${CONT_HEIGHT}px;`}>
	<!-- Wrap the blur area element inside the MouseHandler component tag -->
	<MouseHandler on:move={handleMove} on:resize={handleResize} on:rotate={handleRotate}>
		<!-- Use an if block to conditionally render the blur area based on the image prop -->

		<div
			class="absolute grid grid-cols-2 grid-rows-2"
			style={`top: ${blurTop}px; left: ${blurLeft}px; width: ${blurRight - blurLeft}px; height: ${
				blurBottom - blurTop
			}px; transform: translate(-50%, -50%) rotate(${blurRotate}deg); border-radius: 5px;`}
		>
			<!-- Use a button elements -->
			<div
				class="variant-filled-surface btn-group absolute -top-14 left-0 -translate-x-1/2 -translate-y-1/2 divide-x divide-surface-400 rounded-full"
			>
				<!-- Add Blur -->
				<button type="button" on:click={handleAdd} class="">
					<iconify-icon icon="clarity:clone-solid" width="14" />
				</button>

				<!-- Delete Blur -->
				<button type="button" on:click={handleDelete} class="">
					<iconify-icon icon="icomoon-free:bin" width="12" />
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
			<!-- Add a flexible border lines -->
			<div class="middle-horizontal line"></div>
			<div class="middle-vertical line"></div>
		</div>

		<!-- Pass the new props to the slot tag -->
		<slot />
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
		border: 1px solid blue;
		cursor: move;
	}
	.corner[data-corner='Rotate'] {
		background-color: white;
		border: 2px solid red;
		width: 12px;
		height: 12px;
		top: 26px;
		left: 50%;
		transform: translateX(-50%);
	}
</style>
