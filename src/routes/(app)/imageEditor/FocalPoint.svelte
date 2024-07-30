<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import MouseHandler from './MouseHandler.svelte';

	const dispatch = createEventDispatcher();

	// Use export to define your props
	export let focalPoint = { x: 0, y: 0 };
	export let CONT_WIDTH = 0;
	export let CONT_HEIGHT = 0;

	let containerRef;
	let iconRef;

	function handleMove(event: { detail: { x: number, y: number } }) {
		const { x, y } = event.detail;
		focalPoint = { x, y };
		dispatch('move', { x, y });
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
			event.preventDefault(); // Prevent scrolling with arrow keys
		}

		let { x, y } = focalPoint;

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
	on:keydown={handleKeyDown}
	tabindex="0"
>
	<MouseHandler
		on:move={handleMove}
		bind:x={focalPoint.x}
		bind:y={focalPoint.y}
		{CONT_WIDTH}
		{CONT_HEIGHT}
	>
		<iconify-icon
			bind:this={iconRef}
			icon="bi:plus-circle-fill"
			width="30"
			class="absolute cursor-move rounded-full border-[3px] border-tertiary-500 bg-black text-white dark:border-primary-500 dark:bg-white dark:text-surface-500"
			style={`left: ${focalPoint.x}px; top: ${focalPoint.y}px;`}
		/>
	</MouseHandler>
</button>