<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';
	import { onMount } from 'svelte';

	// Define your props for the Blur.svelte component
	// export let blurAmount: number = 5; // The blur amount in pixels

	export let blurTop: number = 10;
	export let blurLeft: number = 10;
	export let blurRight: number = 30;
	export let blurBottom: number = 30;
	export let blurCenter: number = 0;
	export let blurRotate: number = 0;

	// Define ImageSize for Overlay
	export let CONT_WIDTH: number;
	export let CONT_HEIGHT: number;

	onMount(async () => {
		// Initialization logic if needed
	});

	function handleMove(event: CustomEvent) {
		const { x, y } = event.detail;
		// Calculate offset from the image center
		const offsetTop = y - CONT_HEIGHT / 2;
		const offsetLeft = x - CONT_WIDTH / 2;

		// Update the blur values
		blurTop += offsetTop;
		blurLeft += offsetLeft;
		blurRight += offsetLeft;
		blurBottom += offsetTop;
	}

	function handleResize(event: CustomEvent) {
		const { x, y, corner } = event.detail;

		switch (corner) {
			case 'TopLeft':
				blurTop += y;
				blurLeft += x;
				break;
			case 'TopRight':
				blurTop += y;
				blurRight -= x;
				break;
			case 'BottomLeft':
				blurBottom -= y;
				blurLeft += x;
				break;
			case 'BottomRight':
				blurBottom -= y;
				blurRight -= x;
				break;
			case 'Center':
				blurTop += y;
				blurLeft += x;
				blurRight += x;
				blurBottom += y;
				break;
		}
	}

	// Function to handle the rotate event
	function handleRotate(event: CustomEvent) {
		const { x } = event.detail;
		blurRotate += x;
	}

	function handleDelete() {
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
		// Logic for adding blur
		// Update the separate variables with the event data
	}
</script>

<div class="relative" style={`width: ${CONT_WIDTH}px; height: ${CONT_HEIGHT}px;`}>
	<!-- Wrap the blur area element inside the MouseHandler component tag -->
	<MouseHandler
		on:move={handleMove}
		on:resize={handleResize}
		on:rotate={handleRotate}
		bind:TopLeft={blurTop}
		bind:TopRight={blurRight}
		bind:BottomLeft={blurLeft}
		bind:BottomRight={blurBottom}
		bind:Center={blurCenter}
		bind:Rotate={blurRotate}
		{CONT_WIDTH}
		{CONT_HEIGHT}
	>
		<div
			class="absolute grid grid-cols-2 grid-rows-2"
			style={`top: ${blurTop}px; left: ${blurLeft}px; width: ${blurRight - blurLeft}px; height: ${
				blurBottom - blurTop
			}px; transform: translate(-50%, -50%) rotate(${blurRotate}deg); border-radius: 5px;`}
		>
			<!-- Button group for add and delete actions -->
			<div
				class="variant-filled-surface btn-group absolute -top-14 left-0 -translate-x-1/2 -translate-y-1/2 divide-x divide-surface-400 rounded-full"
			>
				<!-- Add Blur -->
				<button type="button" on:click={handleAdd}>
					<iconify-icon icon="clarity:clone-solid" width="14" />
				</button>
				<!-- Delete Blur -->
				<button type="button" on:click={handleDelete}>
					<iconify-icon icon="icomoon-free:bin" width="12" />
				</button>
			</div>

			<!-- Corners for resizing and moving -->
			<div class="corner" data-corner="TopLeft"></div>
			<div class="corner" data-corner="TopRight"></div>
			<div class="corner" data-corner="BottomLeft"></div>
			<div class="corner" data-corner="BottomRight"></div>
			<div class="corner" data-corner="Center"></div>
			<div class="corner" data-corner="Rotate"></div>
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
