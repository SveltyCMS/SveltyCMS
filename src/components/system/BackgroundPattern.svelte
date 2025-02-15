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
	// Import necessary modules
	import { Spring } from 'svelte/motion';
	import { onMount } from 'svelte';

	// Define props using Svelte 5 runes with default values
	const {
		background = 'white', // Background color
		color = '#d3d3d3', // Color of the pattern
		startDirection = 'TopLeft', // Start direction of paths
		endDirection = 'BottomRight', // End direction of paths
		animationDirection = 'normal', // Animation direction
		springConfig = { stiffness: 150, damping: 25 } // Spring animation configuration
	} = $props<{
		background?: 'white' | '#242728'; // Background color
		color?: string; // Color of the pattern
		startDirection?: 'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight'; // Start direction of paths
		endDirection?: 'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight'; // End direction of paths
		animationDirection?: 'normal' | 'reverse'; // Animation direction
		springConfig?: { stiffness: number; damping: number }; // Spring animation configuration
	}>();

	// Determine pattern color based on background
	let patternColor = background === 'white' ? 'black' : color;

	// Function to generate path data based on start and end directions
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
	let pathAnimations: Spring<{ pathLength: number; opacity: number }>[] = [];

	// Set up animations on component mount
	onMount(() => {
		// Query all path elements
		pathElements = Array.from(document.querySelectorAll('svg path'));

		// Initialize Spring animations for each path
		pathAnimations = paths.map((_) => {
			return new Spring(
				{ pathLength: 0.3, opacity: 0.6 }, // Initial state
				{ ...springConfig } // Config
			);
		});

		// Use reactive statements to update path attributes
		pathElements.forEach((pathElement, index) => {
			$: {
				const { pathLength, opacity } = pathAnimations[index].get();
				const dashArray = 1000;
				const dashOffset = dashArray * (animationDirection === 'reverse' ? pathLength : 1 - pathLength);

				// Update path attributes
				pathElement.setAttribute('stroke-dasharray', dashArray.toString());
				pathElement.setAttribute('stroke-dashoffset', dashOffset.toString());
				pathElement.setAttribute('opacity', opacity.toString());
			}

			// Start the animation
			if (animationDirection === 'normal') {
				pathAnimations[index].set({ pathLength: 1, opacity: 0.3 });
			} else if (animationDirection === 'reverse') {
				pathAnimations[index].set({ pathLength: 0, opacity: 0.6 });
			}
		});
	});
</script>

<!-- SVG container with viewBox for proper scaling -->
<svg class="absolute inset-0 h-full w-full" viewBox="0 0 696 316" fill="none" aria-label="Background Pattern">
	{#each paths as path}
		<!-- Render each path with dynamic attributes -->
		<path d={path.d} stroke={patternColor} stroke-width={path.width} stroke-linecap="round" stroke-opacity={path.opacity} />
	{/each}
</svg>
