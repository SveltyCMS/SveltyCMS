<script>
	import { Motion, M } from 'svelte-motion';
	export let background = 'white';
	export let position = 1;
	export let paths = Array.from({ length: 36 }, (_, i) => ({
		id: i,
		d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
			152 - i * 5 * position
		} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
		color: `rgba(15,23,42,${0.1 + i * 0.03})`,
		width: 0.5 + i * 0.03
	}));
</script>

<div class="pointer-events-none absolute inset-0">
	<svg
		class="h-full w-full {background === 'white' ? 'text-slate-950' : 'text-white'}"
		stroke="#70f"
		stroke-width={20}
		viewBox="0 0 696 316"
		stroke-linecap="round"
		fill="transparent"
	>
		{#each paths as path}
			<M.path />
			<Motion
				isSVG={true}
				initial={{ pathLength: 0.3, opacity: 0.6 }}
				animate={{ pathLength: [0.3, 1, 0.3], opacity: [0.3, 0.6, 0.3], pathOffset: [0, 1, 0] }}
				transition={{
					duration: 20 + Math.random() * 10,
					repeat: Infinity,
					ease: 'linear'
				}}
				let:motion
			>
				<path d={path.d} stroke="currentColor" stroke-width={path.width} stroke-opacity={0.1 + path.id * 0.03} use:motion />
			</Motion>
		{/each}
	</svg>
</div>
