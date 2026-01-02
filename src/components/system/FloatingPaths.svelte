<!--
@file src/components/system/FloatingPaths.svelte
@component
**Animated SVG Background Pattern Component**

Creates a dynamic animated background with SVG paths that draw themselves
with varying widths, opacities, and colors. Refactored for buttery smooth
CSS-based animations in Svelte 5.
-->

<script lang="ts">
	interface Props {
		background?: string;
		position?: number;
		mirrorAnimation?: boolean;
	}

	const { background = 'white', position = 1, mirrorAnimation = false }: Props = $props();

	const paths = Array.from({ length: 36 }, (_, i) => ({
		id: i,
		d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
			152 - i * 5 * position
		} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
		width: 0.05 + i * 0.01,
		opacity: 0.1 + i * 0.03,
		// Stagger via duration variation + small fixed delay range (avoids negative delays)
		duration: 18 + (i % 12) * 0.9, // 18–28s range, feels more organic
		delay: (i * 0.3) % 5 // Positive, small, cycling delays
	}));
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden">
	<svg
		class="h-full w-full {background === 'white' ? 'text-slate-950' : 'text-white'} {mirrorAnimation ? 'mirror' : ''}"
		viewBox="0 0 696 316"
		stroke-linecap="round"
		fill="none"
		preserveAspectRatio="xMidYMid slice"
	>
		{#each paths as path (path.id)}
			<path
				d={path.d}
				stroke="currentColor"
				stroke-width={path.width}
				stroke-opacity={path.opacity}
				class="floating-path"
				style:--duration="{path.duration}s"
				style:--delay="{path.delay}s"
				style:--direction={mirrorAnimation ? -1 : 1}
			/>
		{/each}
	</svg>
</div>

<style>
	.floating-path {
		stroke-dasharray: 0.3 0.7;
		stroke-dashoffset: 1;
		opacity: 0.3;
		will-change: stroke-dashoffset, opacity;
		animation: floating-draw var(--duration, 20s) linear infinite var(--delay, 0s);
		transform: translateZ(0); /* Force GPU layer */
	}

	@keyframes floating-draw {
		0% {
			stroke-dashoffset: calc(1 + var(--direction, 1));
			opacity: 0.3;
		}
		50% {
			stroke-dashoffset: calc(0.3 + var(--direction, 1));
			opacity: 0.6;
		}
		100% {
			stroke-dashoffset: calc(0 + var(--direction, 1));
			opacity: 0.3;
		}
	}

	.mirror {
		transform: scaleX(-1);
	}

	/* Reduced motion respect */
	@media (prefers-reduced-motion: reduce) {
		.floating-path {
			animation: none;
			stroke-dashoffset: 0.5;
			opacity: 0.4;
		}
	}
</style>
