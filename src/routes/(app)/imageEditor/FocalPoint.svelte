<script lang="ts">
	import MouseHandler from './MouseHandler.svelte';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	// Define ImageSize for Overlay
	export let CONT_WIDTH: number;
	export let CONT_HEIGHT: number;

	// Define your props for the FocalPoint.svelte component that considers the image dimensions
	export let focalPoint: { x: number; y: number } = { x: 0, y: 0 };

	// Define a function to handle the drag event from the MouseHandler component
	export function handleMove(event: any) {
		if (event.detail.x !== undefined && event.detail.y !== undefined) {
			// Update the focal point coordinates with the event data

			// Add constraints to keep the focal point within the image
			focalPoint.x = Math.max(0, Math.min(CONT_WIDTH, event.detail.x));
			focalPoint.y = Math.max(0, Math.min(CONT_HEIGHT, event.detail.y));

			// Dispatch an event to notify the parent component about the updated focal point
			dispatch('updateFocalPoint', focalPoint);
		}
	}
</script>

<div class="relative" style={`width: ${CONT_WIDTH}px; height: ${CONT_HEIGHT}px;`}>
	<!-- Wrap the focal point indicator inside the MouseHandler component -->
	<MouseHandler on:move={handleMove}>
		<!-- Use the focal point coordinates to render the focal point indicator -->
		<div class="absolute text-primary-500" style={`left: ${focalPoint.x}px; top: ${focalPoint.y}px;`}>
			<iconify-icon icon="bi:plus-circle-fill" width="30" />
		</div>
	</MouseHandler>
</div>
