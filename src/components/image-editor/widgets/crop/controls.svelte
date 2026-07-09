<!--
@file: src/components/image-editor/widgets/crop/controls.svelte
@component
Pintura-style crop bottom dock — pill buttons, horizontal scroll, no card chrome.
-->
<script lang="ts">
	import type { CropShape } from './types';
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';

	// `crop` and `onCropChange` props are still passed by tool.svelte but only consumed by
	// the temporarily hidden numeric inputs — uncomment them together with that block.
	let {
			// crop,
			onCropShapeChange,
			onAspectRatio,
			// onCropChange,
			cropShape
		}: {
			crop?: { x: number; y: number; width: number; height: number };
			onCropShapeChange: (shape: CropShape) => void;
			onAspectRatio: (ratio: number | null) => void;
			onCropChange?: (nextCrop: { x: number; y: number; width: number; height: number }) => void;
			cropShape: CropShape;
		} = $props();

	interface AspectPreset {
		label: string;
		ratio: number;
		icon: string;
		shortcut?: string;
	}

	const aspectPresets: AspectPreset[] = [
		{ label: 'Free', ratio: 0, icon: 'mdi:crop-free', shortcut: '0' },
		{ label: '1:1', ratio: 1, icon: 'mdi:crop-square', shortcut: '1' },
		{ label: '4:3', ratio: 4 / 3, icon: 'mdi:crop-landscape', shortcut: '2' },
		{ label: '3:2', ratio: 3 / 2, icon: 'mdi:crop-3-2' },
		{ label: '16:9', ratio: 16 / 9, icon: 'mdi:crop-16-9', shortcut: '3' },
		{ label: '9:16', ratio: 9 / 16, icon: 'mdi:crop-portrait' },
		{ label: '2:3', ratio: 2 / 3, icon: 'mdi:crop-2-3' }
	];

	const shapes: { id: CropShape; icon: string; label: string }[] = [
		{ id: 'rectangle', icon: 'mdi:crop-landscape', label: 'Rectangle' },
		{ id: 'square', icon: 'mdi:crop-square', label: 'Square' },
		{ id: 'circular', icon: 'mdi:circle-outline', label: 'Circle' }
	];

	let activePreset = $state(0);

	$effect(() => {
		const cropState = imageEditorStore.state.crop;
		const ratio = imageEditorStore.state.currentAspectRatio;
		if (cropState === null || ratio === null) {
			activePreset = 0;
			return;
		}
		const matchIndex = aspectPresets.findIndex((p) => p.ratio === ratio);
		if (matchIndex !== -1) {
			activePreset = matchIndex;
		}
	});

	function handleRatio(ratio: number | null) {
		if (ratio === 0) {
			activePreset = 0;
			onAspectRatio(null);
		} else if (ratio) {
			activePreset = aspectPresets.findIndex((p) => p.ratio === ratio);
			if (activePreset === -1) activePreset = 1;
			onAspectRatio(ratio);
		} else {
			activePreset = 0;
		}
	}

	function selectPreset(preset: AspectPreset, index: number) {
		activePreset = index;
		onAspectRatio(preset.ratio || null);
	}

	// Numeric crop inputs temporarily hidden — restore alongside the commented markup below
	// function updateCropField(field: 'x' | 'y' | 'width' | 'height', value: string) {
	// 	const numeric = Number.parseInt(value, 10);
	// 	if (!Number.isFinite(numeric)) return;
	// 	onCropChange({ ...crop, [field]: numeric });
	// }

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === 'INPUT') return;
		const cmdOrCtrl = e.metaKey || e.ctrlKey;

		switch (e.key) {
			case '1':
				e.preventDefault();
				handleRatio(1);
				break;
			case '0':
				e.preventDefault();
				handleRatio(0);
				break;
			case '3':
				if (!cmdOrCtrl) {
					e.preventDefault();
					handleRatio(16 / 9);
				}
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="flex flex-col flex-[0_0_auto] gap-1 items-stretch w-full min-w-0 h-auto leading-none" role="toolbar" aria-label="Crop controls">
	<div class="flex flex-nowrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
		{#each aspectPresets as preset, i (preset.label)}
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
				class:text-white={activePreset === i}
				onclick={() => selectPreset(preset, i)}
				title="{preset.label}{preset.shortcut ? ` (${preset.shortcut})` : ''}"
				aria-label="Aspect ratio {preset.label}"
				aria-pressed={activePreset === i}
			>
				<iconify-icon icon={preset.icon} width="15" aria-hidden="true"></iconify-icon>
				<span>{preset.label}</span>
			</button>
		{/each}

		<div class="shrink-0 w-px h-5 mx-1 bg-[--editor-chrome-border]" aria-hidden="true"></div>

		{#each shapes as shape (shape.id)}
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
				class:text-white={cropShape === shape.id}
				onclick={() => onCropShapeChange(shape.id)}
				title={shape.label}
				aria-label={shape.label}
				aria-pressed={cropShape === shape.id}
			>
				<iconify-icon icon={shape.icon} width="15" aria-hidden="true"></iconify-icon>
				<span>{shape.label}</span>
			</button>
		{/each}
	</div>

	<!-- Numeric crop inputs temporarily hidden — restore by uncommenting this block
	<div class="flex flex-wrap gap-2 items-center justify-center w-full">
		<label class="flex flex-col gap-1 items-center min-w-12" for="crop-x">
			<span class="text-[10px] font-normal text-[rgba(255,255,255,0.4)] lowercase">x</span>
			<input id="crop-x" type="number" value={crop.x} min="0" oninput={(e) => updateCropField('x', (e.currentTarget as HTMLInputElement).value)} class="w-13 h-[1.625rem] px-[0.35rem] text-[11px] text-white text-center bg-white/6 border-none rounded-md outline-none focus:bg-white/[0.1] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 [-moz-appearance:textfield] [appearance:textfield]" />
		</label>
		<label class="flex flex-col gap-1 items-center min-w-12" for="crop-y">
			<span class="text-[10px] font-normal text-[rgba(255,255,255,0.4)] lowercase">y</span>
			<input id="crop-y" type="number" value={crop.y} min="0" oninput={(e) => updateCropField('y', (e.currentTarget as HTMLInputElement).value)} class="w-13 h-[1.625rem] px-[0.35rem] text-[11px] text-white text-center bg-white/6 border-none rounded-md outline-none focus:bg-white/[0.1] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 [-moz-appearance:textfield] [appearance:textfield]" />
		</label>
		<label class="flex flex-col gap-1 items-center min-w-12" for="crop-w">
			<span class="text-[10px] font-normal text-[rgba(255,255,255,0.4)] lowercase">w</span>
			<input id="crop-w" type="number" value={crop.width} min="1" oninput={(e) => updateCropField('width', (e.currentTarget as HTMLInputElement).value)} class="w-13 h-[1.625rem] px-[0.35rem] text-[11px] text-white text-center bg-white/6 border-none rounded-md outline-none focus:bg-white/[0.1] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 [-moz-appearance:textfield] [appearance:textfield]" />
		</label>
		<label class="flex flex-col gap-1 items-center min-w-12" for="crop-h">
			<span class="text-[10px] font-normal text-[rgba(255,255,255,0.4)] lowercase">h</span>
			<input id="crop-h" type="number" value={crop.height} min="1" oninput={(e) => updateCropField('height', (e.currentTarget as HTMLInputElement).value)} class="w-13 h-[1.625rem] px-[0.35rem] text-[11px] text-white text-center bg-white/6 border-none rounded-md outline-none focus:bg-white/[0.1] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 [-moz-appearance:textfield] [appearance:textfield]" />
		</label>
	</div>
	-->
</div>
