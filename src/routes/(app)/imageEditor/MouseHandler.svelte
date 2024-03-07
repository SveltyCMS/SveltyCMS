<script lang="ts">
	import { createEventDispatcher } from 'svelte';
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
	export const mouseHandlerProps: MouseHandlerProps = {
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
	let element: HTMLElement | null = null; // The reference to the div element
	let selectedCorner: string | null; // The selected corner for resizing
	let moving: boolean = false; // Track if the mouse is moving
	let down: boolean = false; // Track if the mouse is clicked down
	let initialMousePosition: { x: number; y: number } | null = null; // Initial mouse position for handling slight movements
	let isMouseDown: boolean = true; // Set to true initially to avoid the initial check in handleMouseMove and handleTouchMove
	const movementThreshold = 2; // Adjust the threshold value as needed

	// Function to debounce a function call
	function debounce(func: Function, delay: number) {
		let timeoutId: number;
		return function (this: any, ...args: any[]) {
			const context = this;
			clearTimeout(timeoutId);
			timeoutId = window.setTimeout(() => {
				func.apply(context, args);
			}, delay);
		};
	}

	// Function to handle mouse move event
	export const handleMouseMove = debounce((e: MouseEvent) => {
		console.log('handleMouseMove triggered');
		try {
			handleMove(e.clientX, e.clientY);
		} catch (error) {
			console.error('Error in handleMouseMove:', error);
		}
	}, 20); // Debounce the function to reduce frequency

	// Function to handle touch move event
	export const handleTouchMove = debounce((e: TouchEvent) => {
		console.log('handleTouchMove triggered');
		try {
			const touch = e.touches[0];
			handleMove(touch.clientX, touch.clientY);
		} catch (error) {
			console.error('Error in handleTouchMove:', error);
		}
	}, 20); // Debounce the function to reduce frequency

	function handleMove(clientX: number, clientY: number): void {
		console.log('handleMove triggered');
		console.log('Mouse coordinates:', clientX, clientY);

		if (!initialMousePosition || !element) {
			console.log('Initial mouse position or element not set');
			return;
		}

		moving = true;
		console.log('Mouse move event triggered');

		// Get the size and position of the element
		const { width, height, left, top } = element.getBoundingClientRect();
		console.log('Element dimensions:', width, height, left, top);

		// Calculate the deltas based on the mouse position and the element position
		const deltaX = clientX - left;
		const deltaY = clientY - top;
		console.log('Mouse deltas:', deltaX, deltaY);

		// Check if the mouse is moving the whole element or a corner
		if ((moving && !selectedCorner) || (moving && selectedCorner)) {
			if (initialMousePosition) {
				const distanceX = Math.abs(clientX - initialMousePosition.x);
				const distanceY = Math.abs(clientY - initialMousePosition.y);
				console.log('Distance moved:', distanceX, distanceY);

				// Check if the mouse has moved beyond the threshold
				if (distanceX >= movementThreshold || distanceY >= movementThreshold) {
					console.log('Mouse moved beyond threshold');

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
		console.log('handleKeyDown triggered');
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
	export function handleMouseDown(e: MouseEvent): void {
		console.log('handleMouseDown triggered');
		// if (e.button !== 0) return;

		handleDown(e);
		isMouseDown = true;
		// Reset the selected corner and initial mouse position
		selectedCorner = null;
		initialMousePosition = null;
	}

	// Function to handle touch start event
	export function handleTouchStart(e: TouchEvent): void {
		console.log('handleTouchStart triggered');
		const touch = e.touches[0];
		handleDown(touch);
		isMouseDown = true;
		// Reset the selected corner and initial mouse position
		selectedCorner = null;
		initialMousePosition = null;
	}

	// Function to handle mouse down event
	export function handleDown(e: MouseEvent | TouchEvent): void {
		console.log('handleDown triggered');
		down = true;

		// Check if the event is a MouseEvent and preventDefault if it is
		if (e instanceof MouseEvent) {
			e.preventDefault();

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
	}

	// Function to handle mouse up event
	export function handleMouseUp(e: MouseEvent): void {
		console.log('handleMouseUp triggered');

		handleUpMouse(e);
		isMouseDown = false;
		// Reset the initial mouse position
		initialMousePosition = null;
	}

	// Function to handle touch end event
	export function handleTouchEnd(e: TouchEvent): void {
		console.log('handleTouchEnd triggered');

		handleUpTouch(e);
		isMouseDown = false;
		// Reset the initial mouse position
		initialMousePosition = null;
	}

	function handleUpMouse(e: MouseEvent): void {
		console.log('handleUpMouse triggered');

		down = false;
		// Reset the selected corner
		selectedCorner = null;
	}

	function handleUpTouch(e: TouchEvent): void {
		console.log('handleUpTouch triggered');

		down = false;
		// Reset the selected corner
		selectedCorner = null;
	}
</script>

<div
	class="cursor-default border border-error-500 bg-white"
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
>
	<!-- Use slots to pass HTML content from the parent component -->
	<slot {TopLeft} {TopRight} {BottomLeft} {BottomRight} {Center} {Rotate} />
</div>
