<!--
@file: src/components/image-editor/toolbars/AnnotateControls.svelte
@component
Controls for the Annotate tool: tool selection (text, arrow, shapes) and styling (colors).
-->
<script lang="ts">
	type ToolType = 'text' | 'arrow' | 'rectangle' | 'circle' | null;

	let {
		currentTool,
		strokeColor,
		fillColor,
		textDraft = 'Text',
		onSetTool,
		onStrokeColorChange,
		onFillColorChange,
		onTextDraftChange,
		hasSelection = false,
		onDeleteAnnotation
	}: {
		currentTool: ToolType;
		strokeColor: string;
		fillColor: string;
		textDraft?: string;
		onSetTool: (tool: ToolType) => void;
		onStrokeColorChange: (color: string) => void;
		onFillColorChange: (color: string) => void;
		onTextDraftChange?: (text: string) => void;
		hasSelection?: boolean;
		onDeleteAnnotation?: () => void;
	} = $props();

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') {
			return;
		}

		if ((e.key === 'Delete' || e.key === 'Backspace') && hasSelection && onDeleteAnnotation) {
			e.preventDefault();
			onDeleteAnnotation();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="annotate-controls">
	<!-- Tool Selection Group -->
	<div class="tool-group">
		<button type="button" class="tool-btn" class:active={currentTool === 'text'} onclick={() => onSetTool(currentTool === 'text' ? null : 'text')} title="Add Text">
			<iconify-icon icon="mdi:format-text" width="20"></iconify-icon>
		</button>
		<button
			type="button"
			class="tool-btn"
			class:active={currentTool === 'arrow'}
			onclick={() => onSetTool(currentTool === 'arrow' ? null : 'arrow')}
			title="Draw Arrow"
		>
			<iconify-icon icon="mdi:arrow-top-right" width="20"></iconify-icon>
		</button>
		<button
			type="button"
			class="tool-btn"
			class:active={currentTool === 'rectangle'}
			onclick={() => onSetTool(currentTool === 'rectangle' ? null : 'rectangle')}
			title="Draw Rectangle"
		>
			<iconify-icon icon="mdi:rectangle-outline" width="20"></iconify-icon>
		</button>
		<button
			type="button"
			class="tool-btn"
			class:active={currentTool === 'circle'}
			onclick={() => onSetTool(currentTool === 'circle' ? null : 'circle')}
			title="Draw Circle"
		>
			<iconify-icon icon="mdi:circle-outline" width="20"></iconify-icon>
		</button>
	</div>

	{#if currentTool === 'text' && onTextDraftChange}
		<div class="text-panel">
			<label class="text-label" for="annotation-text">Text</label>
			<input
				id="annotation-text"
				class="text-input"
				type="text"
				value={textDraft}
				placeholder="Enter annotation text"
				oninput={(e) => onTextDraftChange(e.currentTarget.value)}
			/>
			<button type="button" class="text-place-btn" onclick={() => onSetTool('text')} title="Click canvas to place text">
				Place text
			</button>
		</div>
	{/if}

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

	{#if hasSelection && onDeleteAnnotation}
		<button type="button" class="delete-btn" onclick={onDeleteAnnotation} title="Delete selected annotation">
			<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
			<span>Delete</span>
		</button>
	{/if}
</div>

<style>
	.annotate-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem;
		align-items: center;
		justify-content: flex-start;
		width: 100%;
		padding: 0;
	}

	.tool-group {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 9999px;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		color: #9ca3af;
		cursor: pointer;
		background: transparent;
		border: none;
		border-radius: 9999px;
		transition: all 0.2s;
	}

	.tool-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.tool-btn.active {
		color: white;
		background: #3b82f6;
		box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
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

	.text-panel {
		display: flex;
		align-items: center;
		flex: 1 1 18rem;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 0.75rem;
	}

	.text-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #9ca3af;
	}

	.text-input {
		min-width: 0;
		flex: 1 1 auto;
		padding: 0.45rem 0.65rem;
		color: #fff;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.5rem;
		outline: none;
	}

	.text-input:focus {
		border-color: rgb(var(--color-primary-500) / 1);
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
	}

	.text-place-btn {
		padding: 0.45rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: #e5e7eb;
		background: rgba(59, 130, 246, 0.2);
		border: 1px solid rgba(59, 130, 246, 0.5);
		border-radius: 0.5rem;
	}

	.color-picker-label {
		position: relative;
		width: 2rem;
		height: 2rem;
		cursor: pointer;
	}

	.input-color {
		position: absolute;
		z-index: 10;
		width: 100%;
		height: 100%;
		cursor: pointer;
		opacity: 0;
	}

	.color-swatch {
		width: 100%;
		height: 100%;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.picker-icon {
		position: absolute;
		right: -4px;
		bottom: -4px;
		z-index: 5;
		padding: 2px;
		color: #9ca3af;
		background: #1f2937;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 50%;
	}

	.delete-btn {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		padding: 0.45rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: #fecaca;
		background: rgba(239, 68, 68, 0.16);
		border: 1px solid rgba(239, 68, 68, 0.45);
		border-radius: 0.5rem;
	}

	@media (max-width: 768px) {
		.annotate-controls {
			align-items: stretch;
			gap: 0.7rem;
			padding: 0.1rem;
		}

		.tool-group {
			order: 1;
			width: fit-content;
			max-width: 100%;
			overflow-x: auto;
		}

		.text-panel {
			order: 2;
			flex-basis: 100%;
			flex-wrap: wrap;
			align-items: stretch;
			padding: 0.5rem;
			border: 1px solid rgba(255, 255, 255, 0.08);
		}

		.text-label {
			width: 100%;
		}

		.text-input {
			width: 100%;
		}

		.text-place-btn {
			width: 100%;
			justify-content: center;
		}

		.divider {
			display: none;
		}

		.color-group {
			order: 3;
			gap: 0.55rem;
		}

		.delete-btn {
			order: 4;
			width: 100%;
			justify-content: center;
		}
	}
</style>
