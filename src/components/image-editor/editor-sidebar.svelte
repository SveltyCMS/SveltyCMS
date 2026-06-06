<!--
@file: src/components/image-editor/editor-sidebar.svelte
@component
**Accessible editing tool sidebar**

Horizontal toolbar with keyboard-driven navigation, ARIA announcements,
and proper focus management. Renders tools from the auto-discovered registry.

#### Props
- `activeState`: Currently active tool state
- `onToolSelect`: Function called when a tool is selected
- `hasImage`: Whether an image is loaded for conditional tool availability
- `onCancel`: Function called when the cancel button is clicked

#### Features:
- Keyboard navigation (arrow keys, Enter/Space)
- ARIA live region for tool selection announcements
- Focus management with active tool tracking
- Responsive layout (horizontal on mobile, wraps on desktop)
-->

<script lang="ts">
	import { onMount, tick } from 'svelte';
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

	// Accessibility: announce tool changes to screen readers
	let announcement = $state('');

	// Keyboard navigation with column-aware grid layout
	let focusedIndex = $state(0);
	let sidebarRef: HTMLDivElement | undefined = $state(undefined);
	let gridColumns = $state(1);

	// Detect number of visible columns for grid-based keyboard nav
	function updateGridColumns() {
		if (!sidebarRef) return;
		const toolsContainer = sidebarRef.querySelector('.sidebar-tools') as HTMLElement;
		if (!toolsContainer) return;
		const style = getComputedStyle(toolsContainer);
		gridColumns = style.gridTemplateColumns.split(' ').length || 1;
	}

	function handleToolClick(tool: { id: string; name: string }) {
		if (!hasImage) return;
		const isSame = activeState === tool.id;
		onToolSelect(tool.id);
		announcement = isSame
			? `Deselected ${tool.name} tool`
			: `${tool.name} tool activated. Adjust settings in the toolbar below.`;
	}

	function isToolActive(tool: { id: string }): boolean {
		return activeState === tool.id;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!hasImage) return;
		const total = tools.length;

		switch (e.key) {
			case 'ArrowRight':
				e.preventDefault();
				focusedIndex = (focusedIndex + 1) % total;
				focusToolButton(focusedIndex);
				break;
			case 'ArrowLeft':
				e.preventDefault();
				focusedIndex = (focusedIndex - 1 + total) % total;
				focusToolButton(focusedIndex);
				break;
			case 'ArrowUp':
				e.preventDefault();
				focusedIndex = (focusedIndex - gridColumns + total) % total;
				focusToolButton(focusedIndex);
				break;
			case 'ArrowDown':
				e.preventDefault();
				focusedIndex = (focusedIndex + gridColumns) % total;
				focusToolButton(focusedIndex);
				break;
			case 'Home':
				e.preventDefault();
				focusedIndex = 0;
				focusToolButton(0);
				break;
			case 'End':
				e.preventDefault();
				focusedIndex = total - 1;
				focusToolButton(total - 1);
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				handleToolClick(tools[focusedIndex]);
				break;
		}
	}

	async function focusToolButton(index: number) {
		await tick();
		const buttons = sidebarRef?.querySelectorAll<HTMLButtonElement>('.tool-item');
		if (buttons?.[index]) {
			(buttons[index] as HTMLElement).focus();
		}
	}

	// Exposed method for parent to focus the first tool
	export function focusFirstTool() {
		focusedIndex = 0;
		focusToolButton(0);
	}

	onMount(() => {
		updateGridColumns();
		const activeIndex = tools.findIndex((t) => t.id === activeState);
		if (activeIndex !== -1) {
			focusedIndex = activeIndex;
		}
		// Recalculate columns on resize
		const observer = new ResizeObserver(() => updateGridColumns());
		if (sidebarRef) observer.observe(sidebarRef);
		return () => observer.disconnect();
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
	<!-- Screen reader announcements -->
	<div class="sr-only" aria-live="assertive" aria-atomic="true">
		{announcement}
	</div>

	<div class="sidebar-header hidden items-center justify-between gap-2 border-b px-3 py-3 lg:flex lg:px-4">
		<button
			type="button"
			class="cancel-btn"
			onclick={onCancel}
			title="Cancel editing (Esc)"
			aria-label="Cancel editing — discards all changes"
			aria-keyshortcuts="Escape"
		>
			<iconify-icon icon="mdi:close" width="16" aria-hidden="true"></iconify-icon>
			<span>Discard changes</span>
		</button>
	</div>

	<div class="sidebar-tools flex flex-1 flex-row flex-nowrap items-center justify-start gap-1.5 overflow-x-auto overflow-y-hidden px-2 py-2 lg:gap-2 lg:p-3">
		{#each tools as tool, idx (tool.id)}
			<button
				class="tool-item group relative flex min-w-[3.35rem] flex-none items-center justify-center gap-2 rounded-xl px-2 py-2 text-center transition-all duration-200 lg:min-w-[5.75rem] lg:px-3 lg:py-2.5"
				class:tool-active={isToolActive(tool)}
				class:cursor-not-allowed={!hasImage}
				class:opacity-50={!hasImage}
				onclick={() => handleToolClick(tool)}
				role="radio"
				aria-checked={isToolActive(tool)}
				aria-label="{tool.name}{tool.description ? ' — ' + tool.description : ''}"
				aria-posinset={idx + 1}
				aria-setsize={tools.length}
				disabled={!hasImage}
			>
				<div class="tool-icon flex items-center justify-center" aria-hidden="true">
					<iconify-icon icon={tool.icon} width="20"></iconify-icon>
				</div>
				<span class="tool-label text-xs font-medium leading-none lg:text-sm">{tool.name}</span>

				<!-- Tooltip -->
				<div
					class="tooltip pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-surface-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-surface-50 shadow-lg"
				>
					<div class="font-medium">{tool.name}</div>
					{#if tool.description}
						<div class="text-[10px] text-surface-300">{tool.description}</div>
					{/if}
					<!-- Arrow -->
					<div class="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 -rotate-45 bg-surface-900 dark:bg-surface-50"></div>
				</div>
			</button>
		{/each}
	</div>

	<div class="sidebar-footer hidden border-t px-3 py-2 lg:block">
		{#if !hasImage}
			<div class="no-image-hint flex flex-col items-center gap-1 p-2 text-center" aria-hidden="true">
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
