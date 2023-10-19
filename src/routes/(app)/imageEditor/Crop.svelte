<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';

	// Define your props and logic for the Crop.svelte component
	export let image: File | null | undefined;
	export let aspect: number = 1; // The aspect ratio of the crop area
	export let minZoom: number = 1; // The minimum zoom of the image
	export let maxZoom: number = 3; // The maximum zoom of the image
	export let cropShape: 'rect' | 'round' = 'rect'; // The shape of the crop area

	// Initialize the crop value with default values
	let crop = {
		x: 0, // The horizontal position of the image center
		y: 0, // The vertical position of the image center
		rotation: 0, // The rotation angle of the image in degrees
		scale: 1, // The scale factor of the image
		top: 10,  // Adjust these values to make the crop box smaller
		left: 10, // Adjust these values to make the crop box smaller
		right: 10, // Adjust these values to make the crop box smaller
		bottom: 10, // Adjust these values to make the crop box smaller
		width: 100,
    	height: 100
	};

	// Define a function to handle the move event from the MouseHandler component
	function handleMove(event) {
		//console.log('Move event handled');

		// Update the crop value with the event data
		crop.x += event.detail.x;
		crop.y += event.detail.y;
	}

	// Define a function to handle the resize event from the MouseHandler component
	function handleResize(event) {
		//console.log('Resize event handled');

		// Update the crop object scale
		crop.scale += event.detail.y / (maxZoom - minZoom);

		// Define a minimum size for the crop area in pixels
		const minSize = 50;

		// Use a switch statement to handle the different cases for the corners
		switch (event.detail.corner) {
			case 'top-left':
				if (crop.scale * (maxZoom - minZoom) - event.detail.y > minSize) {
					crop.scale -= event.detail.y / (maxZoom - minZoom);
				}
				crop.x += event.detail.x;
				break;
			case 'top-right':
				if (crop.scale * (maxZoom - minZoom) - event.detail.y > minSize) {
					crop.scale -= event.detail.y / (maxZoom - minZoom);
				}
				crop.x -= event.detail.x;
				break;
			case 'bottom-left':
				if (crop.scale * (maxZoom - minZoom) + event.detail.y > minSize) {
					crop.scale += event.detail.y / (maxZoom - minZoom);
				}
				crop.x += event.detail.x;
				break;
			case 'bottom-right':
				if (crop.scale * (maxZoom - minZoom) + event.detail.y > minSize) {
					crop.scale += event.detail.y / (maxZoom - minZoom);
				}
				crop.x -= event.detail.x;
				break;
			default:
				break;
		}

		// Update the crop object with new values based on corner
		switch (event.detail.corner) {
			case 'top-left':
				crop.top += event.detail.y;
				crop.left += event.detail.x;
				break;
			case 'top-right':
				crop.top += event.detail.y;
				crop.right -= event.detail.x;
				break;
			case 'bottom-left':
				crop.bottom -= event.detail.y;
				crop.left += event.detail.x;
				break;
			case 'bottom-right':
				crop.bottom -= event.detail.y;
				crop.right -= event.detail.x;
				break;
			default:
				break;
		}
	}
</script>

<div class="relative left-[5%] top-[5%] h-[90%] w-[90%] border border-white">
	<!-- Wrap the crop area element inside the MouseHandler component tag -->
	<MouseHandler on:move={handleMove} on:resize={handleResize} let:props>
		<!-- Use an if block to conditionally render the crop area based on the image prop -->


		{#if image}
			<!-- <img src={URL.createObjectURL(image)} alt="Image" class="h-full w-full object-contain brightness-75 contrast-50 filter" /> -->

			<!-- Use some CSS properties to create a shape for the crop area element -->
			<div
				class="absolute border border-white"
				style={`top: calc(50% + ${crop.top}px + ${crop.y}px); left: calc(50% + ${crop.left}px + ${crop.x}px); width: ${
					crop.right - props.cropLeft
				}px; height: ${props.cropBottom - props.cropTop}px; transform: translate(-50%, -50%) scale(${crop.scale}) rotate(${
					crop.rotation
				}deg); clip-path: ${cropShape === 'rect' ? 'none' : 'circle(50%)'};`}
			>
				<!-- Corners -->
				<div class="corner absolute left-0 top-0 h-2 w-2 cursor-pointer border border-white bg-white" data-corner="top-left"></div>
				<div class="corner absolute right-0 top-0 h-2 w-2 cursor-pointer border border-white bg-white" data-corner="top-right"></div>
				<div class="corner absolute bottom-0 left-0 h-2 w-2 cursor-pointer border border-white bg-white" data-corner="bottom-left"></div>
				<div class="corner absolute bottom-0 right-0 h-2 w-2 cursor-pointer border border-white bg-white" data-corner="bottom-right"></div>
			</div>
		{/if}
	</MouseHandler>
</div>

