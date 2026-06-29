<!--
@file: src/components/image-editor/widgets/annotate/controls.svelte
@component
Pintura-style annotate bottom dock — single centered row with colors, text, and tools.
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

	const annotateTools: { id: ToolType; label: string; icon: string }[] = [
		{ id: 'text', label: 'Text', icon: 'mdi:format-text' },
		{ id: 'arrow', label: 'Arrow', icon: 'mdi:arrow-top-right' },
		{ id: 'rectangle', label: 'Rectangle', icon: 'mdi:rectangle-outline' },
		{ id: 'circle', label: 'Ellipse', icon: 'mdi:circle-outline' }
	];

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

<div class="editor-dock annotate-dock" role="toolbar" aria-label="Annotate controls">
	<div class="dock-row dock-row-scroll annotate-row">
		<div class="dock-pill-group color-group">
			<span class="group-label">line</span>
			<label class="color-trigger" title="Stroke color">
				<input
					type="color"
					class="color-input"
					value={strokeColor}
					oninput={(e) => onStrokeColorChange(e.currentTarget.value)}
					aria-label="Stroke color"
				/>
				<span class="color-swatch" style:background-color={strokeColor}></span>
			</label>
		</div>

		<div class="dock-pill-group color-group">
			<span class="group-label">fill</span>
			<label class="color-trigger" title="Fill color">
				<input
					type="color"
					class="color-input"
					value={fillColor}
					oninput={(e) => onFillColorChange(e.currentTarget.value)}
					aria-label="Fill color"
				/>
				<span class="color-swatch" style:background-color={fillColor}></span>
			</label>
		</div>

		{#if currentTool === 'text' && onTextDraftChange}
			<div class="dock-pill-group text-group">
				<span class="group-label">text</span>
				<input
					id="annotation-text"
					class="dock-input text-input"
					type="text"
					value={textDraft}
					placeholder="Enter text"
					oninput={(e) => onTextDraftChange(e.currentTarget.value)}
					aria-label="Annotation text"
				/>
			</div>
		{/if}

		{#if hasSelection && onDeleteAnnotation}
			<button type="button" class="dock-pill" onclick={onDeleteAnnotation} title="Delete selected annotation" aria-label="Delete annotation">
				<iconify-icon icon="mdi:delete-outline" width="15" aria-hidden="true"></iconify-icon>
				<span>Delete</span>
			</button>
		{/if}

		<div class="dock-pill-group tools-group">
			{#each annotateTools as tool (tool.id)}
				<button
					type="button"
					class="dock-pill"
					class:dock-pill-active={currentTool === tool.id}
					onclick={() => onSetTool(tool.id)}
					title={tool.label}
					aria-pressed={currentTool === tool.id}
					aria-label={tool.label}
				>
					<iconify-icon icon={tool.icon} width="15" aria-hidden="true"></iconify-icon>
					<span>{tool.label}</span>
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	@import '../../editor-dock.css';

	.annotate-dock {
		gap: 0;
	}

	.annotate-row {
		align-items: center;
	}

	.color-group,
	.text-group,
	.tools-group {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding-inline: 0.5rem;
	}

	.group-label {
		font-size: 0.625rem;
		font-weight: 400;
		color: rgba(255, 255, 255, 0.45);
		text-transform: lowercase;
		white-space: nowrap;
	}

	.color-trigger {
		position: relative;
		display: block;
		width: 1.375rem;
		height: 1.375rem;
		flex-shrink: 0;
		cursor: pointer;
	}

	.color-input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
		opacity: 0;
	}

	.color-swatch {
		display: block;
		width: 100%;
		height: 100%;
		border: 2px solid rgba(255, 255, 255, 0.25);
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
	}

	.text-input {
		min-width: 7rem;
		height: 1.5rem;
	}

	.tools-group .dock-pill {
		height: 1.625rem;
		padding-inline: 0.55rem;
	}

	@media (max-width: 640px) {
		.text-input {
			min-width: 5.5rem;
		}
	}
</style>
