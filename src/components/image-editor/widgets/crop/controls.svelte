<!--
@file: src/components/image-editor/widgets/crop/controls.svelte
@component
Pintura-style crop bottom dock — pill buttons, horizontal scroll, no card chrome.
-->
<script lang="ts">
	import type { CropShape } from './types';
	import { imageEditorStore } from '@components/image-editor/image-editor-store.svelte';

	let {
		crop,
		onCropShapeChange,
		onAspectRatio,
		onCropChange,
		cropShape
	}: {
		crop?: { x: number; y: number; width: number; height: number };
		onCropShapeChange: (shape: CropShape) => void;
		onAspectRatio: (ratio: number | null) => void;
		onCropChange?: (nextCrop: { x: number; y: number; width: number; height: number }) => void;
		cropShape: CropShape;
	} = $props();

	const fieldId = $props.id();

	interface AspectPreset {
		label: string;
		ratio: number;
		icon: string;
		shortcut?: string;
	}

	const aspectPresets: AspectPreset[] = [
		{ label: 'Free', ratio: 0, icon: 'mdi:crop-free', shortcut: 'F' },
		{ label: '1:1', ratio: 1, icon: 'mdi:crop-square', shortcut: '1' },
		{ label: '4:3', ratio: 4 / 3, icon: 'mdi:crop-landscape', shortcut: '2' },
		{ label: '3:2', ratio: 3 / 2, icon: 'mdi:crop-3-2', shortcut: '4' },
		{ label: '16:9', ratio: 16 / 9, icon: 'mdi:crop-16-9', shortcut: '3' },
		{ label: '9:16', ratio: 9 / 16, icon: 'mdi:crop-portrait', shortcut: '5' },
		{ label: '2:3', ratio: 2 / 3, icon: 'mdi:crop-2-3', shortcut: '6' }
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

	function selectPreset(preset: AspectPreset, index: number) {
		activePreset = index;
		onAspectRatio(preset.ratio || null);
	}

	function updateCropField(field: 'x' | 'y' | 'width' | 'height', value: string) {
		if (!crop || !onCropChange) return;
		const numeric = Number.parseInt(value, 10);
		if (!Number.isFinite(numeric)) return;
		onCropChange({ ...crop, [field]: numeric });
	}
</script>

<div
	class="flex flex-col flex-[0_0_auto] gap-1 items-stretch w-full min-w-0 h-auto leading-none"
	role="toolbar"
	aria-label="Crop controls"
>
	<div
		class="flex flex-nowrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none overflow-x-auto overflow-y-hidden pb-0 scrollbar-thin [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full"
	>
		{#each aspectPresets as preset, i (preset.label)}
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/9 hover:not-disabled:border-white/12 disabled:cursor-not-allowed disabled:opacity-35"
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
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/9 hover:not-disabled:border-white/12 disabled:cursor-not-allowed disabled:opacity-35"
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

	{#if crop && onCropChange}
		<div
			class="flex flex-nowrap gap-1.5 items-center justify-center w-full"
			role="group"
			aria-label="Crop pixels"
		>
			{#each [{ key: 'x', field: 'x', value: crop.x, min: 0 }, { key: 'y', field: 'y', value: crop.y, min: 0 }, { key: 'w', field: 'width', value: crop.width, min: 1 }, { key: 'h', field: 'height', value: crop.height, min: 1 }] as field (field.key)}
				<label class="flex items-center gap-1" for="{fieldId}-{field.key}">
					<span class="text-[10px] font-normal text-white/45 lowercase">{field.key}</span>
					<input
						id="{fieldId}-{field.key}"
						type="number"
						value={Math.round(field.value)}
						min={field.min}
						onchange={(e) =>
							updateCropField(
								field.field as 'x' | 'y' | 'width' | 'height',
								(e.currentTarget as HTMLInputElement).value
							)}
						class="w-14 h-7 px-1 text-[11px] text-white text-center bg-white/6 border border-transparent rounded-md outline-none focus-visible:border-white/30 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
					/>
				</label>
			{/each}
		</div>
	{/if}
</div>
