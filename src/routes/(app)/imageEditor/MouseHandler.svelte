<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	// Constants for CSS Properties
	const BORDER_COLOR = 'var(--primary-500)';
	const BACKGROUND_COLOR = 'var(--bg-2)';
	const CURSOR_STYLE = 'move';

	// Use export to define your props
	export let TopLeft: number = 0;
	export let TopRight: number = 0;
	export let BottomLeft: number = 0;
	export let BottomRight: number = 0;
	export let Center: number = 0;
	export let Rotate: number = 0;

	// Define an interface for the mouseHandlerProps
	interface MouseHandlerProps {
		TopLeft: number;
		TopRight: number;
		BottomLeft: number;
		BottomRight: number;
		Center: number;
		Rotate: number;
	}

	// Combine the properties into an object
	export const mouseHandlerProps: MouseHandlerProps = {
		TopLeft,
		TopRight,
		BottomLeft,
		BottomRight,
		Center,
		Rotate
	};

	let element: HTMLElement | null; // The reference to the div element
	let selectedCorner: string | null; // The selected corner for resizing
	let moving: boolean = false; // Track if the mouse is moving
	let down: boolean = false; // Track if the mouse is clicked down
	let initialMousePosition: { x: number; y: number } | null = null; // Initial mouse position for handling slight movements
	let isMouseDown: boolean = false; // Track if the mouse button is pressed
	const movementThreshold = 2; // Adjust the threshold value as needed

	// Function to handle mouse move event
	export function handleMouseMove(e: MouseEvent): void {
		handleMove(e.clientX, e.clientY);
	}

	// Function to handle touch move event
	export function handleTouchMove(e: TouchEvent): void {
		const touch = e.touches[0];
		handleMove(touch.clientX, touch.clientY);
	}

	function handleMove(clientX: number, clientY: number): void {
		moving = true;
		//console.log('Mouse move event triggered');

		// Get the size and position of the element
		const { width, height, left, top } = element!.getBoundingClientRect();

		// Calculate the deltas based on the mouse position and the element position
		const deltaX = clientX - left;
		const deltaY = clientY - top;

		// Check if the mouse is moving the whole element or a corner
		if (moving && !selectedCorner) {
			if (initialMousePosition) {
				const distanceX = Math.abs(clientX - initialMousePosition.x);
				const distanceY = Math.abs(clientY - initialMousePosition.y);

				// Check if the mouse has moved beyond the threshold
				if (distanceX >= movementThreshold || distanceY >= movementThreshold) {
					// Dispatch the move event with the deltas
					dispatch('move', { x: deltaX - TopLeft, y: deltaY - TopLeft });
				}
			} else {
				initialMousePosition = { x: clientX, y: clientY };
			}
		} else if (moving && selectedCorner) {
			// Use a switch statement to handle the different cases for the corners
			switch (selectedCorner) {
				case 'TopLeft':
					// Dispatch the resize event with the deltas and the corner
					dispatch('resize', { x: deltaX - TopLeft, y: deltaY - TopLeft, corner: 'TopLeft' });
					break;
				case 'TopRight':
					// Dispatch the resize event with the deltas and the corner
					dispatch('resize', { x: width - deltaX - TopRight, y: deltaY - TopRight, corner: 'TopRight' });
					break;
				case 'BottomLeft':
					// Dispatch the resize event with the deltas and the corner
					dispatch('resize', { x: deltaX - BottomLeft, y: height - deltaY - BottomLeft, corner: 'BottomLeft' });
					break;
				case 'BottomRight':
					// Dispatch the resize event with the deltas and the corner
					dispatch('resize', { x: width - deltaX - BottomRight, y: height - deltaY - BottomRight, corner: 'BottomRight' });
					break;
				case 'Center':
					// Dispatch the resize event with the deltas and the corner
					dispatch('resize', { x: deltaX - Center, y: deltaY - Center, corner: 'Center' });
					break;
				default:
					break;
			}
		}
	}

	export function handleKeyDown(event: KeyboardEvent): void {
		if (event.key === 'ArrowUp') {
			dispatch('move', { x: 0, y: -1 });
		} else if (event.key === 'ArrowDown') {
			dispatch('move', { x: 0, y: 1 });
		} else if (event.key === 'ArrowLeft') {
			dispatch('move', { x: -1, y: 0 });
		} else if (event.key === 'ArrowRight') {
			dispatch('move', { x: 1, y: 0 });
		}
	}

	// Function to handle mouse up event
	export function handleMouseDown(e: MouseEvent): void {
		handleDown(e);
		isMouseDown = true;
		// Reset the selected corner and initial mouse position
		selectedCorner = null;
		initialMousePosition = null;
	}

	// Function to handle touch end event
	export function handleTouchStart(e: TouchEvent): void {
		const touch = e.touches[0];
		handleDown(touch);
		isMouseDown = true;
		// Reset the selected corner and initial mouse position
		selectedCorner = null;
		initialMousePosition = null;
	}

	function handleDown(e: MouseEvent | Touch): void {
		down = true;
		console.log('Mouse down event triggered');

		// Check if the event is a MouseEvent and preventDefault if it is
		if (e instanceof MouseEvent) {
			e.preventDefault();
		}

		const touchOrMouseEvent = e instanceof Touch ? e : (e as MouseEvent);

		const corner = touchOrMouseEvent.target instanceof HTMLElement ? touchOrMouseEvent.target.closest('.corner') : null;
		if (corner) {
			// Set the selected corner
			selectedCorner = corner.getAttribute('data-corner');
		}
	}

	// Function to handle mouse up event
	export function handleMouseUp(e: MouseEvent): void {
		handleUpMouse(e);
		isMouseDown = false;
	}

	// Function to handle touch end event
	export function handleTouchEnd(e: TouchEvent): void {
		handleUpTouch(e);
		isMouseDown = false;
	}

	function handleUpMouse(e: MouseEvent): void {
		down = false;
		console.log('Mouse up event triggered');

		// Reset the selected corner
		selectedCorner = null;

		// Additional handling specific to MouseEvent if needed
	}

	function handleUpTouch(e: TouchEvent): void {
		down = false;
		console.log('Touch end event triggered');

		// Reset the selected corner
		selectedCorner = null;

		// Additional handling specific to TouchEvent if needed
	}

	// Additional styles for the div element to set the cursor based on mouse button state
	let cursorStyle: string = 'var(--cursor)';
	$: {
		cursorStyle = isMouseDown ? 'grabbing' : 'var(--cursor)';
	}
</script>

<!-- Use a div element instead of a button element -->
<div
	class="my-component"
	bind:this={element}
	on:keydown={handleKeyDown}
	on:mousedown={handleMouseDown}
	on:mouseup={handleMouseUp}
	on:mousemove={handleMouseMove}
	on:touchstart={handleTouchStart}
	on:touchend={handleTouchEnd}
	on:touchmove={handleTouchMove}
	role="presentation"
	aria-grabbed={down}
	aria-dropeffect="move"
	style={`--border-color: ${BORDER_COLOR}; --background-color: ${BACKGROUND_COLOR}; --cursor: ${CURSOR_STYLE};`}
>
	<!-- Use slots to pass HTML content from the parent component -->
	<slot {TopLeft} {TopRight} {BottomLeft} {BottomRight} {Center} {Rotate} />
</div>

<style lang="postcss">
	.my-component {
		/* Add some styles to the div element */
		border: 2px solid var(--border-color);
		background-color: var(--background-color);
		cursor: var(--cursor);
	}
</style>
