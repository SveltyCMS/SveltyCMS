<!--
@file src/routes/(app)/imageEditor/components/toolbars/controls/AnnotateControls.svelte
@component
Controls for Annotate tool rendered inside the Master Toolbar.

Props:
- currentTool: 'text' | 'rectangle' | 'circle' | 'arrow' | 'line' | null
- strokeColor: string
- fillColor: string
- strokeWidth: number
- fontSize: number
- onSetTool: (tool) => void
- onStrokeColorChange, onFillColorChange, onStrokeWidthChange, onFontSizeChange
- onDelete: () => void
- onDeleteAll: () => void
- onDone: () => void
-->

<script lang="ts">
	type Tool = 'text' | 'rectangle' | 'circle' | 'arrow' | 'line' | null;
	let {
		currentTool = null as Tool,
		strokeColor = '#ff0000',
		fillColor = 'transparent',
		strokeWidth = 2,
		fontSize = 20,
		onSetTool = (_t: Tool) => {},
		onStrokeColorChange = (_: string) => {},
		onFillColorChange = (_: string) => {},
		onStrokeWidthChange = (_: number) => {},
		onFontSizeChange = (_: number) => {},
		onDelete = () => {},
		onDeleteAll = () => {},
		onDone = () => {}
	} = $props<{
		currentTool?: Tool;
		strokeColor?: string;
		fillColor?: string;
		strokeWidth?: number;
		fontSize?: number;
		onSetTool?: (tool: Tool) => void;
		onStrokeColorChange?: (v: string) => void;
		onFillColorChange?: (v: string) => void;
		onStrokeWidthChange?: (v: number) => void;
		onFontSizeChange?: (v: number) => void;
		onDelete?: () => void;
		onDeleteAll?: () => void;
		onDone?: () => void;
	}>();

	const tools: { key: Tool; label: string }[] = [
		{ key: 'text', label: 'Text' },
		{ key: 'rectangle', label: 'Rect' },
		{ key: 'circle', label: 'Circle' },
		{ key: 'arrow', label: 'Arrow' },
		{ key: 'line', label: 'Line' }
	];
</script>

<div class="annotate-controls flex items-center gap-3">
	<div class="toolset flex items-center gap-1">
		{#each tools as t}
			<button
				class="tool-btn rounded bg-surface-200 px-2 py-1 text-sm dark:bg-surface-700"
				class:active={currentTool === t.key}
				class:bg-primary-500={currentTool === t.key}
				class:text-white={currentTool === t.key}
				onclick={() => onSetTool(t.key)}>{t.label}</button
			>
		{/each}
	</div>
	<div class="settings flex items-center gap-3">
		<label class="setting flex items-center gap-1 text-sm">
			<span>Stroke</span>
			<input type="color" bind:value={strokeColor} oninput={(e) => onStrokeColorChange((e.target as HTMLInputElement).value)} />
		</label>
		<label class="setting flex items-center gap-1 text-sm">
			<span>Fill</span>
			<input type="color" bind:value={fillColor} oninput={(e) => onFillColorChange((e.target as HTMLInputElement).value)} />
		</label>
		<label class="setting flex items-center gap-1 text-sm">
			<span>Width</span>
			<input
				type="number"
				min="1"
				max="20"
				bind:value={strokeWidth}
				oninput={(e) => onStrokeWidthChange(parseInt((e.target as HTMLInputElement).value))}
			/>
		</label>
		<label class="setting flex items-center gap-1 text-sm">
			<span>Font</span>
			<input
				type="number"
				min="8"
				max="128"
				bind:value={fontSize}
				oninput={(e) => onFontSizeChange(parseInt((e.target as HTMLInputElement).value))}
			/>
		</label>
	</div>
	<div class="actions flex items-center gap-2">
		<button class="danger rounded bg-error-500 px-3 py-1.5 text-sm text-white" onclick={onDelete}>Delete</button>
		<button onclick={onDeleteAll}>Clear</button>
		<div class="divider h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
		<button class="apply rounded bg-success-500 px-3 py-1.5 text-sm text-white" onclick={onDone}>Done</button>
	</div>
</div>

<style lang="postcss">
	/* All styling moved to Tailwind classes */
</style>
