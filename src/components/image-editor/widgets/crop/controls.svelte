<!--
@file: src/components/image-editor/widgets/crop/controls.svelte
@component
Pintura-style crop bottom dock — pill buttons, horizontal scroll, no card chrome.
-->
<script lang="ts">
	import type { CropShape } from './types';
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';

	let {
		crop,
		onRotateLeft,
		onRotateRight,
		onFlipHorizontal,
		onFlipVertical,
		onCropShapeChange,
		onAspectRatio,
		onCropChange,
		cropShape
	}: {
		crop: { x: number; y: number; width: number; height: number };
		onRotateLeft: () => void;
		onRotateRight: () => void;
		onFlipHorizontal: () => void;
		onFlipVertical?: () => void;
		onCropShapeChange: (shape: CropShape) => void;
		onAspectRatio: (ratio: number | null) => void;
		onCropChange: (nextCrop: { x: number; y: number; width: number; height: number }) => void;
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

	function updateCropField(field: 'x' | 'y' | 'width' | 'height', value: string) {
		const numeric = Number.parseInt(value, 10);
		if (!Number.isFinite(numeric)) return;
		onCropChange({ ...crop, [field]: numeric });
	}

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === 'INPUT') return;
		const cmdOrCtrl = e.metaKey || e.ctrlKey;

		switch (e.key) {
			case 'r':
			case 'R':
				if (!cmdOrCtrl) {
					e.preventDefault();
					onRotateRight();
				}
				break;
			case 'l':
			case 'L':
				if (!cmdOrCtrl) {
					e.preventDefault();
					onRotateLeft();
				}
				break;
			case 'f':
			case 'F':
				if (!cmdOrCtrl) {
					e.preventDefault();
					onFlipHorizontal();
				}
				break;
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

<div class="editor-dock crop-controls" role="toolbar" aria-label="Crop controls">
	<div class="dock-row dock-row-scroll">
		{#each aspectPresets as preset, i (preset.label)}
			<button
				type="button"
				class="dock-pill"
				class:dock-pill-active={activePreset === i}
				onclick={() => selectPreset(preset, i)}
				title="{preset.label}{preset.shortcut ? ` (${preset.shortcut})` : ''}"
				aria-label="Aspect ratio {preset.label}"
				aria-pressed={activePreset === i}
			>
				<iconify-icon icon={preset.icon} width="15" aria-hidden="true"></iconify-icon>
				<span>{preset.label}</span>
			</button>
		{/each}
	</div>

	<div class="dock-row dock-row-scroll">
		{#each shapes as shape (shape.id)}
			<button
				type="button"
				class="dock-pill"
				class:dock-pill-active={cropShape === shape.id}
				onclick={() => onCropShapeChange(shape.id)}
				title={shape.label}
				aria-label={shape.label}
				aria-pressed={cropShape === shape.id}
			>
				<iconify-icon icon={shape.icon} width="15" aria-hidden="true"></iconify-icon>
				<span>{shape.label}</span>
			</button>
		{/each}

		<button type="button" class="dock-pill" onclick={onRotateLeft} title="Rotate left (L)" aria-label="Rotate left">
			<iconify-icon icon="mdi:rotate-left" width="15" aria-hidden="true"></iconify-icon>
			<span>Left</span>
		</button>
		<button type="button" class="dock-pill" onclick={onRotateRight} title="Rotate right (R)" aria-label="Rotate right">
			<iconify-icon icon="mdi:rotate-right" width="15" aria-hidden="true"></iconify-icon>
			<span>Right</span>
		</button>
		<button type="button" class="dock-pill" onclick={onFlipHorizontal} title="Flip horizontal (F)" aria-label="Flip horizontal">
			<iconify-icon icon="mdi:flip-horizontal" width="15" aria-hidden="true"></iconify-icon>
			<span>Flip H</span>
		</button>
		{#if onFlipVertical}
			<button type="button" class="dock-pill" onclick={onFlipVertical} title="Flip vertical" aria-label="Flip vertical">
				<iconify-icon icon="mdi:flip-vertical" width="15" aria-hidden="true"></iconify-icon>
				<span>Flip V</span>
			</button>
		{/if}
	</div>

	<div class="value-row">
		<label class="value-field" for="crop-x">
			<span>x</span>
			<input id="crop-x" type="number" value={crop.x} min="0" oninput={(e) => updateCropField('x', (e.currentTarget as HTMLInputElement).value)} />
		</label>
		<label class="value-field" for="crop-y">
			<span>y</span>
			<input id="crop-y" type="number" value={crop.y} min="0" oninput={(e) => updateCropField('y', (e.currentTarget as HTMLInputElement).value)} />
		</label>
		<label class="value-field" for="crop-w">
			<span>w</span>
			<input id="crop-w" type="number" value={crop.width} min="1" oninput={(e) => updateCropField('width', (e.currentTarget as HTMLInputElement).value)} />
		</label>
		<label class="value-field" for="crop-h">
			<span>h</span>
			<input id="crop-h" type="number" value={crop.height} min="1" oninput={(e) => updateCropField('height', (e.currentTarget as HTMLInputElement).value)} />
		</label>
	</div>
</div>

<style>
	@import '../../editor-dock.css';

	.value-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		justify-content: center;
		width: 100%;
	}

	.value-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		align-items: center;
		min-width: 3rem;
	}

	.value-field span {
		font-size: 0.625rem;
		font-weight: 400;
		color: rgba(255, 255, 255, 0.4);
		text-transform: lowercase;
	}

	.value-field input {
		width: 3.25rem;
		height: 1.625rem;
		padding-inline: 0.35rem;
		font-size: 0.6875rem;
		color: #fff;
		text-align: center;
		background: rgba(255, 255, 255, 0.06);
		border: none;
		border-radius: 0.375rem;
		outline: none;
	}

	.value-field input:focus {
		background: rgba(255, 255, 255, 0.1);
	}
</style>
