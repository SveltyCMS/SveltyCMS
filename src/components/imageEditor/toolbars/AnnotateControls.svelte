<!--
@file: src/components/imageEditor/toolbars/AnnotateControls.svelte
@component
**Controls for the Annotate tool: tool selection (text, arrow, shapes) and styling (colors)**

### Props
- currentTool: ToolType
- strokeColor: string
- fillColor: string
- onSetTool: (tool: ToolType) => void
- onStrokeColorChange: (color: string) => void
- onFillColorChange: (color: string) => void
- onDelete: () => void
- onApply: () => void

### Features
- Tool selection (text, arrow, shapes)
- Styling (colors)
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
		onDelete,
		onApply
	}: {
		currentTool: ToolType;
		strokeColor: string;
		fillColor: string;
		onSetTool: (tool: ToolType) => void;
		onStrokeColorChange: (color: string) => void;
		onFillColorChange: (color: string) => void;
		onDelete: () => void;
		onApply: () => void;
	} = $props();
</script>

<div class="flex w-full items-center gap-4">
	<!-- Tool Selection -->
	<div class=" preset-ghost-surface-500">
		<button
			class="btn btn-sm"
			class:active={currentTool === 'text'}
			onclick={() => onSetTool(currentTool === 'text' ? null : 'text')}
			title="Add Text"
		>
			<iconify-icon icon="mdi:format-text"></iconify-icon>
		</button>
		<button
			class="btn btn-sm"
			class:active={currentTool === 'arrow'}
			onclick={() => onSetTool(currentTool === 'arrow' ? null : 'arrow')}
			title="Draw Arrow"
		>
			<iconify-icon icon="mdi:arrow-top-right"></iconify-icon>
		</button>
		<button
			class="btn btn-sm"
			class:active={currentTool === 'rectangle'}
			onclick={() => onSetTool(currentTool === 'rectangle' ? null : 'rectangle')}
			title="Draw Rectangle"
		>
			<iconify-icon icon="mdi:rectangle-outline"></iconify-icon>
		</button>
		<button
			class="btn btn-sm"
			class:active={currentTool === 'circle'}
			onclick={() => onSetTool(currentTool === 'circle' ? null : 'circle')}
			title="Draw Circle"
		>
			<iconify-icon icon="mdi:circle-outline"></iconify-icon>
		</button>
	</div>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Color Pickers -->
	<label class="flex items-center gap-2 text-sm" title="Stroke Color">
		<iconify-icon icon="mdi:water-opacity"></iconify-icon>
		<input
			type="color"
			class="h-8 w-8 cursor-pointer appearance-none rounded-md border-none bg-transparent p-0"
			oninput={(e) => onStrokeColorChange(e.currentTarget.value)}
			value={strokeColor}
		/>
	</label>
	<label class="flex items-center gap-2 text-sm" title="Fill Color">
		<iconify-icon icon="mdi:format-color-fill"></iconify-icon>
		<input
			type="color"
			class="h-8 w-8 cursor-pointer appearance-none rounded-md border-none bg-transparent p-0"
			oninput={(e) => onFillColorChange(e.currentTarget.value)}
			value={fillColor}
		/>
	</label>

	<div class="grow"></div>

	<!-- Actions -->
	<button onclick={onDelete} class="btn preset-ghost-error-500">
		<iconify-icon icon="mdi:delete-outline"></iconify-icon>
		<span>Delete</span>
	</button>
	<button class="btn preset-filled-success-500" onclick={onApply}>
		<iconify-icon icon="mdi:check"></iconify-icon>
		<span>Done</span>
	</button>
</div>
