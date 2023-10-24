<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';

	// Define your props and logic for the Crop.svelte component
	export let image: File | null | undefined;
	export let aspect: number = 1; // The aspect ratio of the crop area
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

		// Update the crop object with new values based on corner
		switch (event.detail.corner) {
			case 'TopLeft':
				crop.top += event.detail.y;
				crop.left += event.detail.x;
				break;
			case 'TopRight':
				crop.top += event.detail.y;
				crop.right -= event.detail.x;
				break;
			case 'BottomLeft':
				crop.bottom -= event.detail.y;
				crop.left += event.detail.x;
				break;
			case 'BottomRight':
				crop.bottom -= event.detail.y;
				crop.right -= event.detail.x;
				break;
			default:
				break;
		}
		
        // Calculate the new width and height of the crop area based on aspect ratio
        const newWidth = Math.min(crop.right - crop.left, (crop.bottom - crop.top) * aspect);
        const newHeight = Math.min(crop.bottom - crop.top, (crop.right - crop.left) / aspect);

        // Adjust the corners to maintain the aspect ratio
        switch (event.detail.corner) {
            case 'TopLeft':
                crop.left = crop.right - newWidth;
                crop.top = crop.bottom - newHeight;
                break;
            case 'TopRight':
                crop.right = crop.left + newWidth;
                crop.top = crop.bottom - newHeight;
                break;
            case 'BottomLeft':
                crop.left = crop.right - newWidth;
                crop.bottom = crop.top + newHeight;
                break;
            case 'BottomRight':
                crop.right = crop.left + newWidth;
                crop.bottom = crop.top + newHeight;
                break;
            default:
                break;
        }
        
        // Update the crop object scale
        crop.scale = newWidth / crop.width;
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
					props.BottomRight - props.TopLeft
				}px; height: ${props.BottomRight - props.TopLeft}px; transform: translate(-50%, -50%) scale(${crop.scale}) rotate(${props.Rotate}deg); border-radius: ${
					cropShape === 'round' ? '50%' : '0'
				};`}
			>
                <!-- Add 4 div elements with the corner class and data-corner attribute to make them draggable -->
                <div class="corner" data-corner="TopLeft"></div>
                <div class="corner" data-corner="TopRight"></div>
                <div class="corner" data-corner="BottomLeft"></div>
                <div class="corner" data-corner="BottomRight"></div>
            </div>
		{/if}
	</MouseHandler>
</div>

<!-- Pass the new props to the slot tag -->
<slot {TopLeft} {TopRight} {BottomLeft} {BottomRight} {Center} {Rotate}></slot>

<style>
    /* Add some styles for the corner elements */
    .corner {
        position: absolute;
        width: 10px;
        height: 10px;
        background-color: white;
        border: 2px solid black;
        cursor: pointer;
    }

    .corner[data-corner="TopLeft"] {
        top: -5px;
        left: -5px;
    }

    .corner[data-corner="TopRight"] {
        top: -5px;
        right: -5px;
    }

    .corner[data-corner="BottomLeft"] {
        bottom: -5px;
        left: -5px;
    }

    .corner[data-corner="BottomRight"] {
        bottom: -5px;
        right: -5px;
    }
</style>