<script lang="ts">
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

	// Declare variables for tracking mouse state
	let isDragging = false;
	let selectedCorner: string | null = null;
	let initialMousePosition: { x: number; y: number } | null = null;

	// Function to handle mouse down event
	function handleMouseDown(e: MouseEvent, corner: string) {
		e.preventDefault();
		isDragging = true;
		selectedCorner = corner;
		initialMousePosition = { x: e.clientX, y: e.clientY };
	}

	// Function to handle mouse move event
	function handleMouseMove(e: MouseEvent) {
		if (!isDragging || !initialMousePosition) return;

		const deltaX = e.clientX - initialMousePosition.x;
		const deltaY = e.clientY - initialMousePosition.y;

		if (selectedCorner === 'TopLeft') {
			cropTop += deltaY;
			cropLeft += deltaX;
		} else if (selectedCorner === 'TopRight') {
			cropTop += deltaY;
			cropRight -= deltaX; // Ensure width increases
		} else if (selectedCorner === 'BottomLeft') {
			cropBottom -= deltaY; // Ensure height increases
			cropLeft += deltaX;
		} else if (selectedCorner === 'BottomRight') {
			cropBottom -= deltaY; // Ensure height increases
			cropRight -= deltaX; // Ensure width increases
		} else if (selectedCorner === 'Center') {
			cropTop += deltaY;
			cropLeft += deltaX;
			cropRight += deltaX;
			cropBottom += deltaY;
		}

		initialMousePosition = { x: e.clientX, y: e.clientY };
	}

	// Function to handle mouse up event
	function handleMouseUp(e: MouseEvent) {
		isDragging = false;
		selectedCorner = null;
		initialMousePosition = null;
	}

	// Function to handle keyboard events
	function handleKeyDown(e: KeyboardEvent) {
		const step = e.shiftKey ? 10 : 1;

		if (e.key === 'ArrowUp') {
			cropTop -= step;
		} else if (e.key === 'ArrowDown') {
			cropBottom += step;
		} else if (e.key === 'ArrowLeft') {
			cropLeft -= step;
		} else if (e.key === 'ArrowRight') {
			cropRight += step;
		}
	}

	// Function to reset the crop area
	function handleReset() {
		cropTop = (CONT_HEIGHT - 100) / 2; // Adjust the initial vertical offset as needed (half the image height - half the desired crop height)
		cropLeft = (CONT_WIDTH - 100) / 2; // Adjust the initial horizontal offset as needed (half the image width - half the desired crop width)
		cropRight = cropLeft + 100; // Adjust the initial crop width as needed
		cropBottom = cropTop + 100; // Adjust the initial crop height as needed
		cropCenter = 0;
		cropRotate = 0;
	}

	// Debounce function to limit the rate at which a function can fire
	const debounce = (func, delay) => {
		let debounceTimer;
		return function () {
			const context = this;
			const args = arguments;
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => func.apply(context, args), delay);
		};
	};

	// Debounced handleMouseMove function
	const debouncedHandleMouseMove = debounce(handleMouseMove, 5);
</script>

<svelte:window on:mousemove={debouncedHandleMouseMove} on:mouseup={handleMouseUp} on:keydown={handleKeyDown} />

<div class="relative overflow-hidden" style={`width: ${CONT_WIDTH}px; height: ${CONT_HEIGHT}px;`}>
	<!-- Blurred Background excluding crop area -->
	<div class="backdrop-blur-sm" style={`width: ${CONT_WIDTH}px; height: ${CONT_HEIGHT}px;`}>
		<div
			class="absolute !backdrop-blur-0"
			style={`top: ${cropTop}px; left: ${cropLeft}px; width: ${cropRight - cropLeft}px; height: ${cropBottom - cropTop}px;`}
		></div>
	</div>

	<!-- Crop Area -->
	<div class="absolute" style={`top: ${cropTop}px; left: ${cropLeft}px; width: ${cropRight - cropLeft}px; height: ${cropBottom - cropTop}px;`}>
		<!-- reset button -->
		<div class="variant-filled-surface btn-group absolute -top-5 left-1/2 -translate-x-1/2 -translate-y-1/2 divide-x divide-surface-400 rounded-full">
			<button type="button" on:click={handleReset} class="">
				<iconify-icon icon="ic:round-restart-alt" width="14" />
			</button>
		</div>

		<!-- Crop-border -->
		<div class="absolute left-0 top-0 box-border h-full w-full border-4 border-error-500" />

		<!-- Top left -->
		<div
			class="corner -left-1 -top-1 !cursor-nwse-resize"
			on:mousedown={(e) => handleMouseDown(e, 'TopLeft')}
			on:touchstart={(e) => handleMouseDown(e, 'TopLeft')}
		/>
		<!-- Top right -->
		<div
			class="corner -right-1 -top-1 !cursor-nesw-resize"
			on:mousedown={(e) => handleMouseDown(e, 'TopRight')}
			on:touchstart={(e) => handleMouseDown(e, 'TopRight')}
		/>
		<!-- Bottom left -->
		<div
			class="corner -bottom-1 -left-1 !cursor-nesw-resize"
			on:mousedown={(e) => handleMouseDown(e, 'BottomLeft')}
			on:touchstart={(e) => handleMouseDown(e, 'BottomLeft')}
		/>
		<!-- Bottom right -->
		<div
			class="corner -bottom-1 -right-1 !cursor-nwse-resize"
			on:mousedown={(e) => handleMouseDown(e, 'BottomRight')}
			on:touchstart={(e) => handleMouseDown(e, 'BottomRight')}
		/>
		<!-- Center Move  area-->
		<div
			class="backdrop-blur-node absolute left-0 top-0 h-full w-full cursor-move"
			on:mousedown={(e) => handleMouseDown(e, 'Center')}
			on:touchstart={(e) => handleMouseDown(e, 'Center')}
		/>
	</div>
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
