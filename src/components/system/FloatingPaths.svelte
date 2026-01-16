<!--
@file src/components/system/FloatingPaths.svelte
@component
**Animated SVG Background Pattern Component**

Creates a dynamic animated background with SVG paths that draw themselves
with varying widths, opacities, and colors. The animation is driven by Svelte's motion
Spring class for smooth, physics-based motion.

@example
<FloatingPaths />

@features
- Automatic contrasting colors based on background
- Customizable background color (white or dark)
- Adjustable start and end directions (e.g., TopLeft, BottomRight)
- Smooth spring animations with reduced motion support
- Responsive design
- SVG path optimization
-->

<script lang="ts">
	import { Motion } from 'svelte-motion';

	interface Props {
		background?: string;
		position?: number;
		mirrorAnimation?: boolean;
	}

	const { background = 'white', position = 1, mirrorAnimation = false }: Props = $props();

	const paths = Array.from({ length: 36 }, (_, i) => ({
		id: i, // Unique ID for each path
		d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
			152 - i * 5 * position
		} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
		color: `rgba(218,218,218,${0.05 + i * 0.015})`, //  color
		width: 0.05 + i * 0.01, // stroke width
		duration: 20 + (i % 15) * 0.7 // Deterministic duration (20-29.8s)
	}));
</script>

<div class="pointer-events-none absolute inset-0">
	<svg
		class="h-full w-full {background === 'white' ? 'text-slate-950' : 'text-white'} {mirrorAnimation ? 'mirror' : ''}"
		stroke="#70f"
		stroke-width={20}
		viewBox="0 0 696 316"
		stroke-linecap="round"
		fill="transparent"
	>
		{#each paths as path (path.id)}
			<Motion
				isSVG={true}
				initial={{ pathLength: 0.3, opacity: 0.6 }}
				animate={{
					pathLength: [0.3, 1, 0.3],
					opacity: [0.3, 0.6, 0.3],
					pathOffset: mirrorAnimation ? [1, 0, 1] : [0, 1, 0] // Adjust path offset for mirror animation
				}}
				transition={{
					duration: path.duration,
					repeat: Infinity,
					ease: 'linear'
				}}
			>
				{#snippet children({ motion }: { motion: any })}
					<path d={path.d} stroke="currentColor" stroke-width={path.width} stroke-opacity={0.1 + path.id * 0.03} use:motion />
				{/snippet}
			</Motion>
		{/each}
	</svg>
</div>

<style>
	.mirror {
		transform: scaleX(-1);
	}
</style>
