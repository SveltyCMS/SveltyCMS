<!--
@file src/components/system/FloatingNav.svelte
@component
**Optimized Animated SVG Background Pattern Component**

Creates a dynamic animated background with SVG paths that draw themselves
with varying widths, opacities, and colors. Optimized for performance with
reduced DOM complexity and efficient animations.

@example
<FloatingNav />

@features
- Automatic contrasting colors based on background
- Customizable background color (white or dark)
- Adjustable start and end directions (e.g., TopLeft, BottomRight)
- CSS-based animations for better performance
- Responsive design
- Reduced DOM complexity
-->

<script lang="ts">
	interface Props {
		background?: string;
		position?: number;
		mirrorAnimation?: boolean;
	}

	let { background = 'white', position = 1, mirrorAnimation = false }: Props = $props();

	// Use a simple `const` because the path data is static and calculated only once
	const paths = Array.from({ length: 24 }, (_, i) => {
		const baseOffset = i * 5 * position;
		const verticalOffset = i * 6;
		return {
			id: i,
			d: `M-${380 - baseOffset} -${189 + verticalOffset}C-${380 - baseOffset} -${189 + verticalOffset} -${312 - baseOffset} ${216 - verticalOffset} ${152 - baseOffset} ${343 - verticalOffset}C${616 - baseOffset} ${470 - verticalOffset} ${684 - baseOffset} ${875 - verticalOffset} ${684 - baseOffset} ${875 - verticalOffset}`,
			delay: i * 0.8, // Staggered animation delay for a more organic effect.
			duration: 25 + (i % 6) * 5 // Varied duration for a less uniform feel.
		};
	});
</script>

<div class="pointer-events-none absolute inset-0">
	<svg
		class="h-full w-full {background === 'white' ? 'text-slate-950' : 'text-white'} {mirrorAnimation ? 'mirror' : ''}"
		stroke="currentColor"
		viewBox="0 0 696 316"
		stroke-linecap="round"
		fill="transparent"
	>
		{#each paths as path}
			<path
				d={path.d}
				stroke="currentColor"
				class="animated-path"
				style="
      --animation-delay: {path.delay}s;
      --animation-duration: {path.duration}s;
      --mirror-direction: {mirrorAnimation ? -1 : 1};
      "
			/>
		{/each}
	</svg>
</div>

<style lang="postcss">
	.mirror {
		transform: scaleX(-1);
	}

	.animated-path {
		stroke-dasharray: 1000;
		/* A value safely larger than any path length. */
		stroke-width: 0.2;
		/* A static width can be slightly more performant. */
		will-change: stroke-dashoffset, opacity;
		/* Hint to the browser for optimization. */
		/* Use a single, combined animation for efficiency. */
		animation: drawAndFade var(--animation-duration) linear infinite;
		animation-delay: var(--animation-delay);
	}

	/* Combined keyframe rule for both drawing and fading the path. */
	@keyframes drawAndFade {
		0% {
			stroke-dashoffset: calc(1000 * var(--mirror-direction));
			opacity: 0;
		}
		50% {
			stroke-dashoffset: 0;
			opacity: 0.5;
		}
		100% {
			stroke-dashoffset: calc(-1000 * var(--mirror-direction));
			opacity: 0;
		}
	}

	/* Accessibility: Respect user's motion preferences by disabling animations. */
	@media (prefers-reduced-motion: reduce) {
		.animated-path {
			animation: none;
			stroke-dasharray: none;
			opacity: 0.2;
			/* Show paths statically if motion is disabled. */
		}
	}

	/* Performance: Promote the SVG to its own compositing layer for GPU acceleration. */
	svg {
		transform: translateZ(0);
	}
</style>
