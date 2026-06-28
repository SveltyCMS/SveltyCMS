<!--
@file: src/components/image-editor/widgets/Crop/Controls.svelte
@component
Modern, responsive crop controls with keyboard shortcuts and accessibility.
Supports multiple aspect ratios including common social media formats.
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import type { CropShape } from './types';

	let {
		crop,
		onRotateLeft,
		onRotateRight,
		onFlipHorizontal,
		onFlipVertical,
		onCropShapeChange,
		onAspectRatio,
		onCropChange,
		cropShape: _cropShape
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

	// Aspect ratio presets - ordered by popularity
	const aspectPresets: AspectPreset[] = [
		{ label: 'Free', ratio: 0, icon: 'mdi:crop-free', shortcut: '0' },
		{ label: '1:1', ratio: 1, icon: 'mdi:crop-square', shortcut: '1' },
		{ label: '4:3', ratio: 4 / 3, icon: 'mdi:crop-landscape', shortcut: '2' },
		{ label: '3:2', ratio: 3 / 2, icon: 'mdi:crop-3-2' },
		{ label: '16:9', ratio: 16 / 9, icon: 'mdi:crop-16-9', shortcut: '3' },
		{ label: '9:16', ratio: 9 / 16, icon: 'mdi:crop-portrait' },
		{ label: '2:3', ratio: 2 / 3, icon: 'mdi:crop-2-3' }
	];

	let activePreset = $state(1); // Default to 1:1 (square)

	function handleRatio(ratio: number | null) {
		if (ratio === 0) {
			// Free ratio - no constraint
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
		if (!Number.isFinite(numeric)) {
			return;
		}

		onCropChange({
			...crop,
			[field]: numeric
		});
	}

	// Keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === 'INPUT') {
			return;
		}

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

<div class="crop-controls" role="toolbar" aria-label="Crop controls">
	<!-- Group 1: Aspect Ratio Presets -->
	<div class="control-group">
		<span class="control-label">Aspect</span>
		<div class="aspect-ratios">
			{#each aspectPresets as preset, i (i)}
				<Button variant="outline"
									type="button"
									onclick={() => selectPreset(preset, i)}
									title="{preset.label}{preset.shortcut ? ` (${preset.shortcut})` : ''}"
									aria-label="Aspect ratio {preset.label}"
									aria-pressed={activePreset === i}
								>
					<iconify-icon icon={preset.icon} width="16"></iconify-icon>
					<span class="hidden sm:inline">{preset.label}</span>
				</Button>
			{/each}
		</div>
	</div>

	<!-- Group 2: Shape Selection -->
	<div class="control-group">
		<span class="control-label">Shape</span>
		<div class="flex gap-0.5" role="radiogroup" aria-label="Crop shape">
			<Button variant="outline"
				type="button"
				onclick={() => onCropShapeChange('rectangle')}
				title="Rectangle"
				aria-label="Crop rectangle"
			>
				<iconify-icon icon="mdi:crop-landscape" width="20"></iconify-icon>
			</Button>
			<Button variant="outline" type="button" onclick={() => onCropShapeChange('square')} title="Square">
				<iconify-icon icon="mdi:crop-square" width="20"></iconify-icon>
			</Button>
			<Button variant="outline" type="button" onclick={() => onCropShapeChange('circular')} title="Circle">
				<iconify-icon icon="mdi:circle-outline" width="20"></iconify-icon>
			</Button>
		</div>
	</div>

	<!-- Group 3: Transform Controls -->
	<div class="control-group">
		<span class="control-label">Transform</span>
					<div class="flex gap-0.5">
			<Button variant="outline" type="button" onclick={onRotateLeft} title="Rotate Left 90° (L)" aria-label="Rotate Left 90 degrees" aria-keyshortcuts="L">
				<iconify-icon icon="mdi:rotate-left" width="20"></iconify-icon>
			</Button>
			<Button variant="outline" type="button" onclick={onRotateRight} title="Rotate Right 90° (R)" aria-label="Rotate Right 90 degrees" aria-keyshortcuts="R">
				<iconify-icon icon="mdi:rotate-right" width="20"></iconify-icon>
			</Button>
			<Button variant="outline" type="button" onclick={onFlipHorizontal} title="Flip Horizontal (F)" aria-label="Flip Horizontal" aria-keyshortcuts="F">
				<iconify-icon icon="mdi:flip-horizontal" width="20"></iconify-icon>
			</Button>
			{#if onFlipVertical}
				<Button variant="outline" type="button" onclick={onFlipVertical} title="Flip Vertical" aria-label="Flip Vertical">
					<iconify-icon icon="mdi:flip-vertical" width="20"></iconify-icon>
				</Button>
			{/if}
		</div>
	</div>

	<div class="control-group crop-values">
		<span class="control-label">Exact values</span>
		<span class="control-help">Drag corners or type the crop box values</span>
		<div class="value-grid">
			<label for="crop-x">
				<span>X</span>
				<input id="crop-x" type="number" value={crop.x} min="0" oninput={(e) => updateCropField('x', (e.currentTarget as HTMLInputElement).value)} />
			</label>
			<label for="crop-y">
				<span>Y</span>
				<input id="crop-y" type="number" value={crop.y} min="0" oninput={(e) => updateCropField('y', (e.currentTarget as HTMLInputElement).value)} />
			</label>
			<label for="crop-w">
				<span>W</span>
				<input id="crop-w" type="number" value={crop.width} min="1" oninput={(e) => updateCropField('width', (e.currentTarget as HTMLInputElement).value)} />
			</label>
			<label for="crop-h">
				<span>H</span>
				<input id="crop-h" type="number" value={crop.height} min="1" oninput={(e) => updateCropField('height', (e.currentTarget as HTMLInputElement).value)} />
			</label>
		</div>
	</div>
</div>

<style>
	.crop-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 0.5rem;
		background: transparent;
		border: none;
	}

	.control-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.control-label {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #9ca3af;
		white-space: nowrap;
	}

	.aspect-ratios {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.crop-values {
		align-items: flex-start;
		flex-direction: column;
	}

	.control-help {
		font-size: 0.65rem;
		color: #6b7280;
		max-width: 12rem;
	}

	.value-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(3rem, 4.5rem));
		gap: 0.5rem;
	}

	.value-grid label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.65rem;
		font-weight: 600;
		color: #9ca3af;
	}

	.value-grid input {
		width: 100%;
		padding: 0.35rem 0.5rem;
		color: white;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.4rem;
	}

	@media (max-width: 768px) {
		.crop-controls {
			gap: 0.5rem 0.75rem;
			justify-content: flex-start;
			padding: 0.2rem 0;
		}

		.control-label {
			display: none;
		}

		.control-group {
			width: 100%;
		}

		.aspect-ratios {
			flex-wrap: nowrap;
			overflow-x: auto;
			width: 100%;
			padding-bottom: 0.1rem;
		}

		.crop-values {
			width: 100%;
		}

		.value-grid {
			grid-template-columns: repeat(2, minmax(3rem, 1fr));
		}
	}
</style>
