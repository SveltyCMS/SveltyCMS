<!--
@file src/components/system/BackgroundPattern.svelte
@component
**Optimized Animated SVG Background Pattern Component**
Performance-optimized version with reduced path count, hardware acceleration,
and configurable quality settings for weaker devices.

@example
<BackgroundPattern 
    background="white" 
    startDirection="TopLeft"
    endDirection="BottomRight"
    animationDirection="normal"
    quality="medium"
	autoDetectPerformance={true}
/>

### Props
- `background` {'white' | '#242728'}: Background color of the SVG container (default: 'white')
- `startDirection` {'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight'}: Starting point of the paths (default: 'TopLeft')
- `endDirection` {'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight'}: Ending point of the paths (default: 'BottomRight')
- `animationDirection` {'normal' | 'reverse'}: Direction of the animation (default: 'normal')

### Features
- Reduced path count for better performance
- Hardware acceleration with CSS transforms
- Configurable quality settings (low/medium/high)
- Automatic performance detection
- Reduced motion support
- Optimized animations with requestAnimationFrame
- Memory-efficient path generation
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { SvelteMap } from 'svelte/reactivity';

	// Define props with default values
	const {
		background = 'white',
		startDirection = 'TopLeft',
		endDirection = 'BottomRight',
		animationDirection = 'normal',
		quality = 'medium', // New quality setting
		autoDetectPerformance = true // Automatically adjust quality based on device
	} = $props<{
		background?: 'white' | '#242728';
		startDirection?: 'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight';
		endDirection?: 'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight';
		animationDirection?: 'normal' | 'reverse';
		quality?: 'low' | 'medium' | 'high';
		autoDetectPerformance?: boolean;
	}>();

	// Performance-based configuration
	// svelte-ignore state_referenced_locally
	let actualQuality = $state(quality);
	$effect(() => {
		actualQuality = quality;
	});
	let pathCount = $state(12); // Reduced from 72
	let shouldReduceMotion = $state(false);

	// Single animation progress value
	const animationProgress = new Tween(0, {
		duration: 8000,
		easing: cubicOut
	});

	// Performance detection with proper types
	function detectPerformance(): 'low' | 'medium' | 'high' {
		if (!browser) return 'medium';

		// Properly typed Network Information API
		interface NavigatorConnection extends Navigator {
			connection?: {
				effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
			};
		}

		// Properly typed Memory API
		interface PerformanceMemory extends Performance {
			memory?: {
				totalJSHeapSize?: number;
				usedJSHeapSize?: number;
				jsHeapSizeLimit?: number;
			};
		}

		const connection = (navigator as NavigatorConnection).connection;
		const memory = (performance as PerformanceMemory).memory;
		const hardwareConcurrency = navigator.hardwareConcurrency || 4;

		let score = 0;

		// CPU cores
		if (hardwareConcurrency >= 8) score += 2;
		else if (hardwareConcurrency >= 4) score += 1;

		// Memory (if available)
		if (memory?.totalJSHeapSize) {
			if (memory.totalJSHeapSize > 100 * 1024 * 1024)
				score += 2; // 100MB+
			else if (memory.totalJSHeapSize > 50 * 1024 * 1024) score += 1; // 50MB+
		}

		// Connection speed
		if (connection?.effectiveType) {
			if (connection.effectiveType === '4g') score += 1;
			else if (connection.effectiveType === '3g') score -= 1;
			else if (connection.effectiveType === '2g') score -= 2;
		}

		// User agent hints (basic mobile detection)
		if (/Mobile|Android|iPhone|iPad/.test(navigator.userAgent)) {
			score -= 1;
		}

		if (score >= 3) return 'high';
		if (score >= 1) return 'medium';
		return 'low';
	}

	// Apply quality settings
	function applyQualitySettings(detectedQuality: 'low' | 'medium' | 'high') {
		const settings = {
			low: { paths: 6, duration: 6000 },
			medium: { paths: 12, duration: 8000 },
			high: { paths: 18, duration: 10000 }
		};

		const config = settings[detectedQuality];
		pathCount = config.paths;

		// Update animation with new duration
		animationProgress.set(0, { duration: config.duration });
	}

	// Optimized path generation with memoization
	const pathCache = new SvelteMap<string, string>();

	function generatePath(start: string, end: string, index: number, position: number): string {
		const cacheKey = `${start}-${end}-${index}-${position}`;
		if (pathCache.has(cacheKey)) {
			return pathCache.get(cacheKey)!;
		}

		// Simplified coordinate calculation
		const coords = {
			TopLeft: { x: -200, y: -100 },
			TopRight: { x: 896, y: -100 },
			MiddleLeft: { x: -200, y: 158 },
			MiddleRight: { x: 896, y: 158 },
			BottomLeft: { x: -200, y: 416 },
			BottomRight: { x: 896, y: 416 }
		};

		const startCoord = coords[start as keyof typeof coords];
		const endCoord = coords[end as keyof typeof coords];

		const startX = startCoord.x + index * 15 * position;
		const startY = startCoord.y + index * 8 * position;
		const endX = endCoord.x + index * 15 * position;
		const endY = endCoord.y + index * 8 * position;

		// Simplified path with less complex curves
		const path = `M${startX},${startY}Q${(startX + endX) / 2},${(startY + endY) / 2} ${endX},${endY}`;
		pathCache.set(cacheKey, path);
		return path;
	}

	// Generate optimized path array
	const paths = $derived(
		Array.from({ length: pathCount }, (_, i) => {
			const baseOpacity = 0.15 + (i / pathCount) * 0.4;
			return {
				id: i,
				d: generatePath(startDirection, endDirection, i, i % 2 === 0 ? 1 : -1),
				width: 0.8 + i * 0.1,
				opacity: baseOpacity,
				color: background === 'white' ? `rgba(15,23,42,${baseOpacity})` : `rgba(255,255,255,${baseOpacity})`
			};
		})
	);

	// Animation control
	let animationFrame: number;
	let isAnimating = $state(false);

	// Start/stop animation
	function startAnimation() {
		if (shouldReduceMotion || !browser) return;

		isAnimating = true;

		const animate = () => {
			animationProgress.set(1).then(() => {
				animationProgress.set(0).then(() => {
					if (isAnimating) {
						animationFrame = requestAnimationFrame(animate);
					}
				});
			});
		};

		animate();
	}

	function stopAnimation() {
		isAnimating = false;
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
	}

	// Intersection observer for performance
	let svgElement: SVGElement;
	let isVisible = $state(true);

	function setupIntersectionObserver() {
		if (!browser || !svgElement) return;

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					isVisible = entry.isIntersecting;
					if (isVisible && !isAnimating) {
						startAnimation();
					} else if (!isVisible && isAnimating) {
						stopAnimation();
					}
				});
			},
			{ threshold: 0.1 }
		);

		observer.observe(svgElement);

		return () => observer.disconnect();
	}

	// Initialize component
	onMount(() => {
		if (browser) {
			// Check for reduced motion preference
			shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

			// Auto-detect performance if enabled
			if (autoDetectPerformance) {
				const detected = detectPerformance();
				actualQuality = detected;
				applyQualitySettings(detected);
			} else {
				applyQualitySettings(actualQuality);
			}

			// Setup intersection observer for visibility-based animation
			const cleanup = setupIntersectionObserver();

			// Start animation if visible and motion is allowed
			if (!shouldReduceMotion && isVisible) {
				startAnimation();
			}

			return cleanup;
		}
	});

	onDestroy(() => {
		stopAnimation();
		pathCache.clear();
	});

	// Calculate stroke dash offset for each path
	function getStrokeDashOffset(pathIndex: number): number {
		const progress = animationProgress.current;
		const staggerDelay = pathIndex * 0.1;
		const adjustedProgress = Math.max(0, Math.min(1, progress - staggerDelay));

		return animationDirection === 'reverse' ? 1000 * adjustedProgress : 1000 * (1 - adjustedProgress);
	}
</script>

<!-- SVG container with viewBox with hardware acceleration -->
<svg
	bind:this={svgElement}
	class="absolute inset-0 h-full w-full"
	viewBox="0 0 696 316"
	fill="none"
	aria-label="Background Pattern"
	role="img"
	aria-hidden="false"
	style={`
		z-index: 0; 
		background-color: ${background};
		will-change: transform;
		transform: translateZ(0);
	`}
>
	{#each paths as path (path.id)}
		<!-- Render each path with dynamic attributes -->
		<path
			d={path.d}
			stroke={path.color}
			stroke-width={path.width}
			stroke-linecap="round"
			stroke-opacity={path.opacity}
			style={`
				stroke-dasharray: 1000px; 
				stroke-dashoffset: ${getStrokeDashOffset(path.id)}px;
				will-change: stroke-dashoffset;
			`}
			aria-hidden="true"
		/>
	{/each}
</svg>
