<!--
@file: src/routes/(app)/imageEditor/widgets/Annotate/Controls.svelte
@component
**Annotate tool controls for master toolbar**
(Fully styled with Tailwind)
-->
<script lang="ts">
	import type { AnnotationKind } from './regions';

	const {
		currentTool,
		strokeColor,
		fillColor,
		strokeWidth,
		fontSize,
		onSetTool,
		onStrokeColorChange,
		onFillColorChange,
		onStrokeWidthChange,
		onFontSizeChange,
		onDelete,
		onDeleteAll,
		onDone
	}: {
		currentTool: AnnotationKind | null;
		strokeColor: string;
		fillColor: string;
		strokeWidth: number;
		fontSize: number;
		onSetTool: (t: AnnotationKind) => void;
		onStrokeColorChange: (v: string) => void;
		onFillColorChange: (v: string) => void;
		onStrokeWidthChange: (v: number) => void;
		onFontSizeChange: (v: number) => void;
		onDelete: () => void;
		onDeleteAll: () => void;
		onDone: () => void;
	} = $props();

	const tools: { key: AnnotationKind; label: string; icon: string }[] = [
		{ key: 'text', label: 'Text', icon: 'mdi:format-text' },
		{ key: 'rect', label: 'Rectangle', icon: 'mdi:crop-square' },
		{ key: 'circle', label: 'Circle', icon: 'mdi:circle-outline' },
		{ key: 'arrow', label: 'Arrow', icon: 'mdi:arrow-top-right' },
		{ key: 'line', label: 'Line', icon: 'mdi:minus' }
	];

	// Local bindings for inputs
	let localStroke = $derived(strokeColor);
	let localFill = $derived(fillColor);
	let localStrokeWidth = $derived(strokeWidth);
	let localFontSize = $derived(fontSize);
</script>

<div class="annotate-controls">
	<!-- Tool Selector -->
	<div class="segment-group">
		{#each tools as t}
			<button
				class="segment-btn"
				class:active={currentTool === t.key}
				onclick={() => onSetTool(t.key)}
				aria-pressed={currentTool === t.key}
				title={t.label}
			>
				<iconify-icon icon={t.icon} width="20"></iconify-icon>
			</button>
		{/each}
	</div>
	<div class="divider"></div>

	<!-- Settings -->
	<label class="label" title="Stroke color">
		<iconify-icon icon="mdi:format-color-text" width="20"></iconify-icon>
		<input type="color" class="color-input" bind:value={localStroke} oninput={(e) => onStrokeColorChange(e.currentTarget.value)} />
	</label>
	<label class="label" title="Fill color">
		<iconify-icon icon="mdi:format-color-fill" width="20"></iconify-icon>
		<input type="color" class="color-input" bind:value={localFill} oninput={(e) => onFillColorChange(e.currentTarget.value)} />
	</label>
	<div class="divider"></div>

	<label class="label" title="Stroke width">
		<iconify-icon icon="mdi:line-scan" width="20"></iconify-icon>
		<input
			type="number"
			class="num-input"
			min="1"
			max="50"
			bind:value={localStrokeWidth}
			oninput={(e) => onStrokeWidthChange(parseInt(e.currentTarget.value))}
		/>
	</label>
	<div class="divider"></div>

	<label class="label" title="Font size">
		<iconify-icon icon="mdi:format-font-size-increase" width="20"></iconify-icon>
		<input
			type="number"
			class="num-input"
			min="8"
			max="200"
			bind:value={localFontSize}
			oninput={(e) => onFontSizeChange(parseInt(e.currentTarget.value))}
		/>
	</label>

	<div class="divider-grow"></div>

	<!-- Actions -->
	<button onclick={onDelete} class="btn-tool" title="Delete selected">
		<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
	</button>
	<button onclick={onDeleteAll} class="btn-tool" title="Delete all">
		<iconify-icon icon="mdi:delete-sweep" width="18"></iconify-icon>
	</button>
	<button onclick={onDone} class="btn-apply" title="Done">
		<iconify-icon icon="mdi:check" width="18"></iconify-icon>
		<span>Done</span>
	</button>
</div>

<style lang="postcss">
	@import "tailwindcss";
	.annotate-controls {
		@apply flex w-full items-center gap-3 px-2;
	}
	.label {
		@apply flex items-center gap-1 text-nowrap text-sm font-medium text-surface-700 dark:; color: var(--color-surface-200);
	}
	.divider {
		@apply h-6 w-px bg-surface-300 dark:; background-color: var(--color-surface-600);
	}
	.divider-grow {
		@apply flex-grow;
	}
	.btn-tool {
		@apply flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium transition-colors;
		@apply bg-surface-200 text-surface-700 dark: dark:; background-color: var(--color-surface-700); color: var(--color-surface-200);
		min-width: 36px;
	}
	.btn-tool:hover {
		@apply bg-surface-300 dark:; background-color: var(--color-surface-600);
	}
	.btn-apply {
		@apply flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white;
		@apply bg-success-500 hover:; background-color: var(--color-success-600);
	}
	.segment-group {
		@apply flex items-center rounded-lg bg-surface-200 p-0.5 dark:; background-color: var(--color-surface-700);
	}
	.segment-btn {
		@apply rounded-md px-2 py-1 transition-colors;
		@apply text-surface-500 dark:; color: var(--color-surface-400);
	}
	.segment-btn:hover:not(.active) {
		@apply text-surface-700 dark:; color: var(--color-surface-200);
	}
	.segment-btn.active {
		@apply bg-white  shadow-sm dark:; background-color: var(--color-surface-900); color: var(--color-primary-600);
	}
	.color-input {
		@apply h-6 w-6 cursor-pointer rounded border-none bg-transparent p-0;
	}
	.num-input {
		@apply w-14 rounded-md border border-surface-300 bg-white p-1 text-center text-sm dark: dark:; border-color: var(--color-surface-600); background-color: var(--color-surface-800);
	}
</style>
