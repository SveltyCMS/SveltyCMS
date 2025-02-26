<!--
@file src/components/system/BackgroundPattern.svelte
@component
**Animated SVG Background Pattern Component**
Creates a dynamic animated background with SVG paths that draw themselves
with varying widths and opacities. The animation is driven by Svelte's Spring
store for smooth, physics-based motion.

@example
<BackgroundPattern 
    background="white" 
    color="#d3d3d3"
    startDirection="TopLeft"
    endDirection="BottomRight"
    animationDirection="normal"
/>
@features
- Customizable background color
- Adjustable start and end directions (e.g., TopLeft, BottomRight)
- Smooth spring animations
- Responsive design
- SVG path optimization
- Support for "normal" and "reverse" animation effects
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Define props with default values
	const {
		background = 'white', // Background color
		color = '#d3d3d3', // Color of the pattern
		startDirection = 'TopLeft', // Start direction of paths
		endDirection = 'BottomRight', // End direction of paths
		animationDirection = 'normal' // Animation direction
	} = $props<{
		background?: 'white' | '#242728'; // Background color
		color?: string; // Color of the pattern
		startDirection?: 'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight'; // Start direction of paths
		endDirection?: 'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight'; // End direction of paths
		animationDirection?: 'normal' | 'reverse'; // Animation direction
		springConfig?: { stiffness: number; damping: number }; // Spring animation configuration
	}>();

	// Set pattern color based on background
	let patternColor = background === 'white' ? 'black' : color;

	// Generate path data based on start and end directions
	function generatePath(start: string, end: string, index: number): string {
		const startX = ['TopLeft', 'MiddleLeft', 'BottomLeft'].includes(start) ? -380 : 616;
		const startY = ['TopLeft', 'TopRight', 'MiddleLeft', 'MiddleRight'].includes(start) ? -189 : 875;
		const endX = ['TopRight', 'MiddleRight', 'BottomRight'].includes(end) ? 684 : 152;
		const endY = ['BottomLeft', 'BottomRight', 'MiddleLeft', 'MiddleRight'].includes(end) ? 875 : 216;

		return `M${startX - index * 5} ${startY + index * 6}C${startX - index * 5} ${startY + index * 6} ${
			(startX + endX) / 2 - index * 5
		} ${(startY + endY) / 2 - index * 6} ${endX - index * 5} ${endY - index * 6}`;
	}

	// Generate array of path objects with dynamic properties
	const paths = Array.from({ length: 36 }, (_, i) => ({
		id: i,
		d: generatePath(startDirection, endDirection, i),
		width: 0.5 + i * 0.03,
		opacity: 0.1 + i * 0.03,
		duration: 20 + Math.random() * 10,
		delay: Math.random() * 1
	}));

	// Initialize arrays to hold path elements and animations
	let pathElements: SVGPathElement[] = [];
	let animationFrameId: number;
	let svgElement: SVGElement;

	// Create a reactive state for path animations
	let pathAnimations = $state<{ pathLength: number; opacity: number }[]>([]);

	// Function to update path animations
	function updatePathAnimations() {
		if (!pathElements.length || !pathAnimations.length) return;

		pathElements.forEach((pathElement, index) => {
			if (index < pathAnimations.length) {
				const { pathLength, opacity } = pathAnimations[index];
				const dashArray = 1000;
				const dashOffset = dashArray * (animationDirection === 'reverse' ? pathLength : 1 - pathLength);

				// Update path attributes
				pathElement.setAttribute('stroke-dasharray', dashArray.toString());
				pathElement.setAttribute('stroke-dashoffset', dashOffset.toString());
				pathElement.setAttribute('opacity', opacity.toString());
			}
		});

		// Continue animation loop
		animationFrameId = requestAnimationFrame(updatePathAnimations);
	}

	// Animation state
	let animationPhase = $state(0); // 0: initial, 1: animating forward, 2: animating backward
	let animationTimer: ReturnType<typeof setTimeout>;

	// Function to animate paths in a continuous loop
	function animatePaths() {
		// Clear any existing timer
		if (animationTimer) clearTimeout(animationTimer);

		// Determine animation direction based on current phase
		const isForward = animationPhase === 0 || animationPhase === 2;

		// Update all paths with staggered delays
		paths.forEach((_, i) => {
			setTimeout(() => {
				if (i < pathAnimations.length) {
					if (isForward) {
						// Animate forward
						pathAnimations[i] = { pathLength: 1, opacity: 0.3 };
					} else {
						// Animate backward
						pathAnimations[i] = { pathLength: 0.3, opacity: 0.6 };
					}
				}
			}, i * 50); // Stagger the animations
		});

		// Schedule the next animation phase after all paths have animated
		animationTimer = setTimeout(
			() => {
				// Toggle animation phase (0 -> 1 -> 2 -> 1 -> 2...)
				animationPhase = animationPhase === 0 ? 1 : animationPhase === 1 ? 2 : 1;
				animatePaths(); // Continue the animation loop
			},
			paths.length * 50 + 3000
		); // Wait for all paths to animate + extra time to view the result
	}

	// Set up animations on component mount
	onMount(() => {
		// Query all path elements within this component's SVG
		pathElements = Array.from(svgElement.querySelectorAll('path'));

		// Initialize animation state for each path
		pathAnimations = paths.map(() => ({ pathLength: 0.3, opacity: 0.6 }));

		// Start the animation loop
		animationFrameId = requestAnimationFrame(updatePathAnimations);

		// Start the continuous animation
		animatePaths();
	});

	// Clean up animations when component is destroyed
	onDestroy(() => {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
		if (animationTimer) {
			clearTimeout(animationTimer);
		}
	});
</script>

<!-- SVG container with viewBox for proper scaling -->
<svg
	bind:this={svgElement}
	class="absolute inset-0 h-full w-full"
	viewBox="0 0 696 316"
	fill="none"
	aria-label="Background Pattern"
	style="z-index: 0;"
>
	{#each paths as path}
		<!-- Render each path with dynamic attributes -->
		<path d={path.d} stroke={patternColor} stroke-width={path.width} stroke-linecap="round" stroke-opacity={path.opacity} />
	{/each}
</svg>
