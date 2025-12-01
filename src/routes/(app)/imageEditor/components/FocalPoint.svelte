<!--
@file: src/routes/(app)/imageEditor/components/FocalPoint.svelte
@component
Focal point selection tool. Displays a rule-of-thirds overlay and a crosshair.
Emits `apply` with normalized coordinates { x: number, y: number } in [0,1].
-->
<script lang="ts">
	import type Konva from 'konva';
	import { onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';

	// Props
	const { stage, imageNode, disabled = false } = $props();

	const dispatch = createEventDispatcher();

	// Local state
	let containerEl: HTMLDivElement | null = null;
	const crosshair = $state({ x: 0.5, y: 0.5 });
	let hasPoint = $state(false);

	function setFromClientPosition(clientX: number, clientY: number) {
		if (!containerEl || !imageNode) return;

		const rect = containerEl.getBoundingClientRect();
		const relX = (clientX - rect.left) / rect.width;
		const relY = (clientY - rect.top) / rect.height;

		// Clamp 0..1
		crosshair.x = Math.max(0, Math.min(1, relX));
		crosshair.y = Math.max(0, Math.min(1, relY));
		hasPoint = true;
	}

	function handleClick(e: MouseEvent) {
		if (disabled) return;
		setFromClientPosition(e.clientX, e.clientY);
	}

	function handleTouch(e: TouchEvent) {
		if (disabled) return;
		const t = e.touches[0] ?? e.changedTouches[0];
		if (!t) return;
		setFromClientPosition(t.clientX, t.clientY);
	}

	function apply() {
		dispatch('apply', { x: crosshair.x, y: crosshair.y });
	}

	// Expose API for parent if needed
	function getValue() {
		return { ...crosshair };
	}
	$inspect(getValue);

	onMount(() => {
		// If image exists, default to center
		hasPoint = true;
		if (stage) {
			// noop: referenced to satisfy linter, reserved for future use
		}
	});
</script>

<div
	bind:this={containerEl}
	class="relative h-full w-full select-none"
	role="button"
	tabindex="0"
	onclick={handleClick}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && apply()}
	ontouchend={handleTouch}
>
	<!-- Rule of thirds overlay -->
	<div class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
		{#each Array(9) as _}
			<div class="border border-white/20 dark:border-black/30"></div>
		{/each}
	</div>

	{#if hasPoint}
		<!-- Crosshair -->
		<div
			class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
			style={`left:${crosshair.x * 100}%; top:${crosshair.y * 100}%;`}
			aria-label="Focal point"
		>
			<div class="h-6 w-6 rounded-full border-2 border-primary-500/90 bg-primary-500/20"></div>
		</div>
	{/if}

	<!-- Bottom action bar for the tool (inline to keep simple) -->
	<div class="pointer-events-auto absolute inset-x-0 bottom-3 mx-auto flex max-w-md items-center justify-center gap-3">
		<button class="variant-ghost btn" onclick={() => (hasPoint = false)} {disabled}>Clear</button>
		<button class="variant-filled-primary btn" onclick={apply} disabled={disabled || !hasPoint}>Apply Focal Point</button>
	</div>
</div>

<style lang="postcss">
	.btn {
		@apply rounded-md px-3 py-2 text-sm;
	}
	.variant-ghost {
		@apply border border-surface-300 bg-transparent text-surface-800 dark:border-surface-700 dark:text-surface-200;
	}
	.variant-filled-primary {
		@apply bg-primary-600 text-white hover:bg-primary-700;
	}
</style>
