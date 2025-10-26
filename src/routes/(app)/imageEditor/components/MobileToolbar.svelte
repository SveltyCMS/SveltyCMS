<!--
@file: /src/routes/(app)/imageEditor/MobileToolbar.svelte
@component
**Touch-optimized mobile toolbar with slide-up tool panels**
Provides horizontal scrollable tool selection and bottom sheet-style
tool controls for mobile/tablet editing experience.

#### Props
- `activeState`: Currently active tool state
- `onToolSelect`: Function called when a tool is selected
- `hasImage`: Whether an image is loaded for conditional tool availability
-->

<script lang="ts">
	// Types
	type Tool = {
		id: string;
		name: string;
		icon: string;
		description: string;
		category: string;
		disabled?: boolean;
		comingSoon?: boolean;
		actualTool?: string;
	};

	type ToolInfo = {
		title: string;
		tips: string[];
	};

	// Props
	interface Props {
		activeState: string | null;
		onToolSelect: (tool: string) => void;
		hasImage?: boolean;
	}
	let { activeState, onToolSelect, hasImage = false }: Props = $props();

	// Mobile tool panel state
	let showToolPanel = $state(false);
	let currentToolInfo = $state<ToolInfo | null>(null);

	// Tool definitions optimized for mobile
	const tools: Tool[] = [
		{
			id: 'crop',
			name: 'Crop',
			icon: 'mdi:crop',
			description: 'Crop, rotate & scale',
			category: 'transform'
		},
		{
			id: 'finetune',
			name: 'Finetune',
			icon: 'mdi:tune',
			description: 'Adjust colors',
			category: 'adjust',
			disabled: true,
			comingSoon: true
		},
		{
			id: 'blur',
			name: 'Blur',
			icon: 'mdi:blur',
			description: 'Blur regions',
			category: 'effects'
		},
		{
			id: 'annotate',
			name: 'Annotate',
			icon: 'mdi:pencil',
			description: 'Text & shapes',
			category: 'overlay',
			disabled: true,
			comingSoon: true
		},
		{
			id: 'sticker',
			name: 'Sticker',
			icon: 'mdi:sticker',
			description: 'Watermarks',
			category: 'overlay',
			actualTool: 'watermark'
		},
		{
			id: 'focal',
			name: 'Focal',
			icon: 'mdi:focus-field',
			description: 'Set focus point',
			category: 'composition',
			actualTool: 'focalpoint'
		}
	];

	// Tool help content for bottom sheet
	const toolInfo: Record<string, ToolInfo> = {
		crop: {
			title: 'Crop & Transform',
			tips: ['Pinch to zoom and pan', 'Drag corners to resize crop area', 'Tap preset ratios for quick sizing', 'Use sliders for rotation']
		},
		blur: {
			title: 'Blur Effects',
			tips: ['Tap and drag to select blur region', 'Adjust intensity with slider', 'Multiple regions supported', 'Tap outside to deselect']
		},
		focalpoint: {
			title: 'Focal Point',
			tips: ['Tap to set focal point', 'Use grid lines as guides', 'Affects smart cropping', 'Tap remove to reset']
		},
		watermark: {
			title: 'Watermark',
			tips: ['Upload watermark image', 'Drag to reposition', 'Pinch to resize', 'Use presets for quick placement']
		}
	};

	function handleToolClick(tool: Tool) {
		if (tool.disabled || !hasImage) return;

		const toolId = tool.actualTool || tool.id;

		// Trigger haptic feedback if available
		if ('vibrate' in navigator) {
			navigator.vibrate(10);
		}

		onToolSelect(toolId);

		// Show tool panel with help content
		currentToolInfo = toolInfo[toolId as keyof typeof toolInfo];
		showToolPanel = !!currentToolInfo;
	}

	function closeToolPanel() {
		showToolPanel = false;
		currentToolInfo = null;
	}

	function isToolActive(tool: Tool): boolean {
		const toolId = tool.actualTool || tool.id;
		return activeState === toolId;
	}

	// Close panel when active tool changes to empty
	$effect(() => {
		if (!activeState) {
			showToolPanel = false;
		}
	});
</script>

<div class="mobile-toolbar">
	<!-- Main toolbar with horizontal scroll -->
	<div class="toolbar-scroll scrollbar-hide">
		<div class="toolbar-tools">
			{#each tools as tool (tool.id)}
				<button
					class="mobile-tool-btn"
					class:active={isToolActive(tool)}
					class:disabled={tool.disabled || !hasImage}
					onclick={() => handleToolClick(tool)}
					aria-label={tool.name}
					disabled={tool.disabled || !hasImage}
				>
					<div class="tool-icon-wrapper">
						<iconify-icon icon={tool.icon} width="24"></iconify-icon>
						{#if tool.comingSoon}
							<div class="soon-dot"></div>
						{/if}
					</div>
					<span class="tool-name">{tool.name}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Safe area spacer for devices with home indicator -->
	<div class="safe-area-spacer"></div>
</div>

<!-- Bottom sheet tool panel -->
{#if showToolPanel && currentToolInfo}
	<button class="tool-panel-overlay" onclick={closeToolPanel} aria-label="Close tool panel"></button>
	<div class="tool-panel-sheet" class:visible={showToolPanel}>
		<div class="sheet-handle">
			<div class="handle-bar"></div>
		</div>

		<div class="sheet-content">
			<div class="sheet-header">
				<h3 class="text-lg font-semibold text-surface-700 dark:text-surface-200">
					{currentToolInfo.title}
				</h3>
				<button onclick={closeToolPanel} class="variant-ghost-surface btn-icon" aria-label="Close">
					<iconify-icon icon="mdi:close" width="20"></iconify-icon>
				</button>
			</div>

			<div class="sheet-tips">
				<h4 class="tips-title">
					<iconify-icon icon="mdi:lightbulb" width="16" class="text-warning-500"></iconify-icon>
					Quick Tips
				</h4>
				<ul class="tips-list">
					{#each currentToolInfo.tips as tip, index (index)}
						<li class="tip-item">
							<iconify-icon icon="mdi:circle-small" width="16" class="text-surface-400"></iconify-icon>
							<span class="text-sm text-surface-600 dark:text-surface-300">{tip}</span>
						</li>
					{/each}
				</ul>
			</div>

			<!-- Tool-specific controls will be injected by parent component -->
			<div class="tool-controls-placeholder">
				<p class="text-center text-sm text-surface-500 dark:text-surface-400">Tool controls appear here</p>
			</div>
		</div>
	</div>
{/if}

<style lang="postcss">
	.mobile-toolbar {
		@apply fixed bottom-0 left-0 right-0 z-40 border-t shadow-lg;
		background-color: rgb(var(--color-surface-50) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .mobile-toolbar {
		background-color: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.toolbar-scroll {
		@apply overflow-x-auto overflow-y-hidden;
		-webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
	}

	.toolbar-tools {
		@apply flex gap-1 p-2;
		@apply min-w-max; /* Prevent wrapping */
	}

	.mobile-tool-btn {
		@apply flex flex-col items-center justify-center gap-1.5 rounded-lg px-4 py-2;
		@apply transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500;
		color: rgb(var(--color-surface-600) / 1);
		min-width: 72px; /* Consistent button width */
		min-height: 56px; /* Minimum touch target size */
		-webkit-tap-highlight-color: transparent;
	}

	:global(.dark) .mobile-tool-btn {
		color: rgb(var(--color-surface-300) / 1);
	}

	.mobile-tool-btn:not(.disabled):active {
		transform: scale(0.95);
		background-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .mobile-tool-btn:not(.disabled):active {
		background-color: rgb(var(--color-surface-700) / 1);
	}

	.mobile-tool-btn.active {
		@apply bg-primary-500 text-white;
	}

	.mobile-tool-btn.active:active {
		@apply bg-primary-600;
	}

	.mobile-tool-btn.disabled {
		@apply opacity-50;
		pointer-events: none;
	}

	.tool-icon-wrapper {
		@apply relative flex items-center justify-center;
	}

	.soon-dot {
		@apply absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning-500 ring-2;
		--tw-ring-color: rgb(var(--color-surface-50) / 1);
	}

	:global(.dark) .soon-dot {
		--tw-ring-color: rgb(var(--color-surface-800) / 1);
	}

	.tool-name {
		@apply text-xs font-medium leading-none;
	}

	.safe-area-spacer {
		height: env(safe-area-inset-bottom);
		background-color: rgb(var(--color-surface-50) / 1);
	}

	:global(.dark) .safe-area-spacer {
		background-color: rgb(var(--color-surface-800) / 1);
	}

	/* Bottom sheet overlay */
	.tool-panel-overlay {
		@apply fixed inset-0 z-50;
		@apply bg-black/20 dark:bg-black/40;
		@apply transition-opacity duration-300;
		-webkit-backdrop-filter: blur(4px);
		backdrop-filter: blur(4px);
	}

	/* Bottom sheet panel */
	.tool-panel-sheet {
		@apply fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-2xl;
		@apply transition-transform duration-300 ease-out;
		background-color: rgb(var(--color-surface-50) / 1);
		transform: translateY(100%);
		max-height: 60vh;
		padding-bottom: env(safe-area-inset-bottom);
	}

	:global(.dark) .tool-panel-sheet {
		background-color: rgb(var(--color-surface-800) / 1);
	}

	.tool-panel-sheet.visible {
		transform: translateY(0);
	}

	.sheet-handle {
		@apply flex justify-center pb-1 pt-2;
		@apply cursor-grab active:cursor-grabbing;
	}

	.handle-bar {
		@apply h-1 w-12 rounded-full;
		background-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .handle-bar {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.sheet-content {
		@apply flex flex-col gap-4 p-4;
		@apply overflow-y-auto;
		max-height: calc(60vh - 3rem);
	}

	.sheet-header {
		@apply flex items-center justify-between gap-3 border-b pb-3;
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .sheet-header {
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.sheet-tips {
		@apply space-y-3;
	}

	.tips-title {
		@apply flex items-center gap-2;
		@apply text-sm font-medium text-surface-700 dark:text-surface-200;
	}

	.tips-list {
		@apply space-y-2;
	}

	.tip-item {
		@apply flex items-start gap-1;
	}

	.tool-controls-placeholder {
		@apply rounded-lg border-2 border-dashed p-8;
		background-color: rgb(var(--color-surface-100) / 1);
		border-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .tool-controls-placeholder {
		background-color: rgb(var(--color-surface-700) / 1);
		border-color: rgb(var(--color-surface-600) / 1);
	}

	/* Hide scrollbar utility */
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}

	/* Smooth scrolling */
	.sheet-content {
		scrollbar-width: thin;
		scrollbar-color: theme(colors.surface.400) transparent;
	}

	.sheet-content::-webkit-scrollbar {
		width: 4px;
	}

	.sheet-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.sheet-content::-webkit-scrollbar-thumb {
		background: theme(colors.surface.400);
		border-radius: 2px;
	}

	/* Landscape mode adjustments */
	@media (orientation: landscape) and (max-height: 500px) {
		.tool-panel-sheet {
			max-height: 80vh;
		}

		.sheet-content {
			max-height: calc(80vh - 3rem);
		}
	}

	/* Tablet optimizations */
	@media (min-width: 768px) and (max-width: 1023px) {
		.toolbar-tools {
			@apply justify-center; /* Center tools on tablet */
		}

		.mobile-tool-btn {
			min-width: 80px;
		}

		.tool-panel-sheet {
			max-height: 50vh;
		}
	}
</style>
