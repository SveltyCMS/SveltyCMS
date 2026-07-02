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

<div class="editor-dock" role="toolbar" aria-label="Focal point controls">
	<div class="dock-row dock-row-scroll">
		<div class="dock-pill-group">
			<span class="dock-pill dock-pill-active" aria-hidden="true">
				<iconify-icon icon="mdi:target" width="15"></iconify-icon>
				<span>Focal point</span>
			</span>
		</div>

		<div class="dock-pill-group">
			<label class="dock-pill" for="focal-x">
				<span>X</span>
				<input aria-label="Focal X"
					type="number"
					id="focal-x"
					min="0"
					max="100"
					value={focalX}
					oninput={(e) => updateField('x', (e.currentTarget as HTMLInputElement).value)}
					class="dock-input w-10 text-center"
				/>
			</label>
			<label class="dock-pill" for="focal-y">
				<span>Y</span>
				<input aria-label="Focal Y"
					type="number"
					id="focal-y"
					min="0"
					max="100"
					value={focalY}
					oninput={(e) => updateField('y', (e.currentTarget as HTMLInputElement).value)}
					class="dock-input w-10 text-center"
				/>
			</label>
		</div>

		<span class="dock-hint hidden sm:inline-flex">
			<iconify-icon icon="mdi:mouse-left-click-outline" width="14" aria-hidden="true"></iconify-icon>
			Click image to set focus
		</span>

		<button type="button" class="dock-pill" onclick={onReset} title="Reset to center (50%, 50%)" aria-label="Reset focal point">
			<iconify-icon icon="mdi:restore" width="15" aria-hidden="true"></iconify-icon>
			<span>Reset</span>
		</button>
	</div>
</div>

<style>
	@import '../../editor-dock.css';

	.dock-pill label,
	label.dock-pill {
		cursor: default;
	}

	.dock-hint {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
	}
</style>
