<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	// Use export to define your props
	export let focalPoint = { x: 0, y: 0 };
	export let CONT_WIDTH = 0;
	export let CONT_HEIGHT = 0;

	let isDragging = false;
	let containerRef;
	let iconRef;

	function handleMouseDown(event) {
		isDragging = true;
		handleMove(event);
	}

	function handleMouseMove(event) {
		if (!isDragging) return;
		handleMove(event);
	}

	function handleMove(event) {
		const containerRect = containerRef.getBoundingClientRect();
		const iconRect = iconRef.getBoundingClientRect();
		const x = event.clientX - containerRect.left - iconRect.width / 2;
		const y = event.clientY - containerRect.top - iconRect.height / 2;

		focalPoint = { x, y };
		dispatch('move', { x, y });
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function handleTouchStart(event) {
		isDragging = true;
		handleTouchMove(event);
	}

	function handleTouchMove(event) {
		if (!isDragging) return;
		event.preventDefault(); // Prevent scrolling on touch devices
		const touch = event.touches[0];
		handleMove(touch);
	}

	function handleTouchEnd() {
		isDragging = false;
	}

	function handleKeyDown(event) {
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault(); // Prevent scrolling with arrow keys
		}

		let x = focalPoint.x;
		let y = focalPoint.y;

		switch (event.key) {
			case 'ArrowUp':
				y -= 1;
				break;
			case 'ArrowDown':
				y += 1;
				break;
			case 'ArrowLeft':
				x -= 1;
				break;
			case 'ArrowRight':
				x += 1;
				break;
			default:
				return; // Exit early if key is not an arrow key
		}

		focalPoint = { x, y };
		dispatch('move', { x, y });
	}
</script>

<button
	bind:this={containerRef}
	class="relative overflow-hidden"
	style={`width: ${CONT_WIDTH}px; height: ${CONT_HEIGHT}px;`}
	on:mousedown={handleMouseDown}
	on:mousemove={handleMouseMove}
	on:mouseup={handleMouseUp}
	on:mouseleave={handleMouseUp}
	on:touchstart={handleTouchStart}
	on:touchmove={handleTouchMove}
	on:touchend={handleTouchEnd}
	on:touchcancel={handleTouchEnd}
	on:keydown={handleKeyDown}
	tabindex="0"
>
	<iconify-icon
		bind:this={iconRef}
		icon="bi:plus-circle-fill"
		width="30"
		class="absolute cursor-move rounded-full border-2 border-surface-500"
		style={`left: ${focalPoint.x}px; top: ${focalPoint.y}px;`}
	/>
</button>
