<!--
@file: /src/routes/(app)/imageEditor/EditorToolPanel.svelte
@component
**Right panel for tool-specific settings and controls**
Shows contextual controls based on the currently active tool.
Provides a clean interface for tool parameters and quick actions.

#### Props
- `activeState`: Currently active tool state
- `onClose`: Function called when panel should be closed
-->

<script lang="ts">
	// Props
	let {
		activeState,
		onClose
	}: {
		activeState: string;
		onClose: () => void;
	} = $props();

	// Tool configuration and help text
	const toolInfo = {
		crop: {
			title: 'Crop & Transform',
			description: 'Crop, rotate, scale and flip your image',
			tips: [
				'Drag the corners to resize the crop area',
				'Use rotation slider for precise angles',
				'Hold Shift while dragging to maintain aspect ratio',
				'Click preset buttons for common aspect ratios'
			]
		},
		blur: {
			title: 'Blur Effects',
			description: 'Apply selective blur to regions of your image',
			tips: [
				'Drag to select the area to blur',
				'Adjust blur intensity with the slider',
				'Use circular or rectangular selection',
				'Multiple blur regions can be applied'
			]
		},
		focalpoint: {
			title: 'Focal Point',
			description: 'Set the focal point with rule of thirds guide',
			tips: [
				'Click to set the focal point',
				'Use the rule of thirds grid as a guide',
				'Focal point affects image cropping behavior',
				'Remove focal point to return to center'
			]
		},
		watermark: {
			title: 'Watermark',
			description: 'Add watermarks and overlays to your image',
			tips: [
				'Upload an image to use as watermark',
				'Drag the watermark to reposition',
				'Adjust opacity and size with controls',
				'Use position presets for quick placement'
			]
		},
		filter: {
			title: 'Filters',
			description: 'Apply color filters and effects',
			tips: [
				'Choose from preset filter effects',
				'Adjust filter intensity',
				'Combine multiple filters for unique looks',
				'Reset to original at any time'
			]
		},
		textoverlay: {
			title: 'Text',
			description: 'Add text overlays to your image',
			tips: [
				'Click to add text at that position',
				'Choose font family, size, and color',
				'Drag text to reposition',
				'Double-click text to edit content'
			]
		},
		shapeoverlay: {
			title: 'Shapes',
			description: 'Add geometric shapes and arrows',
			tips: ['Select shape type from toolbar', 'Click and drag to create shape', 'Adjust fill and stroke colors', 'Resize using corner handles']
		},
		finetune: {
			title: 'Fine-Tune',
			description: 'Adjust brightness, contrast, saturation and more',
			tips: [
				'Use presets for quick enhancements',
				'Adjust individual sliders for precise control',
				'Hold the compare button to see original',
				'Combine multiple adjustments for best results'
			]
		}
	};

	const currentTool = $derived(toolInfo[activeState as keyof typeof toolInfo]);
</script>

<div class="editor-tool-panel" class:hidden={!activeState}>
	{#if activeState && currentTool}
		<div class="panel-header">
			<div class="panel-title">
				<h3 class="text-lg font-semibold text-surface-700 dark:text-surface-200">
					{currentTool.title}
				</h3>
				<p class="text-sm text-surface-500 dark:text-surface-400">
					{currentTool.description}
				</p>
			</div>
			<button onclick={onClose} class="variant-ghost btn-icon" aria-label="Close panel" title="Close panel">
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</button>
		</div>

		<div class="panel-content">
			<!-- Tool-specific content will be injected here by the main editor -->
			<div class="tool-placeholder">
				<div class="placeholder-icon">
					<iconify-icon icon="mdi:cog" width="24" class="text-surface-400 dark:text-surface-500"></iconify-icon>
				</div>
				<p class="text-sm text-surface-600 dark:text-surface-300">Tool controls will appear here</p>
			</div>

			<!-- Help section -->
			<div class="help-section">
				<h4 class="help-title">
					<iconify-icon icon="mdi:lightbulb" width="16" class="text-warning-500"></iconify-icon>
					Tips
				</h4>
				<ul class="help-tips">
					{#each currentTool.tips as tip}
						<li class="tip-item">
							<iconify-icon icon="mdi:circle-small" width="16" class="text-surface-400"></iconify-icon>
							<span class="text-sm text-surface-600 dark:text-surface-300">{tip}</span>
						</li>
					{/each}
				</ul>
			</div>

			<!-- Quick actions -->
			<div class="quick-actions">
				<h4 class="action-title">Quick Actions</h4>
				<div class="action-buttons">
					<button class="variant-outline-surface btn btn-sm w-full">
						<iconify-icon icon="mdi:undo" width="16" class="mr-1"></iconify-icon>
						Reset
					</button>
					<button class="variant-filled-primary btn btn-sm w-full">
						<iconify-icon icon="mdi:check" width="16" class="mr-1"></iconify-icon>
						Apply
					</button>
				</div>
			</div>
		</div>

		<!-- Keyboard shortcuts -->
		<div class="panel-footer">
			<div class="shortcuts">
				<h5 class="shortcuts-title">Keyboard Shortcuts</h5>
				<div class="shortcut-list">
					<div class="shortcut-item">
						<kbd class="kbd-sm kbd">Esc</kbd>
						<span class="text-xs text-surface-500">Exit tool</span>
					</div>
					<div class="shortcut-item">
						<kbd class="kbd-sm kbd">⌘Z</kbd>
						<span class="text-xs text-surface-500">Undo</span>
					</div>
					<div class="shortcut-item">
						<kbd class="kbd-sm kbd">⌘⇧Z</kbd>
						<span class="text-xs text-surface-500">Redo</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.editor-tool-panel {
		@apply flex w-80 flex-col border-l;
		@apply transition-all duration-300 ease-in-out;
		background-color: rgb(var(--color-surface-50) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
		min-height: 100%;
	}

	:global(.dark) .editor-tool-panel {
		background-color: rgb(var(--color-surface-800) / 1) !important;
		border-color: rgb(var(--color-surface-700) / 1) !important;
	}

	.editor-tool-panel.hidden {
		transform: translateX(100%);
		opacity: 0;
		pointer-events: none;
	}

	.panel-header {
		@apply flex items-start justify-between gap-3 border-b p-4;
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .panel-header {
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.panel-title {
		@apply flex-1;
	}

	.panel-title h3 {
		@apply mb-1;
	}

	.panel-content {
		@apply flex flex-1 flex-col gap-6 overflow-y-auto p-4;
	}

	.tool-placeholder {
		@apply flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8;
		background-color: rgb(var(--color-surface-100) / 1);
		border-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .tool-placeholder {
		background-color: rgb(var(--color-surface-700) / 1);
		border-color: rgb(var(--color-surface-600) / 1);
	}

	.placeholder-icon {
		@apply flex h-12 w-12 items-center justify-center rounded-full;
		background-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .placeholder-icon {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.help-section {
		@apply space-y-3;
	}

	.help-title {
		@apply flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-200;
	}

	.help-tips {
		@apply space-y-2;
	}

	.tip-item {
		@apply flex items-start gap-1;
	}

	.quick-actions {
		@apply space-y-3;
	}

	.action-title {
		@apply text-sm font-medium text-surface-700 dark:text-surface-200;
	}

	.action-buttons {
		@apply flex flex-col gap-2;
	}

	.panel-footer {
		@apply border-t p-4;
		background-color: rgb(var(--color-surface-100) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .panel-footer {
		background-color: rgb(var(--color-surface-700) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.shortcuts {
		@apply space-y-2;
	}

	.shortcuts-title {
		@apply text-xs font-medium uppercase tracking-wider text-surface-600 dark:text-surface-300;
	}

	.shortcut-list {
		@apply space-y-1;
	}

	.shortcut-item {
		@apply flex items-center justify-between;
	}

	/* Custom kbd styling */
	.kbd {
		@apply border border-surface-300 bg-surface-200 px-1.5 py-0.5 dark:border-surface-500 dark:bg-surface-600;
		@apply rounded font-mono text-xs text-surface-700 dark:text-surface-200;
	}

	.kbd-sm {
		@apply px-1 py-0.5 text-[10px];
	}

	/* Responsive adjustments */
	@media (max-width: 1279px) {
		.editor-tool-panel {
			@apply w-64;
		}

		.panel-content {
			@apply gap-4 p-3;
		}

		.panel-header {
			@apply p-3;
		}

		.panel-footer {
			@apply p-3;
		}
	}

	/* Hide on tablet and mobile */
	@media (max-width: 1023px) {
		.editor-tool-panel {
			display: none;
		}
	}

	/* Smooth scrolling */
	.panel-content {
		scrollbar-width: thin;
		scrollbar-color: theme(colors.surface.400) transparent;
	}

	.panel-content::-webkit-scrollbar {
		width: 4px;
	}

	.panel-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.panel-content::-webkit-scrollbar-thumb {
		background: theme(colors.surface.400);
		border-radius: 2px;
	}

	.panel-content::-webkit-scrollbar-thumb:hover {
		background: theme(colors.surface.500);
	}
</style>
