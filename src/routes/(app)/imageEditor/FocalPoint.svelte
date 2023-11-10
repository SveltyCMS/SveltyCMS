<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';

	// Define your props for the FocalPoint.svelte component
	export let focalPointCenter: { x: number; y: number } = { x: 0, y: 0 }; // Provide default coordinates

	// Define ImageSize for Overlay
	export let CONT_WIDTH: number;
	export let CONT_HEIGHT: number;

	// Define a function to handle the drag event from the MouseHandler component
	function handleMove(event: any) {
		if (event.detail.x !== undefined && event.detail.y !== undefined) {
			// Update the focal point coordinates with the event data
			focalPointCenter.x = event.detail.x;
			focalPointCenter.y = event.detail.y;
		}
	}
</script>

<div class="relative" style={`width: ${CONT_WIDTH}; height: ${CONT_HEIGHT};`}>
	<!-- Wrap the image element inside the MouseHandler component tag -->
	<MouseHandler on:move={handleMove}>
		<!-- Use the focal point coordinates to render the focal point indicator -->
		<div class="absolute translate-x-1/2 translate-y-1/2 text-primary-500" style={`left: ${focalPointCenter.x}px; top: ${focalPointCenter.y}px;`}>
			<iconify-icon icon="bi:plus-circle-fill" width="30" />
		</div>
	</MouseHandler>
</div>
