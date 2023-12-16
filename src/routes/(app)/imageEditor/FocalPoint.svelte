<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	// Define ImageSize for Overlay
	export let CONT_WIDTH: number;
	export let CONT_HEIGHT: number;

	// Define your props for the FocalPoint.svelte component that considers the image dimensions
	export let focalPointCenter: { x: number; y: number } = { x: CONT_WIDTH / 2, y: CONT_HEIGHT / 2 };

	// Define a function to handle the drag event from the MouseHandler component
	function handleMove(event: any) {
		if (event.detail.x !== undefined && event.detail.y !== undefined) {
			// Update the focal point coordinates with the event data

			// Add constraints to keep the focal point within the image
			focalPointCenter.x = Math.max(0, Math.min(CONT_WIDTH, event.detail.x));
			focalPointCenter.y = Math.max(0, Math.min(CONT_HEIGHT, event.detail.y));

			// Dispatch an event to notify the parent component about the updated focal point
			dispatch('updateFocalPoint', focalPointCenter);
		}
	}
</script>

<div class="relative" style={`width: ${CONT_WIDTH}px; height: ${CONT_HEIGHT}px;`}>
	<!-- Wrap the image element inside the MouseHandler component tag -->
	<MouseHandler on:move={handleMove}>
		<!-- Use the focal point coordinates to render the focal point indicator -->
		<div class="absolute text-primary-500" style={`left: ${focalPointCenter.x}px; top: ${focalPointCenter.y}px;`}>
			<iconify-icon icon="bi:plus-circle-fill" width="30" />
		</div>
	</MouseHandler>
</div>
