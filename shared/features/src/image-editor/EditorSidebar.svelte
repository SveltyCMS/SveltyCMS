<!--
@file: shared/features/src/image-editor/EditorSidebar.svelte
@component
**Left sidebar with vertical tool layout**
Provides easy access to all editing tools with clean, minimal design
and proper active state indication.

#### Props
- `activeState`: Currently active tool state
- `onToolSelect`: Function called when a tool is selected
- `hasImage`: Whether an image is loaded for conditional tool availability
-->

<script lang="ts">
	// Props
	const {
		activeState,
		onToolSelect,
		hasImage = false
	}: {
		activeState: string;
		onToolSelect: (tool: string) => void;
		hasImage?: boolean;
	} = $props();

	// Drive tools from the widgets registry, with a focalpoint fallback
	import { editorWidgets, type EditorWidget } from './widgets/registry';

	const tools = [...editorWidgets.map((w: EditorWidget) => ({ id: w.key, name: w.title, icon: w.icon ?? 'mdi:cog', description: '' }))];

	function handleToolClick(tool: any) {
		if (!hasImage) return;
		onToolSelect(tool.id);
	}

	function isToolActive(tool: any): boolean {
		return activeState === tool.id;
	}
</script>

<div class="editor-sidebar flex w-20 flex-col border-r lg:w-24">
	<div class="sidebar-tools flex flex-1 flex-col gap-1 p-1.5 lg:p-2 max-lg:gap-0.5 max-lg:p-1">
		{#each tools as tool}
			<button
				class="btn preset-filled-primary-500 group relative flex flex-col items-center justify-center gap-1 py-2"
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
				aria-label={tool.name}
				disabled={!hasImage}
			>
				<div class="tool-icon flex items-center justify-center">
					<iconify-icon icon={tool.icon} width="24"></iconify-icon>
				</div>
				<span class="tool-label text-[10px] font-medium leading-none lg:text-xs">{tool.name}</span>

				<!-- Tooltip -->
				<div
					class="tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-surface-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-surface-700 shadow-lg"
				>
					<div class="font-medium">{tool.name}</div>
					{#if tool.description}
						<div class="text-[10px] text-surface-300">{tool.description}</div>
					{/if}
					<!-- Arrow -->
					<div class="absolute -left-1 top-1/2 -mt-1 h-2 w-2 -rotate-45 bg-surface-900 dark:bg-surface-700"></div>
				</div>

				<!-- coming soon badge removed; driven by registry now -->
			</button>
		{/each}
	</div>

	<div class="sidebar-footer border-t p-2">
		{#if !hasImage}
			<div class="no-image-hint flex flex-col items-center gap-1 p-2 text-center">
				<iconify-icon icon="mdi:information-outline" width="16" class="text-surface-400"></iconify-icon>
				<span class="text-xs text-surface-500 dark:text-surface-50"> Upload an image to enable tools </span>
			</div>
		{/if}
	</div>
</div>

<style>
	.editor-sidebar {
		background-color: rgb(var(--color-surface-100) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
		min-height: 100%;
	}

	:global(.dark) .editor-sidebar {
		background-color: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.sidebar-footer {
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .sidebar-footer {
		border-color: rgb(var(--color-surface-700) / 1);
	}
</style>
