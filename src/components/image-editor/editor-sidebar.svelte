<!--
@file: src/components/image-editor/editor-sidebar.svelte
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
	import { onMount } from 'svelte';
	import { type EditorWidget, editorWidgets } from './widgets/registry';

	// Props
	const {
		activeState,
		onToolSelect,
		hasImage = false,
		onCancel = () => {}
	}: {
		activeState: string;
		onToolSelect: (tool: string) => void;
		hasImage?: boolean;
		onCancel?: () => void;
	} = $props();

	// Tool list derived from registry
	const tools = $derived(
		editorWidgets.map((w: EditorWidget) => ({
			id: w.key,
			name: w.title,
			icon: w.icon ?? 'mdi:cog',
			description: w.description ?? '',
			category: w.category ?? 'general'
		}))
	);

	// Keyboard navigation
	let focusedIndex = $state(0);
	let sidebarRef: HTMLDivElement | undefined = $state(undefined);
	function handleToolClick(tool: any) {
		if (!hasImage) {
			return;
		}
		onToolSelect(tool.id);
	}

	function isToolActive(tool: any): boolean {
		return activeState === tool.id;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!hasImage) {
			return;
		}

		switch (e.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				e.preventDefault();
				focusedIndex = (focusedIndex + 1) % tools.length;
				focusToolButton(focusedIndex);
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				e.preventDefault();
				focusedIndex = (focusedIndex - 1 + tools.length) % tools.length;
				focusToolButton(focusedIndex);
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				handleToolClick(tools[focusedIndex]);
				break;
		}
	}

	function focusToolButton(index: number) {
		const buttons = sidebarRef?.querySelectorAll<HTMLButtonElement>('.tool-item');
		if (buttons?.[index]) {
			(buttons[index] as HTMLElement).focus();
		}
	}

	onMount(() => {
		// Set initial focus to active tool
		const activeIndex = tools.findIndex((t) => t.id === activeState);
		if (activeIndex !== -1) {
			focusedIndex = activeIndex;
		}
	});
</script>

<div
	bind:this={sidebarRef}
	class="editor-sidebar flex w-full flex-col border-t"
	role="toolbar"
	aria-label="Image editing tools"
	aria-orientation="horizontal"
	onkeydown={handleKeyDown}
	tabindex="0"
>
	<div class="sidebar-header hidden items-center justify-between gap-2 border-b px-3 py-3 lg:flex lg:px-4">
		<button type="button" class="cancel-btn" onclick={onCancel} title="Cancel editing">
			<iconify-icon icon="mdi:close" width="16"></iconify-icon>
			<span>Discard changes</span>
		</button>
	</div>

	<div class="sidebar-tools flex flex-1 flex-row flex-nowrap items-center justify-start gap-1.5 overflow-x-auto overflow-y-hidden px-2 py-2 lg:gap-2 lg:p-3">
		{#each tools as tool (tool.id)}
			<button
				class="tool-item group relative flex min-w-[3.35rem] flex-none items-center justify-center gap-2 rounded-xl px-2 py-2 text-center transition-all duration-200 lg:min-w-[5.75rem] lg:px-3 lg:py-2.5"
				class:tool-active={isToolActive(tool)}
				class:cursor-not-allowed={!hasImage}
				class:opacity-50={!hasImage}
				onclick={() => handleToolClick(tool)}
				aria-label={tool.name}
				aria-pressed={isToolActive(tool)}
				disabled={!hasImage}
			>
				<div class="tool-icon flex items-center justify-center"><iconify-icon icon={tool.icon} width="20"></iconify-icon></div>
				<span class="tool-label text-xs font-medium leading-none lg:text-sm">{tool.name}</span>

				<!-- Tooltip -->
				<div
					class="tooltip pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-surface-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-surface-50 shadow-lg"
				>
					<div class="font-medium">{tool.name}</div>
					{#if tool.description}
						<div class="text-[10px] text-surface-300">{tool.description}</div>
					{/if}
					<!-- Arrow -->
					<div class="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 -rotate-45 bg-surface-900 dark:bg-surface-50"></div>
				</div>

				<!-- coming soon badge removed; driven by registry now -->
			</button>
		{/each}
	</div>

	<div class="sidebar-footer hidden border-t px-3 py-2 lg:block">
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
		min-height: auto;
		background: linear-gradient(180deg, rgba(28, 28, 28, 0.98), rgba(14, 14, 14, 0.98));
		border-color: rgba(255, 255, 255, 0.08);
		border-left: none;
		border-radius: 1.15rem;
		box-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
	}

	:global(.dark) .editor-sidebar {
		background-color: rgba(15, 15, 15, 0.96);
		border-color: rgba(255, 255, 255, 0.08);
	}

	.sidebar-footer {
		border-color: rgba(255, 255, 255, 0.08);
	}

		:global(.dark) .sidebar-footer {
			border-color: rgba(255, 255, 255, 0.08);
		}

	.sidebar-header {
		border-color: rgba(255, 255, 255, 0.08);
	}

	.cancel-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.8rem 0.9rem;
		color: #e5e7eb;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.75rem;
		transition: all 0.2s ease;
	}

	.cancel-btn:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.tool-item {
		color: #d1d5db;
		background: transparent;
	}

	.tool-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.tool-item.tool-active {
		color: #ffffff;
		background: linear-gradient(135deg, rgba(76, 124, 111, 0.34), rgba(52, 104, 95, 0.14));
		box-shadow:
			inset 0 0 0 1px rgba(117, 232, 196, 0.4),
			0 10px 24px rgba(0, 0, 0, 0.18);
	}

	.tool-label {
		display: inline;
	}

	@media (max-width: 768px) {
		.editor-sidebar {
			border-top: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 0 0 1rem 1rem;
			background: linear-gradient(180deg, rgba(24, 24, 24, 0.98), rgba(12, 12, 12, 0.96));
			box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);
		}

		.tool-item {
			min-width: 0;
			width: 100%;
			padding-inline: 0.2rem;
			padding-block: 0.45rem;
			border-radius: 0.8rem;
		}

		.tool-label {
			display: none;
		}

		.sidebar-tools {
			display: grid;
			grid-template-columns: repeat(8, minmax(0, 1fr));
			justify-content: stretch;
			overflow: visible;
			gap: 0.35rem;
			padding-inline: 0.5rem;
			padding-top: 0.5rem;
			padding-bottom: 0.55rem;
		}

		.tool-icon :global(iconify-icon) {
			width: 16px;
		}
	}

	@media (min-width: 1024px) {
		.tool-label {
			display: inline;
		}
	}

	@media (min-width: 1024px) {
		.sidebar-header {
			padding-top: 0.75rem;
			padding-bottom: 0.75rem;
		}

		.sidebar-tools {
			padding-bottom: 0.75rem;
		}
	}

	@media (min-width: 1280px) {
		.editor-sidebar {
			background-color: rgba(15, 15, 15, 0.96);
		}

		.sidebar-tools {
			overflow-x: auto;
			align-content: center;
		}

		.tool-item {
			min-width: 6rem;
		}
	}
</style>
