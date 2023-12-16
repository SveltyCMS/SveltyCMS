<!-- Blur.svelte -->
<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';

	import { onMount } from 'svelte';

	// Define your props for the Blur.svelte component
	export let blurAmount: number = 5; // The blur amount in pixels
	export let blurTop: number;
	export let blurLeft: number;
	export let blurRight: number;
	export let blurBottom: number;
	export let blurCenter: number;
	export let blurRotate: number = 0;

	// Define ImageSize for Overlay
	export let CONT_WIDTH: number;
	export let CONT_HEIGHT: number;

	let blurArea;

	onMount(() => {
		// Initialize your blur area here
		// You might use the `sharp` library to apply the blur effect
	});

	// Define a function to handle the move event from the MouseHandler component
	function handleMove(event: { detail: { x: number; y: number } }) {
		console.log('Move event handled');

		// Update the separate variables with the event data
		blurCenter += event.detail.x;
		blurCenter += event.detail.y;
	}

	// Define a function to handle the resize event from the MouseHandler component
	function handleResize(event: { detail: { x: number; y: number; corner: string } }) {
		console.log('Resize event handled');

		// Update the separate variables based on corner
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
	}

	// Define a function to handle the delete event on the blur area
	function handleDelete() {
		console.log('Delete event handled');
		// You can add logic here to reset or remove the blur area
		// For example, you might reset the blur values to their default or set a flag to hide the blur area
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
		console.log('Add  event handled');
		// Update the separate variables with the event data
	}
</script>

<div class="relative" style={`width: ${CONT_WIDTH}; height: ${CONT_HEIGHT};`}>
	<!-- Wrap the blur area element inside the MouseHandler component tag -->
	<MouseHandler on:move={handleMove} on:resize={handleResize}>
		<!-- Use an if block to conditionally render the blur area based on the image prop -->

		<div
			class=" absolute grid grid-cols-3 grid-rows-3 border-4 border-error-500 bg-white bg-opacity-20"
			style={`top: calc(50% + ${blurTop}px + ${blurCenter}px); left: calc(50% + ${blurLeft}px + ${blurCenter}px); width: ${
				blurRight - blurLeft
			}px; height: ${blurBottom - blurTop}px; transform: translate(-50%, -50%); border-radius: `}
		>
			<!-- Use a button elements -->
			<div class="variant-filled-surface btn-group absolute -left-10 -top-10 divide-x divide-surface-400 rounded-full [&>*+*]:border-surface-400">
				<!-- Add Blur -->
				<button type="button" on:click={handleAdd} class="">
					<iconify-icon icon="clarity:clone-solid" width="14" />
				</button>

				<!-- Delete Blur -->
				<button type="button" on:click={handleDelete} class="">
					<iconify-icon icon="icomoon-free:bin" width="12" />
				</button>
			</div>
			<!-- Add 4 div elements with the corner class and data-corner attribute to make them draggable -->
			<div class="corner" data-corner="TopLeft"></div>
			<div class="corner" data-corner="TopRight"></div>
			<div class="corner" data-corner="BottomLeft"></div>
			<div class="corner" data-corner="BottomRight"></div>
			<!-- Add a div element for the Center -->
			<div class="corner" data-corner="Center"></div>
			<!-- Add a div element for the Rotate -->
			<div class="corner" data-corner="Rotate"></div>
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
		top: -25px;
		left: -25px;
	}
	.corner[data-corner='TopRight'] {
		top: -25px;
		right: -25px;
	}
	.corner[data-corner='BottomLeft'] {
		bottom: -25px;
		left: -25px;
	}
	.corner[data-corner='BottomRight'] {
		bottom: -25px;
		right: -25px;
	}
	.corner[data-corner='Center'] {
		background-color: blue;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	.corner[data-corner='Rotate'] {
		background-color: red;
		width: 15px;
		height: 15px;
		top: 50%;
		left: 50%;
		transform: translate(-50%, 200%);
	}
</style>
