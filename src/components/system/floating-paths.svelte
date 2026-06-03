<!--
@file src/components/system/floating-paths.svelte
@component
**Animated SVG Background Pattern Component**

Creates a dynamic animated background with SVG paths that draw themselves
with varying widths, opacities, and colors. Replicates the svelte-motion
behavior using native Svelte 5 $state and requestAnimationFrame.

@example
<FloatingPaths />

@features
- Automatic contrasting colors based on background
- Customizable background color (white or dark)
- Smooth path drawing animations
- Responsive design
-->

<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		background?: string;
		mirrorAnimation?: boolean;
		position?: number;
	}

	const { background = 'white', position = 1, mirrorAnimation = false }: Props = $props();

	// Generate paths with their animation configs
	const pathConfigs = Array.from({ length: 36 }, (_, i) => ({
		id: i,
		d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
			152 - i * 5 * position
		} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
		width: 0.05 + i * 0.01,
		duration: 20 + (i % 15) * 0.7, // Duration in seconds (matching original)
		baseOpacity: 0.1 + i * 0.03
	}));

	// Reactive array: config + animation state combined so the {#each} re-renders
	let paths = $state(
		pathConfigs.map((config) => ({
			config,
			pathLength: 0.3,
			opacity: 0.3,
			pathOffset: mirrorAnimation ? 1 : 0,
		})),
	);

	onMount(() => {
		// Check for reduced motion preference
		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion) {
			return;
		}

		let animationId: number;
		const startTime = performance.now();

		const animate = (currentTime: number) => {
			const elapsed = (currentTime - startTime) / 1000;

			paths = paths.map((p) => {
				const duration = p.config.duration;
				const progress = (elapsed / duration) % 1;
				const wave = 0.5 * (1 - Math.cos(progress * Math.PI * 2));
				return {
					...p,
					pathLength: 0.3 + wave * 0.7,
					opacity: 0.3 + wave * 0.3,
					pathOffset: mirrorAnimation ? 1 - progress : progress,
				};
			});

			animationId = requestAnimationFrame(animate);
		};

		animationId = requestAnimationFrame(animate);

		return () => cancelAnimationFrame(animationId);
	});
</script>

<div class="pointer-events-none absolute inset-0">
	<svg
		aria-hidden="true"
		class="h-full w-full {background === 'white' ? 'text-slate-950' : 'text-white'} {mirrorAnimation ? '-scale-x-100' : ''}"
		viewBox="0 0 696 316"
		stroke-linecap="round"
		fill="transparent"
	>
		{#each paths as path (path.config.id)}
			<path
				d={path.config.d}
				stroke="currentColor"
				stroke-width={path.config.width}
				stroke-opacity={path.opacity}
				pathLength="1"
				stroke-dasharray={path.pathLength}
				stroke-dashoffset={path.pathOffset}
			/>
		{/each}
	</svg>
</div>
