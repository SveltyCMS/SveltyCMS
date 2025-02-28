<!--
@file src/components/system/BackgroundPattern.svelte
@component
**Animated SVG Background Pattern Component**
Creates a dynamic animated background with SVG paths that draw themselves
with varying widths, opacities, and colors. The animation is driven by Svelte's motion
Spring class for smooth, physics-based motion.
@example
<BackgroundPattern 
    background="white" 
    startDirection="TopLeft"
    endDirection="BottomRight"
    animationDirection="normal"
/>
@features
- Automatic contrasting colors based on background
- Customizable background color (white or dark)
- Adjustable start and end directions (e.g., TopLeft, BottomRight)
- Smooth spring animations with reduced motion support
- Responsive design
- SVG path optimization
- Support for "normal" and "reverse" animation effects
- Accessibility improvements
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Spring } from 'svelte/motion';

	// Define props with default values
	const {
		background = 'white', // Background color (white or dark)
		startDirection = 'TopLeft', // Start direction of paths
		endDirection = 'BottomRight', // End direction of paths
		animationDirection = 'normal', // Animation direction
		springConfig = { stiffness: 0.15, damping: 0.8 } // Spring animation configuration
	} = $props<{
		background?: 'white' | '#242728'; // Background color
		startDirection?: 'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight'; // Start direction of paths
		endDirection?: 'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight'; // End direction of paths
		animationDirection?: 'normal' | 'reverse'; // Animation direction
		springConfig?: { stiffness: number; damping: number }; // Spring animation configuration
	}>();

	// Generate path data based on start and end directions
	function generatePath(start: string, end: string, index: number, position: number): string {
		// Calculate start coordinates based on direction
		let startX = 0;
		let startY = 0;

		// Start position calculations
		if (start === 'TopLeft') {
			startX = -380 + index * 5 * position;
			startY = -189 - index * 6;
		} else if (start === 'TopRight') {
			startX = 696 - index * 5 * position; // Right edge of SVG
			startY = -189 - index * 6;
		} else if (start === 'MiddleLeft') {
			startX = -380 + index * 5 * position;
			startY = 316 / 2; // Middle of the SVG height
		} else if (start === 'MiddleRight') {
			startX = 696 + index * 5 * position; // Right edge of SVG + offset
			startY = 316 / 2; // Middle of the SVG height
		} else if (start === 'BottomLeft') {
			startX = -380 + index * 5 * position;
			startY = 416 + index * 6;
		} else if (start === 'BottomRight') {
			startX = 696 - index * 5 * position;
			startY = 416 + index * 6;
		}

		// Calculate end coordinates based on direction
		let endX = 0;
		let endY = 0;

		// End position calculations
		if (end === 'TopLeft') {
			endX = -100 + index * 5 * position;
			endY = -100 - index * 6;
		} else if (end === 'TopRight') {
			endX = 796 - index * 5 * position;
			endY = -100 - index * 6;
		} else if (end === 'MiddleLeft') {
			endX = -100 + index * 5 * position;
			endY = 316 / 2; // Middle of the SVG height
		} else if (end === 'MiddleRight') {
			endX = 796 - index * 5 * position;
			endY = 316 / 2; // Middle of the SVG height
		} else if (end === 'BottomLeft') {
			endX = -100 + index * 5 * position;
			endY = 416 + index * 6;
		} else if (end === 'BottomRight') {
			endX = 796 - index * 5 * position;
			endY = 416 + index * 6;
		}

		// Create the SVG path with a bezier curve
		return `M${startX} ${startY}C${startX} ${startY} ${(startX + endX) / 2} ${(startY + endY) / 2} ${endX} ${endY}`;
	}

	// Generate array of path objects with dynamic properties
	const paths = [
		...Array.from({ length: 36 }, (_, i) => ({
			id: i,
			d: generatePath(startDirection, endDirection, i, 1), // First set of paths
			width: 0.5 + i * 0.03,
			opacity: 0.1 + i * 0.03,
			// Automatically use contrasting color based on background
			color:
				background === 'white'
					? `rgba(15,23,42,${0.1 + i * 0.03})` // Dark color for light background
					: `rgba(255,255,255,${0.1 + i * 0.03})`, // Light color for dark background
			delay: i * 50 // Staggered delay for animation
		})),
		...Array.from({ length: 36 }, (_, i) => ({
			id: i + 36, // Offset IDs to avoid conflicts
			d: generatePath(startDirection, endDirection, i, -1), // Mirrored paths
			width: 0.5 + i * 0.03,
			opacity: 0.1 + i * 0.03,
			// Automatically use contrasting color based on background
			color:
				background === 'white'
					? `rgba(15,23,42,${0.1 + i * 0.03})` // Dark color for light background
					: `rgba(255,255,255,${0.1 + i * 0.03})`, // Light color for dark background
			delay: i * 50 + 1800 // Staggered delay for second set of paths
		}))
	];

	// Create Spring instances for animation
	const pathSprings = $state(paths.map(() => new Spring(0.3, { stiffness: springConfig.stiffness, damping: springConfig.damping })));

	// Animation control variables
	let animationTimer: ReturnType<typeof setTimeout>;
	let shouldReduceMotion = false;
	let isAnimating = $state(false);

	// Function to animate all paths with staggered timing
	function animatePaths(targetValue: number) {
		if (!browser || shouldReduceMotion) return;

		isAnimating = true;

		// Animate each path with staggered delays
		paths.forEach((path, i) => {
			setTimeout(() => {
				if (i < pathSprings.length) {
					pathSprings[i].target = targetValue;
				}
			}, path.delay);
		});

		// Schedule the next animation cycle
		animationTimer = setTimeout(() => {
			// Toggle between animation states (0.3 and 0.8)
			animatePaths(targetValue === 0.3 ? 0.8 : 0.3);
		}, 3600); // Full animation cycle duration
	}

	// Initialize animations
	onMount(() => {
		if (browser) {
			// Check if user prefers reduced motion
			shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

			// Only run animations if reduced motion is not preferred
			if (!shouldReduceMotion) {
				// Start the animation cycle
				animatePaths(0.8);
			}
		}
	});

	// Clean up animations when component is destroyed
	onDestroy(() => {
		if (animationTimer) {
			clearTimeout(animationTimer);
		}
	});
</script>

<!-- SVG container with viewBox for proper scaling -->
<svg
	class="absolute inset-0 h-full w-full"
	viewBox="0 0 696 316"
	fill="none"
	aria-label="Background Pattern"
	role="img"
	aria-hidden={false}
	style={`z-index: 0; background-color: ${background};`}
>
	{#each paths as path, i}
		<!-- Render each path with dynamic attributes -->
		<path
			d={path.d}
			stroke={path.color}
			stroke-width={path.width}
			stroke-linecap="round"
			stroke-opacity={path.opacity}
			style={`stroke-dasharray: 1000; stroke-dashoffset: ${1000 * (animationDirection === 'reverse' ? pathSprings[i].current : 1 - pathSprings[i].current)}`}
			aria-hidden="true"
		/>
	{/each}
</svg>
