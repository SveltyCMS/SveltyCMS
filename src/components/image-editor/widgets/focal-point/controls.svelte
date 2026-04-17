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

<div class="flex items-center gap-4 flex-wrap">
	<!-- Focal Point Coordinates -->
	<div class="flex items-center gap-2">
		<span class="text-sm font-medium">Focal Point:</span>
		<div class="grid grid-cols-2 gap-2">
			<label class="flex items-center gap-2 text-xs text-surface-600 dark:text-surface-50">
				<span>X</span>
				<input
					type="number"
					min="0"
					max="100"
					value={focalX}
					oninput={(e) => updateField('x', (e.currentTarget as HTMLInputElement).value)}
					class="input input-sm w-20"
				/>
			</label>
			<label class="flex items-center gap-2 text-xs text-surface-600 dark:text-surface-50">
				<span>Y</span>
				<input
					type="number"
					min="0"
					max="100"
					value={focalY}
					oninput={(e) => updateField('y', (e.currentTarget as HTMLInputElement).value)}
					class="input input-sm w-20"
				/>
			</label>
		</div>
	</div>

	<!-- Instructions -->
	<span class="text-xs text-surface-600 dark:text-surface-50"> Click on the image to set focal point </span>

	<!-- Spacer -->
	<div class="grow"></div>

	<!-- Actions: Only Reset remains, Cancel/Apply handled by global toolbar -->
	<div class="flex items-center gap-2">
		<button onclick={onReset} class="btn preset-outlined-surface-500 btn-sm" title="Reset to center">
			<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
			<span>Reset</span>
		</button>
	</div>
</div>
