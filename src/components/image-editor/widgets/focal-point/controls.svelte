<!--
@file src/components/image-editor/toolbars/FocalPointControls.svelte
@component
Toolbar controls for the FocalPoint widget
-->

<script lang="ts">
	interface Props {
		focalX?: number;
		focalY?: number;
		onReset?: () => void;
		onPointChange?: (nextPoint: { x: number; y: number }) => void;
	}

	const { focalX = 50, focalY = 50, onReset = () => {}, onPointChange = () => {} }: Props = $props();

	function updateField(field: 'x' | 'y', value: string) {
		const numeric = Number.parseInt(value, 10);
		if (!Number.isFinite(numeric)) {
			return;
		}

		onPointChange({
			x: field === 'x' ? Math.max(0, Math.min(100, numeric)) : focalX,
			y: field === 'y' ? Math.max(0, Math.min(100, numeric)) : focalY
		});
	}
</script>

<div class="flex flex-wrap items-center gap-4 py-1">
	<!-- Focal Point Coordinates -->
	<div class="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-2 px-3 backdrop-blur-md">
		<div class="flex items-center gap-2">
			<iconify-icon icon="mdi:target" width="18" class="text-primary-400"></iconify-icon>
			<span class="text-xs font-semibold uppercase tracking-wider text-white/70">Focal Point</span>
		</div>
		
		<div class="h-4 w-px bg-white/10"></div>

		<div class="flex gap-3">
			<div class="flex items-center gap-2">
				<span class="text-[10px] font-bold text-white/40">X</span>
				<input
					type="number"
					id="focal-x"
					min="0"
					max="100"
					value={focalX}
					oninput={(e) => updateField('x', (e.currentTarget as HTMLInputElement).value)}
					class="w-12 rounded-lg border-none bg-black/40 p-1 text-center text-xs font-mono font-medium text-white ring-1 ring-white/10 transition-all hover:bg-black/60 focus:bg-black/80 focus:ring-primary-500/50 focus:outline-hidden"
					aria-label="Focal X percentage"
				/>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-[10px] font-bold text-white/40">Y</span>
				<input
					type="number"
					id="focal-y"
					min="0"
					max="100"
					value={focalY}
					oninput={(e) => updateField('y', (e.currentTarget as HTMLInputElement).value)}
					class="w-12 rounded-lg border-none bg-black/40 p-1 text-center text-xs font-mono font-medium text-white ring-1 ring-white/10 transition-all hover:bg-black/60 focus:bg-black/80 focus:ring-primary-500/50 focus:outline-hidden"
					aria-label="Focal Y percentage"
				/>
			</div>
		</div>
	</div>

	<!-- Instructions -->
	<div class="flex items-center gap-2 text-xs text-white/50 italic">
		<iconify-icon icon="mdi:mouse-left-click-outline" width="16"></iconify-icon>
		<span>Click on the image to position the focus area</span>
	</div>

	<!-- Spacer -->
	<div class="grow"></div>

	<!-- Actions: Reset -->
	<button 
		onclick={onReset} 
		class="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80 transition-all hover:border-primary-400/30 hover:bg-primary-500/10 hover:text-white active:scale-95 group" 
		title="Reset to center (50%, 50%)"
		aria-label="Reset focal point"
	>
		<iconify-icon icon="mdi:restore" width="18" class="transition-transform group-hover:rotate-180"></iconify-icon>
		<span>Reset</span>
	</button>
</div>

<style>
	/* Hide spin buttons for numeric inputs */
	input::-webkit-outer-spin-button,
	input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		appearance: none;
		margin: 0;
	}
	input[type='number'] {
		-moz-appearance: textfield;
		appearance: textfield;
	}
</style>
