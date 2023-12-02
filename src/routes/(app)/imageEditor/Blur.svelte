<!-- Blur.svelte -->
<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';

	// Define your props for the Blur.svelte component
	export let image: File | null | undefined;
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
				blurTop += event.detail.y;
				blurLeft += event.detail.x;
				break;
			case 'TopRight':
				blurTop += event.detail.y;
				blurRight -= event.detail.x;
				break;
			case 'BottomLeft':
				blurBottom -= event.detail.y;
				blurLeft += event.detail.x;
				break;
			case 'BottomRight':
				blurBottom -= event.detail.y;
				blurRight -= event.detail.x;
				break;
			case 'Center':
				blurCenter += event.detail.x;
				blurCenter += event.detail.y;
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
</script>

<div class="relative" style={`width: ${CONT_WIDTH}; height: ${CONT_HEIGHT};`}>
	<!-- Wrap the blur area element inside the MouseHandler component tag -->
	<MouseHandler on:move={handleMove} on:resize={handleResize} let:mouseHandlerProps>
		<!-- Use an if block to conditionally render the blur area based on the image prop -->
		{#if image}
			<!-- Use some CSS filters to create a blur effect on the image -->
			<img
				src={URL.createObjectURL(image)}
				alt={image ? 'Decorative Image' : ''}
				class="h-full w-full object-contain filter"
				style={`filter: blur(${blurAmount}px);`}
			/>
			<!-- Use a button element to delete the blur area -->
			<!-- Delete Content -->
			<button type="button" on:click={handleDelete} class="gradient-error gradient-error-hover gradient-error-focus btn-icon absolute left-2 top-2">
				<iconify-icon icon="icomoon-free:bin" width="24" />
			</button>
		{/if}

		<!-- Pass the new props to the slot tag -->
		<slot {...mouseHandlerProps} />
	</MouseHandler>
</div>
