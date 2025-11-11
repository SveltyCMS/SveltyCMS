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
		position: absolute;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		border-radius: 0.5rem;
		padding-left: 1rem; padding-right: 1rem;
		padding-top: 0.75rem; padding-bottom: 0.75rem;
		background-color: rgb(var(--color-surface-900) / 0.95);
		backdrop-filter: blur(10px);
		color: rgb(var(--color-surface-100));
		max-width: 100%;
	}

	.toolbar-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-right: 1px solid rgb(var(--color-surface-700));
		padding-right: 1rem;
	}

	.toolbar-section:last-child {
		border-right: none;
		padding-right: 0;
	}

	.section-label {
		font-size: 0.875rem; line-height: 1.25rem;
		font-weight: 500;
	}

	.tool-buttons {
		display: flex;
	}

	.tool-button {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		background-color: rgb(var(--color-surface-800));
		color: rgb(var(--color-surface-300));
	}

	.tool-button:hover {
		background-color: rgb(var(--color-surface-700));
		color: rgb(var(--color-surface-100));
	}

	.tool-button.active {
		color: rgb(255 255 255);
	}

	.style-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.control-group label {
		/* @apply text-surface-400; */
	}

	.control-group input[type='color'] {
		cursor: pointer;
		border-radius: 0.25rem;
		background: none;
	}

	.control-group input[type='range'] {
		/* @apply w-24; */
	}

	.value-label {
		font-size: 0.875rem; line-height: 1.25rem;
		min-width: 40px;
	}

	.transparent-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.25rem;
		background-color: rgb(var(--color-surface-800));
		color: rgb(var(--color-surface-400));
	}

	.transparent-btn:hover {
		background-color: rgb(var(--color-surface-700));
	}

	.transparent-btn.active {
		color: rgb(255 255 255);
	}

	.action-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-radius: 0.5rem;
		padding-left: 1rem; padding-right: 1rem;
		padding-top: 0.5rem; padding-bottom: 0.5rem;
		font-weight: 500;
	}

	.delete-button {
		color: rgb(255 255 255);
	}

	.reset-button {
		color: rgb(255 255 255);
	}

	.done-button {
		color: rgb(255 255 255);
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.annotate-toolbar {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
			padding-left: 0.5rem; padding-right: 0.5rem;
			padding-top: 0.5rem; padding-bottom: 0.5rem;
		}

		.toolbar-section {
			border-bottom-width: 1px;
			padding-right: 0;
		}

		.toolbar-section:last-child {
			border-bottom: none;
			padding-bottom: 0;
		}

		.section-label {
			display: none;
		}

		.tool-buttons,
		.style-controls {
			width: 100%;
			justify-content: space-between;
		}

		.action-button span {
			display: none;
		}

		.action-button {
			flex: 1 1 0%;
		}
	}
</style>
