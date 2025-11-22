<!--
@file: src/routes/(app)/imageEditor/widgets/Watermark/Controls.svelte
@component
**Watermark tool controls for master toolbar**
-->
<script lang="ts">
	const {
		opacity,
		onOpacityChange,
		onAddWatermark,
		onSnap,
		onDelete,
		onDone
	}: {
		opacity: number;
		onOpacityChange: (v: number) => void;
		onAddWatermark: (f: File) => void;
		onSnap: (pos: string) => void;
		onDelete: () => void;
		onDone: () => void;
	} = $props();

	let fileInput: HTMLInputElement;

	function handleFileSelect(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (input.files && input.files[0]) {
			onAddWatermark(input.files[0]);
			input.value = ''; // Reset for next upload
		}
	}

	// Local binding for slider
	let sliderValue = $derived(opacity * 100);
	function handleOpacityInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onOpacityChange(parseInt(target.value, 10) / 100);
	}

	const snapPositions = [
		{ pos: 'tl', icon: 'mdi:arrow-top-left' },
		{ pos: 'tc', icon: 'mdi:arrow-up' },
		{ pos: 'tr', icon: 'mdi:arrow-top-right' },
		{ pos: 'cl', icon: 'mdi:arrow-left' },
		{ pos: 'c', icon: 'mdi:fullscreen' },
		{ pos: 'cr', icon: 'mdi:arrow-right' },
		{ pos: 'bl', icon: 'mdi:arrow-bottom-left' },
		{ pos: 'bc', icon: 'mdi:arrow-down' },
		{ pos: 'br', icon: 'mdi:arrow-bottom-right' }
	];
</script>

<div class="watermark-controls">
	<!-- Hidden file input -->
	<input type="file" class="hidden" accept="image/png, image/jpeg, image/webp" bind:this={fileInput} onchange={handleFileSelect} />

	<!-- Add Watermark -->
	<button onclick={() => fileInput.click()} class="btn-tool" title="Upload new watermark">
		<iconify-icon icon="mdi:upload" width="20"></iconify-icon>
		<span>Upload Logo</span>
	</button>
	<div class="divider"></div>

	<!-- Opacity -->
	<label class="label" title="Opacity">
		<iconify-icon icon="mdi:opacity" width="20"></iconify-icon>
		<input type="range" min="0" max="100" step="1" bind:value={sliderValue} oninput={handleOpacityInput} class="slider" />
		<span class="value">{sliderValue}%</span>
	</label>
	<div class="divider"></div>

	<!-- Snap Position -->
	<span class="label">Position:</span>
	<div class="snap-grid">
		{#each snapPositions as snap}
			<button class="snap-btn" title="Snap to {snap.pos}" onclick={() => onSnap(snap.pos)}>
				<iconify-icon icon={snap.icon} width="16"></iconify-icon>
			</button>
		{/each}
	</div>

	<div class="divider-grow"></div>

	<!-- Actions -->
	<button onclick={onDelete} class="btn-tool" title="Delete selected watermark">
		<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
	</button>
	<button onclick={onDone} class="btn-apply" title="Done">
		<iconify-icon icon="mdi:check" width="18"></iconify-icon>
		<span>Done</span>
	</button>
</div>

<style lang="postcss">
	@import "tailwindcss";
	.watermark-controls {
		@apply flex w-full items-center gap-3 px-2;
	}
	.label {
		@apply flex items-center gap-1 text-nowrap text-sm font-medium ; color: var(--color-surface-200);
	}
	.divider {
		@apply h-6 w-px ; background-color: var(--color-surface-600);
	}
	.divider-grow {
		@apply flex-grow;
	}
	.btn-tool {
		@apply flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors;
		bg-surface-200 text-surface-700; background-color: var(--color-surface-700); color: var(--color-surface-200);
	}
	.btn-tool:hover {
		 background-color: var(--color-surface-600);
	}
	.btn-apply {
		@apply flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white;
		 background-color: var(--color-success-600);
	}
	.slider {
		@apply h-2 w-24 cursor-pointer appearance-none rounded-full ; background-color: var(--color-surface-600);
	}
	.slider::-webkit-slider-thumb {
		@apply h-4 w-4 appearance-none rounded-full  shadow-md; background-color: var(--color-primary-600);
	}
	.slider::-moz-range-thumb {
		@apply h-4 w-4 rounded-full border-0  shadow-md; background-color: var(--color-primary-600);
	}
	.value {
		@apply min-w-[3rem] text-center text-sm font-semibold ; color: var(--color-surface-200);
	}
	.snap-grid {
		@apply grid grid-cols-3 gap-0.5 rounded-lg  p-0.5; background-color: var(--color-surface-700);
	}
	.snap-btn {
		@apply flex h-6 w-6 items-center justify-center rounded-md transition-colors;
		@apply  ; background-color: var(--color-surface-900); color: var(--color-surface-400);
	}
</style>
