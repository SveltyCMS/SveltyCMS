<!--
@file: src/components/imageEditor/toolbars/AnnotateControls.svelte
@component
Controls for the Annotate tool: tool selection (text, arrow, shapes) and styling (colors).
-->
<script lang="ts">
	type ToolType = 'text' | 'arrow' | 'rectangle' | 'circle' | null;

	let {
		currentTool,
		strokeColor,
		fillColor,
		onSetTool,
		onStrokeColorChange,
		onFillColorChange,
		onDelete
	}: {
		currentTool: ToolType;
		strokeColor: string;
		fillColor: string;
		onSetTool: (tool: ToolType) => void;
		onStrokeColorChange: (color: string) => void;
		onFillColorChange: (color: string) => void;
		onDelete: () => void;
	} = $props();
</script>

<div class="annotate-controls">
	<!-- Tool Selection Group -->
	<div class="tool-group">
		<button class="tool-btn" class:active={currentTool === 'text'} onclick={() => onSetTool(currentTool === 'text' ? null : 'text')} title="Add Text">
			<iconify-icon icon="mdi:format-text" width="20"></iconify-icon>
		</button>
		<button
			class="tool-btn"
			class:active={currentTool === 'arrow'}
			onclick={() => onSetTool(currentTool === 'arrow' ? null : 'arrow')}
			title="Draw Arrow"
		>
			<iconify-icon icon="mdi:arrow-top-right" width="20"></iconify-icon>
		</button>
		<button
			class="tool-btn"
			class:active={currentTool === 'rectangle'}
			onclick={() => onSetTool(currentTool === 'rectangle' ? null : 'rectangle')}
			title="Draw Rectangle"
		>
			<iconify-icon icon="mdi:rectangle-outline" width="20"></iconify-icon>
		</button>
		<button
			class="tool-btn"
			class:active={currentTool === 'circle'}
			onclick={() => onSetTool(currentTool === 'circle' ? null : 'circle')}
			title="Draw Circle"
		>
			<iconify-icon icon="mdi:circle-outline" width="20"></iconify-icon>
		</button>
	</div>

	<div class="divider"></div>

	<!-- Color Pickers -->
	<div class="color-group">
		<label class="color-picker-label" title="Stroke Color">
			<input type="color" class="input-color" oninput={(e) => onStrokeColorChange(e.currentTarget.value)} value={strokeColor} />
			<div class="color-swatch" style:background-color={strokeColor}></div>
			<iconify-icon icon="mdi:pencil-outline" class="picker-icon" width="12"></iconify-icon>
		</label>

		<label class="color-picker-label" title="Fill Color">
			<input type="color" class="input-color" oninput={(e) => onFillColorChange(e.currentTarget.value)} value={fillColor} />
			<div class="color-swatch" style:background-color={fillColor}></div>
			<iconify-icon icon="mdi:format-color-fill" class="picker-icon" width="12"></iconify-icon>
		</label>
	</div>

	<div class="divider"></div>

	<!-- Delete Action (Contextual) -->
	<button onclick={onDelete} class="tool-btn delete-btn" title="Delete Selected">
		<iconify-icon icon="mdi:delete-outline" width="20"></iconify-icon>
	</button>
</div>

<style>
	.annotate-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		width: 100%;
		padding: 0;
	}

	.tool-group {
		display: flex;
		background: rgba(0, 0, 0, 0.2);
		padding: 0.25rem;
		border-radius: 9999px;
		gap: 0.25rem;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 9999px;
		border: none;
		background: transparent;
		color: #9ca3af;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tool-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.tool-btn.active {
		background: #3b82f6;
		color: white;
		box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
	}

	.delete-btn {
		color: #ef4444; /* Error-500 */
	}

	.delete-btn:hover {
		background: rgba(239, 68, 68, 0.1);
		color: #f87171;
	}

	.divider {
		width: 1px;
		height: 1.5rem;
		background: rgba(255, 255, 255, 0.1);
	}

	.color-group {
		display: flex;
		gap: 0.75rem;
	}

	.color-picker-label {
		position: relative;
		width: 2rem;
		height: 2rem;
		cursor: pointer;
	}

	.input-color {
		position: absolute;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
		z-index: 10;
	}

	.color-swatch {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.2);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.picker-icon {
		position: absolute;
		bottom: -4px;
		right: -4px;
		background: #1f2937;
		border-radius: 50%;
		padding: 2px;
		color: #9ca3af;
		border: 1px solid rgba(255, 255, 255, 0.1);
		z-index: 5;
	}
</style>
