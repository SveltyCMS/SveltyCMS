<!--
@file: src/routes/(app)/imageEditor/components/toolbars/AnnotateTopToolbar.svelte
@component
**Top overlay toolbar for Annotation tool**
Provides tool selection (text, shapes, arrows), style controls,
and action buttons (delete, done).

#### Props
- `currentTool`: Currently selected annotation tool
- `strokeColor`: Current stroke color
- `fillColor`: Current fill color
- `strokeWidth`: Current stroke width
- `fontSize`: Current font size
- `onStyleChange`: Callback when style changes
- `onDelete`: Callback to delete selected annotation
- `onDeleteAll`: Callback to delete all annotations
- `onDone`: Callback when done annotating
-->

<script lang="ts">
	// Props
	let {
		currentTool = $bindable(),
		strokeColor = $bindable('#ff0000'),
		fillColor = $bindable('transparent'),
		strokeWidth = $bindable(2),
		fontSize = $bindable(20),
		onStyleChange = () => {},
		onDelete = () => {},
		onDeleteAll = () => {},
		onDone = () => {}
	}: {
		currentTool: string | null;
		strokeColor?: string;
		fillColor?: string;
		strokeWidth?: number;
		fontSize?: number;
		onStyleChange?: () => void;
		onDelete?: () => void;
		onDeleteAll?: () => void;
		onDone?: () => void;
	} = $props();

	const tools = [
		{ id: 'text', label: 'Text', icon: 'mdi:format-text' },
		{ id: 'rectangle', label: 'Rectangle', icon: 'mdi:rectangle-outline' },
		{ id: 'circle', label: 'Circle', icon: 'mdi:circle-outline' },
		{ id: 'arrow', label: 'Arrow', icon: 'mdi:arrow-right' },
		{ id: 'line', label: 'Line', icon: 'mdi:minus' }
	];

	function handleToolClick(toolId: string) {
		currentTool = currentTool === toolId ? null : toolId;
	}

	function handleStrokeColorChange(e: Event) {
		const target = e.target as HTMLInputElement;
		strokeColor = target.value;
		onStyleChange();
	}

	function handleFillColorChange(e: Event) {
		const target = e.target as HTMLInputElement;
		fillColor = target.value;
		onStyleChange();
	}

	function handleStrokeWidthChange(e: Event) {
		const target = e.target as HTMLInputElement;
		strokeWidth = parseInt(target.value);
		onStyleChange();
	}

	function handleFontSizeChange(e: Event) {
		const target = e.target as HTMLInputElement;
		fontSize = parseInt(target.value);
		onStyleChange();
	}
</script>

<div class="annotate-toolbar">
	<!-- Tool Selection -->
	<div class="toolbar-section">
		<span class="section-label">Tool:</span>
		<div class="tool-buttons">
			{#each tools as tool (tool.id)}
				<button
					class="tool-button"
					class:active={currentTool === tool.id}
					onclick={() => handleToolClick(tool.id)}
					title={tool.label}
					aria-label={tool.label}
				>
					<iconify-icon icon={tool.icon} width="20"></iconify-icon>
				</button>
			{/each}
		</div>
	</div>

	<!-- Style Controls -->
	<div class="toolbar-section">
		<span class="section-label">Style:</span>
		<div class="style-controls">
			<!-- Stroke Color -->
			<div class="control-group">
				<label for="stroke-color">
					<iconify-icon icon="mdi:palette" width="16"></iconify-icon>
				</label>
				<input id="stroke-color" type="color" value={strokeColor} oninput={handleStrokeColorChange} title="Stroke Color" />
			</div>

			<!-- Fill Color -->
			<div class="control-group">
				<label for="fill-color">
					<iconify-icon icon="mdi:format-color-fill" width="16"></iconify-icon>
				</label>
				<input
					id="fill-color"
					type="color"
					value={fillColor === 'transparent' ? '#ffffff' : fillColor}
					oninput={handleFillColorChange}
					title="Fill Color"
				/>
				<button
					class="transparent-btn"
					class:active={fillColor === 'transparent'}
					onclick={() => {
						fillColor = fillColor === 'transparent' ? '#ffffff' : 'transparent';
						onStyleChange();
					}}
					title="Transparent Fill"
					aria-label="Toggle transparent fill"
				>
					<iconify-icon icon="mdi:opacity" width="16"></iconify-icon>
				</button>
			</div>

			<!-- Stroke Width -->
			<div class="control-group">
				<label for="stroke-width">
					<iconify-icon icon="mdi:pencil" width="16"></iconify-icon>
				</label>
				<input id="stroke-width" type="range" min="1" max="20" value={strokeWidth} oninput={handleStrokeWidthChange} title="Stroke Width" />
				<span class="value-label">{strokeWidth}px</span>
			</div>

			<!-- Font Size (for text) -->
			{#if currentTool === 'text'}
				<div class="control-group">
					<label for="font-size">
						<iconify-icon icon="mdi:format-size" width="16"></iconify-icon>
					</label>
					<input id="font-size" type="range" min="12" max="72" value={fontSize} oninput={handleFontSizeChange} title="Font Size" />
					<span class="value-label">{fontSize}px</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="toolbar-section">
		<button class="action-button delete-button" onclick={onDelete} title="Delete Selected">
			<iconify-icon icon="mdi:delete" width="20"></iconify-icon>
			<span>Delete</span>
		</button>
		<button class="action-button reset-button" onclick={onDeleteAll} title="Delete All">
			<iconify-icon icon="mdi:delete-sweep" width="20"></iconify-icon>
			<span>Clear All</span>
		</button>
		<button class="action-button done-button" onclick={onDone} title="Done">
			<iconify-icon icon="mdi:check" width="20"></iconify-icon>
			<span>Done</span>
		</button>
	</div>
</div>

<style lang="postcss">
	@import "tailwindcss/theme";
	.annotate-toolbar {
		@apply absolute left-0 right-0 top-0 z-40;
		@apply flex flex-wrap items-center gap-4 rounded-lg px-4 py-3 shadow-lg;
		background-color: rgb(var(--color-surface-900) / 0.95);
		backdrop-filter: blur(10px);
		color: rgb(var(--color-surface-100));
		max-width: 100%;
	}

	.toolbar-section {
		@apply flex items-center gap-2;
		border-right: 1px solid rgb(var(--color-surface-700));
		padding-right: 1rem;
	}

	.toolbar-section:last-child {
		border-right: none;
		padding-right: 0;
	}

	.section-label {
		@apply text-sm font-medium text-surface-400;
	}

	.tool-buttons {
		@apply flex gap-1;
	}

	.tool-button {
		@apply flex h-10 w-10 items-center justify-center rounded-lg transition-all;
		background-color: rgb(var(--color-surface-800));
		color: rgb(var(--color-surface-300));
	}

	.tool-button:hover {
		background-color: rgb(var(--color-surface-700));
		color: rgb(var(--color-surface-100));
	}

	.tool-button.active {
		@apply bg-primary-500 text-white;
	}

	.style-controls {
		@apply flex flex-wrap items-center gap-3;
	}

	.control-group {
		@apply flex items-center gap-2;
	}

	.control-group label {
		@apply text-surface-400;
	}

	.control-group input[type='color'] {
		@apply h-8 w-12 cursor-pointer rounded border-0;
		background: none;
	}

	.control-group input[type='range'] {
		@apply w-24;
	}

	.value-label {
		@apply text-sm text-surface-300;
		min-width: 40px;
	}

	.transparent-btn {
		@apply flex h-8 w-8 items-center justify-center rounded transition-all;
		background-color: rgb(var(--color-surface-800));
		color: rgb(var(--color-surface-400));
	}

	.transparent-btn:hover {
		background-color: rgb(var(--color-surface-700));
	}

	.transparent-btn.active {
		@apply bg-primary-500 text-white;
	}

	.action-button {
		@apply flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-all;
	}

	.delete-button {
		@apply bg-red-500 text-white hover:bg-red-600;
	}

	.reset-button {
		@apply bg-orange-500 text-white hover:bg-orange-600;
	}

	.done-button {
		@apply bg-green-500 text-white hover:bg-green-600;
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.annotate-toolbar {
			@apply flex-col items-stretch gap-2 px-2 py-2;
		}

		.toolbar-section {
			@apply border-b border-r-0 pb-2;
			padding-right: 0;
		}

		.toolbar-section:last-child {
			border-bottom: none;
			padding-bottom: 0;
		}

		.section-label {
			@apply hidden;
		}

		.tool-buttons,
		.style-controls {
			@apply w-full justify-between;
		}

		.action-button span {
			@apply hidden;
		}

		.action-button {
			@apply flex-1;
		}
	}
</style>
