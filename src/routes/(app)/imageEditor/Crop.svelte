<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';

	// Define your props for the Crop.svelte component
	export let cropTop: number = 10;
	export let cropLeft: number = 10;
	export let cropRight: number = 30;
	export let cropBottom: number = 30;
	export let cropCenter: number = 0;
	export let cropRotate: number = 0;
	export let cropShape: 'rect' | 'round' = 'rect';

	// Define ImageSize for Overlay
	export let CONT_WIDTH: number;
	export let CONT_HEIGHT: number;

	// Function to handle the move event
	function handleMove(event: CustomEvent) {
		const { x, y } = event.detail;
		cropTop += y;
		cropLeft += x;
		cropRight += x;
		cropBottom += y;
	}

	// Function to handle the resize event
	function handleResize(event: CustomEvent) {
		const { x, y, corner } = event.detail;

		switch (corner) {
			case 'TopLeft':
				cropTop += y;
				cropLeft += x;
				break;
			case 'TopRight':
				cropTop += y;
				cropRight -= x;
				break;
			case 'BottomLeft':
				cropBottom -= y;
				cropLeft += x;
				break;
			case 'BottomRight':
				cropBottom -= y;
				cropRight -= x;
				break;
			case 'Center':
				cropTop += y;
				cropLeft += x;
				cropRight += x;
				cropBottom += y;
				break;
		}
	}

	// Function to reset the crop area
	function handleReset() {
		cropTop = (CONT_HEIGHT - 100) / 2;
		cropLeft = (CONT_WIDTH - 100) / 2;
		cropRight = cropLeft + 100;
		cropBottom = cropTop + 100;
		cropCenter = 0;
		cropRotate = 0;
	}
</script>

<div class="relative overflow-hidden" style={`width: ${CONT_WIDTH}px; height: ${CONT_HEIGHT}px;`}>
	<!-- Blurred Background -->
	<div class="backdrop-blur-sm" style={`width: ${CONT_WIDTH}px; height: ${CONT_HEIGHT}px;`}></div>

	<MouseHandler
		bind:TopLeft={cropTop}
		bind:TopRight={cropRight}
		bind:BottomLeft={cropLeft}
		bind:BottomRight={cropBottom}
		bind:Center={cropCenter}
		bind:Rotate={cropRotate}
		{CONT_WIDTH}
		{CONT_HEIGHT}
		on:move={handleMove}
		on:resize={handleResize}
	>
		<!-- Crop Area -->
		<div
			class="absolute overflow-hidden"
			style={`top: ${cropTop}px; left: ${cropLeft}px; width: ${cropRight - cropLeft}px; height: ${cropBottom - cropTop}px;`}
		>
			<!-- reset button -->
			<div class="variant-filled-surface btn-group absolute -top-5 left-1/2 -translate-x-1/2 -translate-y-1/2 divide-x divide-surface-400 rounded-full">
				<button type="button" on:click={handleReset}>
					<iconify-icon icon="ic:round-restart-alt" width="14" />
				</button>
			</div>

			<!-- Crop-border -->
			<div class="absolute left-0 top-0 box-border h-full w-full border-4 border-error-500" />

			<!-- Top left -->
			<div class="corner -left-1 -top-1 !cursor-nwse-resize" data-corner="TopLeft" />
			<!-- Top right -->
			<div class="corner -right-1 -top-1 !cursor-nesw-resize" data-corner="TopRight" />
			<!-- Bottom left -->
			<div class="corner -bottom-1 -left-1 !cursor-nesw-resize" data-corner="BottomLeft" />
			<!-- Bottom right -->
			<div class="corner -bottom-1 -right-1 !cursor-nwse-resize" data-corner="BottomRight" />
			<!-- Center Move  area-->
			<div class="backdrop-blur-node absolute left-0 top-0 h-full w-full cursor-move" data-corner="Center" />
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
</style>