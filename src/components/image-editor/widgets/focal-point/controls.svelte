<!--
@file src/components/image-editor/widgets/focal-point/controls.svelte
@component
Pintura-style focal point bottom dock controls.
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

<div class="flex flex-col flex-[0_0_auto] gap-1 items-stretch w-full min-w-0 h-auto leading-none" role="toolbar" aria-label="Focal point controls">
	<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full">
			<span class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium whitespace-nowrap cursor-default bg-transparent border border-transparent rounded-full text-white bg-white/[0.1] border-white/[0.14]" aria-hidden="true">
				<iconify-icon icon="mdi:target" width="15"></iconify-icon>
				<span>Focal point</span>
			</span>
		</div>

		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full">
			<label class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-default bg-transparent border border-transparent rounded-full" for="focal-x">
				<span>X</span>
				<input aria-label="Focal X"
					type="number"
					id="focal-x"
					min="0"
					max="100"
					value={focalX}
					oninput={(e) => updateField('x', (e.currentTarget as HTMLInputElement).value)}
					class="h-7 px-2 text-[11px] font-medium text-white bg-white/6 border border-white/[0.1] rounded-md outline-none focus:border-white/[0.25] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] [&[type=number]]:[appearance:textfield] w-10 text-center"
				/>
			</label>
			<label class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-default bg-transparent border border-transparent rounded-full" for="focal-y">
				<span>Y</span>
				<input aria-label="Focal Y"
					type="number"
					id="focal-y"
					min="0"
					max="100"
					value={focalY}
					oninput={(e) => updateField('y', (e.currentTarget as HTMLInputElement).value)}
					class="h-7 px-2 text-[11px] font-medium text-white bg-white/6 border border-white/[0.1] rounded-md outline-none focus:border-white/[0.25] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] [&[type=number]]:[appearance:textfield] w-10 text-center"
				/>
			</label>
		</div>

		<span class="text-[10px] italic text-[rgba(255,255,255,0.4)] whitespace-nowrap inline-flex gap-[0.35rem] items-center hidden sm:inline-flex">
			<iconify-icon icon="mdi:mouse-left-click-outline" width="14" aria-hidden="true"></iconify-icon>
			Click image to set focus
		</span>

		<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onReset} title="Reset to center (50%, 50%)" aria-label="Reset focal point">
			<iconify-icon icon="mdi:restore" width="15" aria-hidden="true"></iconify-icon>
			<span>Reset</span>
		</button>
	</div>
</div>
