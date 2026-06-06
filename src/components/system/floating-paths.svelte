<!--
@file src/components/system/floating-paths.svelte
@component
**Animated SVG Background Pattern Component**

Creates a dynamic animated background with SVG paths using native
Svelte 5 $state and requestAnimationFrame. Each path has independent
random timing (duration + phase offset) so they never synchronize,
creating organic layered motion from the first frame.

@example
<FloatingPaths />
<FloatingPaths position={-1} background="dark" mirrorAnimation />

@features
- Per-path random phase offset (organic de-synchronization)
- Triangle-wave pathOffset (smooth back-and-forth, no sawtooth jump)
- Static stroke opacity + animated element opacity (depth layering)
- Seeded pseudo-random prevents SSR hydration flash
- respects prefers-reduced-motion
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

	/**
	 * Deterministic pseudo-random from index — prevents SSR hydration flash.
	 * Math.random() would produce different server vs client values, causing
	 * paths to jump positions on mount.
	 */
	function seededRandom(seed: number): number {
		const x = Math.sin(seed) * 10000;
		return x - Math.floor(x);
	}

	const pathConfigs = Array.from({ length: 36 }, (_, i) => {
		const r1 = seededRandom(i + 1);
		const r2 = seededRandom(i + 50);

		return {
			id: i,
			d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
				152 - i * 5 * position
			} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
			width: 0.05 + i * 0.01,
			duration: 19 + r1 * 16,
			phaseOffset: r2,
			strokeOpacity: 0.1 + i * 0.03,
		};
	});

	// Svelte 5 deep reactivity: mutate in place to avoid per-frame GC
	let paths = $state(
		pathConfigs.map((config) => ({
			config,
			pathLength: 0.3,
			opacity: 0.3,
			pathOffset: 0,
		})),
	);

	onMount(() => {
		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion) return;

		let animationId: number;
		const startTime = performance.now();

		const animate = (currentTime: number) => {
			const elapsed = (currentTime - startTime) / 1000;

			// Mutate in place — no new array, no new objects, no GC per frame.
			// Svelte 5 tracks deep $state mutations natively.
			for (let i = 0; i < paths.length; i++) {
				const p = paths[i];
				const { duration, phaseOffset } = p.config;
				const progress = ((elapsed / duration) + phaseOffset) % 1;
				const cosWave = 0.5 * (1 - Math.cos(progress * Math.PI * 2));
				const triangleWave = progress < 0.5 ? progress * 2 : 2 - progress * 2;

				p.pathLength = 0.3 + cosWave * 0.7;
				p.opacity = 0.3 + cosWave * 0.3;
				p.pathOffset = mirrorAnimation ? 1 - triangleWave : triangleWave;
			}

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
				stroke-opacity={path.config.strokeOpacity}
				opacity={path.opacity}
				pathLength="1"
				stroke-dasharray={path.pathLength}
				stroke-dashoffset={path.pathOffset}
			/>
		{/each}
	</svg>
</div>
