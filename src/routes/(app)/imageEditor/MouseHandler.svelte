<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	const dispatch = createEventDispatcher();

	// Use export to define your props
	export let TopLeft: number = 0;
	export let TopRight: number = 0;
	export let BottomLeft: number = 0;
	export let BottomRight: number = 0;
	export let Center: number = 0;
	export let Rotate: number = 0;
	export let CONT_WIDTH: number = 0;
	export let CONT_HEIGHT: number = 0;
	export let cropShape: 'rect' | 'round' = 'rect';

	// Define an interface for the mouseHandlerProps
	interface MouseHandlerProps {
		TopLeft: number;
		TopRight: number;
		BottomLeft: number;
		BottomRight: number;
		Center: number;
		Rotate: number;
		CONT_WIDTH: number;
		CONT_HEIGHT: number;
	}

	// Combine the properties into an object
	const mouseHandlerProps: MouseHandlerProps = {
		TopLeft,
		TopRight,
		BottomLeft,
		BottomRight,
		Center,
		Rotate,
		CONT_WIDTH,
		CONT_HEIGHT
	};

	// Declare the element variable
	let element: HTMLElement | null = null;
	let selectedCorner: string | null; // The selected corner for resizing
	let isMouseDown: boolean = false; // Track if the mouse is clicked down
	let initialMousePosition: { x: number; y: number } | null = null; // Initial mouse position for handling slight movements
	const movementThreshold = 2; // Adjust the threshold value as needed

	// Function to handle mouse move event
	const handleMouseMove = (e: MouseEvent) => {
		handleMove(e.clientX, e.clientY);
	};

	// Function to handle touch move event
	const handleTouchMove = (e: TouchEvent) => {
		const touch = e.touches[0];
		handleMove(touch.clientX, touch.clientY);
	};

	function handleMove(clientX: number, clientY: number): void {
		if (!initialMousePosition || !element) {
			return;
		}

		// Get the size and position of the element
		const { width, height, left, top } = element.getBoundingClientRect();

		// Calculate the deltas based on the mouse position and the element position
		const deltaX = clientX - left;
		const deltaY = clientY - top;

		// Check if the mouse is moving the whole element or a corner
		if (isMouseDown && !selectedCorner) {
			const distanceX = Math.abs(clientX - initialMousePosition.x);
			const distanceY = Math.abs(clientY - initialMousePosition.y);

			// Check if the mouse has moved beyond the threshold
			if (distanceX >= movementThreshold || distanceY >= movementThreshold) {
				// Dispatch the move event with the deltas
				dispatch('move', { x: deltaX - TopLeft, y: deltaY - TopLeft });
			}
		} else if (isMouseDown && selectedCorner) {
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
			}
		}
	}

	function handleKeyDown(event: KeyboardEvent): void {
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

	// Function to handle mouse down event
	function handleMouseDown(e: MouseEvent): void {
		if (e.button !== 0) return;

		handleDown(e);
		isMouseDown = true;
		// Reset the selected corner and initial mouse position
		selectedCorner = null;
		initialMousePosition = { x: e.clientX, y: e.clientY };
	}

	// Function to handle touch start event
	function handleTouchStart(e: TouchEvent): void {
		const touch = e.touches[0];
		handleDown(e);
		isMouseDown = true;
		// Reset the selected corner and initial mouse position
		selectedCorner = null;
		initialMousePosition = { x: touch.clientX, y: touch.clientY };
	}

	// Function to handle mouse down event
	function handleDown(e: MouseEvent | TouchEvent): void {
		// Retrieve the target element
		const targetElement = e.target as HTMLElement;

		// Check if the target element is a corner
		if (targetElement.classList.contains('corner')) {
			// Set the selected corner
			selectedCorner = targetElement.getAttribute('data-corner');
		} else {
			// If the target element is not a corner, stop the event from propagating further up the DOM hierarchy
			e.stopPropagation();
		}
	}

	// Function to handle mouse up event
	function handleMouseUp(e: MouseEvent): void {
		handleUp();
		isMouseDown = false;
		// Reset the initial mouse position
		initialMousePosition = null;
	}

	// Function to handle touch end event
	function handleTouchEnd(e: TouchEvent): void {
		handleUp();
		isMouseDown = false;
		// Reset the initial mouse position
		initialMousePosition = null;
	}

	function handleUp(): void {
		// Reset the selected corner
		selectedCorner = null;
	}

	onMount(() => {
		// Add event listeners for keyboard events
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			// Clean up the event listeners when the component is unmounted
			window.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

<div
	class="cursor-default border border-error-500 bg-white"
	bind:this={element}
	on:mousedown={handleMouseDown}
	on:mouseup={handleMouseUp}
	on:mousemove={handleMouseMove}
	on:touchstart|passive={handleTouchStart}
	on:touchend|passive={handleTouchEnd}
	on:touchmove={handleTouchMove}
	role="presentation"
	aria-grabbed={isMouseDown}
	aria-dropeffect="move"
>
	<!-- Use slots to pass HTML content from the parent component -->
	<slot {TopLeft} {TopRight} {BottomLeft} {BottomRight} {Center} {Rotate} />
</div>
