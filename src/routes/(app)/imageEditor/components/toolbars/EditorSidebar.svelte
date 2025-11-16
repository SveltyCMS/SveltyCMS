<!--
@file: /src/routes/(app)/imageEditor/EditorSidebar.svelte
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
		activeState: string;
		onToolSelect: (tool: string) => void;
		hasImage?: boolean;
	} = $props();

	// Drive tools from the widgets registry, with a focalpoint fallback
	import { editorWidgets } from '../../widgets/registry';

	const tools = [
		...editorWidgets.map((w) => ({ id: w.key, name: w.title, icon: w.icon ?? 'mdi:cog', description: '' })),
		{ id: 'focalpoint', name: 'Focal', icon: 'mdi:focus-field', description: 'Set focal point with rule of thirds' }
	];

	function handleToolClick(tool: any) {
		if (!hasImage) return;
		onToolSelect(tool.id);
	}

	function isToolActive(tool: any): boolean {
		return activeState === tool.id;
	}
</script>

<div class="editor-sidebar flex w-14 flex-col border-r lg:w-16">
	<div class="sidebar-tools flex flex-1 flex-col gap-1 p-1.5 lg:p-2 max-lg:gap-0.5 max-lg:p-1">
		{#each tools as tool}
			<button
				class="tool-button relative flex flex-col items-center justify-center gap-1 rounded-lg p-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 lg:p-2.5 max-lg:p-1.5"
				class:active={isToolActive(tool)}
				class:disabled={!hasImage}
				class:bg-primary-500={isToolActive(tool)}
				class:text-white={isToolActive(tool)}
				class:shadow-md={isToolActive(tool)}
				class:hover:bg-primary-600={isToolActive(tool)}
				class:cursor-not-allowed={!hasImage}
				class:opacity-50={!hasImage}
				class:bg-transparent={!hasImage}
				onclick={() => handleToolClick(tool)}
				title="{tool.name}{tool.description ? `: ${tool.description}` : ''}"
				aria-label={tool.name}
				disabled={!hasImage}
			>
				<div class="tool-icon flex items-center justify-center">
					<iconify-icon icon={tool.icon} width="24"></iconify-icon>
				</div>
				<span class="tool-label text-xs font-medium leading-none max-lg:text-[10px]">{tool.name}</span>

				<!-- coming soon badge removed; driven by registry now -->
			</button>
		{/each}
	</div>

	<div class="sidebar-footer border-t p-2">
		{#if !hasImage}
			<div class="no-image-hint flex flex-col items-center gap-1 p-2 text-center">
				<iconify-icon icon="mdi:information-outline" width="16" class="text-surface-400"></iconify-icon>
				<span class="text-xs text-surface-500 dark:text-surface-400"> Upload an image to enable tools </span>
			</div>
		{/if}
	</div>
</div>

<style lang="postcss">
	.editor-sidebar {
		background-color: rgb(var(--color-surface-100) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
		min-height: 100%;
	}

	:global(.dark) .editor-sidebar {
		background-color: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.tool-button {
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

	.tool-button.active:hover {
		transform: none;
	}

	.tool-button.disabled:hover {
		color: rgb(var(--color-surface-600) / 1);
		transform: none;
	}

	:global(.dark) .tool-button.disabled:hover {
		color: rgb(var(--color-surface-300) / 1);
	}

	.sidebar-footer {
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .sidebar-footer {
		border-color: rgb(var(--color-surface-700) / 1);
	}

	/* Responsive adjustments */
	@media (max-width: 1023px) {
		.tool-button {
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
