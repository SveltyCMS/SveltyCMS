<!--
@file: src/routes/(app)/imageEditor/components/EditorSidebar.svelte
@component
**Left sidebar with Pintura-inspired vertical tool layout**
Provides easy access to all editing tools with clean, minimal design
and proper active state indication.

#### Props
- `activeState`: Currently active tool state
- `onToolSelect`: Function called when a tool is selected
- `hasImage`: Whether an image is loaded for conditional tool availability
-->

<script lang="ts">
	// Props
	let {
		activeState,
		onToolSelect,
		hasImage = false
	}: {
		activeState: string | null;
		onToolSelect: (tool: string) => void;
		hasImage?: boolean;
	} = $props();

	// Tool definitions with Pintura-inspired grouping
	interface Tool {
		id: string;
		name: string;
		icon: string;
		description: string;
		category: string;
		disabled?: boolean;
		comingSoon?: boolean;
		actualTool?: string;
	}

	const tools: Tool[] = [
		{
			id: 'crop',
			name: 'Crop',
			icon: 'mdi:crop',
			description: 'Crop, rotate, scale & flip image',
			category: 'transform'
		},
		{
			id: 'finetune',
			name: 'Finetune',
			icon: 'mdi:tune',
			description: 'Brightness, contrast, saturation',
			category: 'adjust'
		},
		{
			id: 'blur',
			name: 'Blur',
			icon: 'mdi:blur',
			description: 'Selective blur regions',
			category: 'effects'
		},
		{
			id: 'annotate',
			name: 'Annotate',
			icon: 'mdi:pencil',
			description: 'Add text and shapes',
			category: 'overlay'
		},
		{
			id: 'watermark',
			name: 'Sticker',
			icon: 'mdi:sticker',
			description: 'Add sticker images and overlays',
			category: 'overlay'
		}
	];

	function handleToolClick(tool: Tool) {
		if (tool.disabled || !hasImage) return;

		// Use actualTool mapping if available, otherwise use tool.id
		const toolId = tool.actualTool || tool.id;
		onToolSelect(toolId);
	}

	function isToolActive(tool: Tool): boolean {
		const toolId = tool.actualTool || tool.id;
		return activeState === toolId;
	}
</script>

<div class="editor-sidebar">
	<div class="sidebar-header">
		<div class="logo">
			<iconify-icon icon="tdesign:image-edit" width="24" class="text-primary-500"></iconify-icon>
		</div>
	</div>

	<div class="sidebar-tools">
		{#each tools as tool (tool.id)}
			<button
				class="tool-button"
				class:active={isToolActive(tool)}
				class:disabled={tool.disabled || !hasImage}
				class:coming-soon={tool.comingSoon}
				onclick={() => handleToolClick(tool)}
				title="{tool.name}: {tool.description}"
				aria-label={tool.name}
				disabled={tool.disabled || !hasImage}
			>
				<div class="tool-icon">
					<iconify-icon icon={tool.icon} width="24"></iconify-icon>
				</div>
				<span class="tool-label">{tool.name}</span>

				{#if tool.comingSoon}
					<div class="coming-soon-badge">
						<span class="text-xs">Soon</span>
					</div>
				{/if}
			</button>
		{/each}
	</div>

	<div class="sidebar-footer">
		{#if !hasImage}
			<div class="no-image-hint">
				<iconify-icon icon="mdi:information-outline" width="16" class="text-surface-400"></iconify-icon>
				<span class="text-xs text-surface-500 dark:text-surface-400"> Upload an image to enable tools </span>
			</div>
		{/if}
	</div>
</div>

<style lang="postcss">
	.editor-sidebar {
		@apply flex w-16 flex-col border-r lg:w-20;
		background-color: rgb(var(--color-surface-100) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
		min-height: 100%;
	}

	:global(.dark) .editor-sidebar {
		background-color: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.sidebar-header {
		@apply flex items-center justify-center border-b p-4;
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .sidebar-header {
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.logo {
		@apply flex h-8 w-8 items-center justify-center lg:h-10 lg:w-10;
	}

	.sidebar-tools {
		@apply flex flex-1 flex-col gap-1 p-2;
	}

	.tool-button {
		@apply relative flex flex-col items-center justify-center gap-1 rounded-lg p-2 transition-all duration-200 lg:p-3;
		@apply focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2;
		color: rgb(var(--color-surface-600) / 1);
		min-height: 3rem;
	}

	:global(.dark) .tool-button {
		color: rgb(var(--color-surface-300) / 1);
	}

	.tool-button:not(.disabled):hover {
		background-color: rgb(var(--color-surface-200) / 1);
		color: rgb(var(--color-surface-700) / 1);
		transform: translateY(-1px);
	}

	:global(.dark) .tool-button:not(.disabled):hover {
		background-color: rgb(var(--color-surface-700) / 1);
		color: rgb(var(--color-surface-200) / 1);
	}

	.tool-button.active {
		@apply bg-primary-500 text-white shadow-md;
	}

	.tool-button.active:hover {
		@apply bg-primary-600;
		transform: none;
	}

	.tool-button.disabled {
		@apply cursor-not-allowed opacity-50;
	}

	.tool-button.disabled:hover {
		@apply bg-transparent;
		color: rgb(var(--color-surface-600) / 1);
		transform: none;
	}

	:global(.dark) .tool-button.disabled:hover {
		color: rgb(var(--color-surface-300) / 1);
	}

	.tool-icon {
		@apply flex items-center justify-center;
	}

	.tool-label {
		@apply text-xs font-medium leading-none;
	}

	.coming-soon-badge {
		@apply absolute -right-1 -top-1 rounded-full bg-warning-500 px-1.5 py-0.5 text-warning-50;
	}

	.sidebar-footer {
		@apply border-t p-2;
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .sidebar-footer {
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.no-image-hint {
		@apply flex flex-col items-center gap-1 p-2 text-center;
	}

	/* Responsive adjustments */
	@media (max-width: 1023px) {
		.tool-label {
			@apply text-[10px];
		}

		.sidebar-tools {
			@apply gap-0.5 p-1;
		}

		.tool-button {
			@apply p-1.5;
			min-height: 2.5rem;
		}
	}

	/* Tooltip for mobile/tablet */
	@media (max-width: 1023px) {
		.tool-button {
			position: relative;
		}

		.tool-button::after {
			content: attr(title);
			position: absolute;
			left: 100%;
			top: 50%;
			transform: translateY(-50%);
			background: rgba(0, 0, 0, 0.8);
			color: white;
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 12px;
			white-space: nowrap;
			opacity: 0;
			pointer-events: none;
			transition: opacity 0.2s;
			margin-left: 8px;
			z-index: 50;
		}

		.tool-button:hover::after {
			opacity: 1;
		}
	}

	/* Hide tooltips on desktop since we have labels */
	@media (min-width: 1024px) {
		.tool-button::after {
			display: none;
		}
	}
</style>
