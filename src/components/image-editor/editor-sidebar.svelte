<!--
@file: src/components/image-editor/editor-sidebar.svelte
@component
**Accessible vertical editing tool sidebar**

Minimal Pintura-style left rail — icon + label, no card borders or divider lines.
Active tool uses a soft rounded square highlight only.

#### Features:
- Keyboard navigation (arrow keys, Enter/Space)
- ARIA live region for tool selection announcements
-->
<script lang="ts">
	import Slot from '@components/system/slot.svelte';
	import { onMount, tick } from 'svelte';
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { type EditorWidget, editorWidgets } from './widgets/registry';

	const {
		onToolSelect,
		hasImage = false
	}: {
		onToolSelect: (tool: string) => void;
		hasImage?: boolean;
	} = $props();

	const selectedToolId = $derived(imageEditorStore.state.activeState);

	const tools = $derived(
		editorWidgets.map((w: EditorWidget) => ({
			id: w.key,
			name: w.title,
			icon: w.icon ?? 'mdi:cog',
			description: w.description ?? ''
		}))
	);

	let announcement = $state('');
	let focusedIndex = $state(0);
	let sidebarRef: HTMLElement | undefined = $state(undefined);

	$effect(() => {
		const activeId = imageEditorStore.state.activeState;
		const activeIndex = tools.findIndex((t) => t.id === activeId);
		if (activeIndex !== -1) {
			focusedIndex = activeIndex;
		}
	});

	function handleToolClick(tool: { id: string; name: string }) {
		if (!hasImage) return;
		onToolSelect(tool.id);
		announcement = `${tool.name} tool activated. Adjust settings in the toolbar below.`;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!hasImage) return;
		const total = tools.length;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				focusedIndex = (focusedIndex + 1) % total;
				focusToolButton(focusedIndex);
				break;
			case 'ArrowUp':
				e.preventDefault();
				focusedIndex = (focusedIndex - 1 + total) % total;
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
			buttons[index].focus();
		}
	}

	export function focusFirstTool() {
		focusedIndex = 0;
		focusToolButton(0);
	}

	onMount(() => {
		const activeIndex = tools.findIndex((t) => t.id === selectedToolId);
		if (activeIndex !== -1) {
			focusedIndex = activeIndex;
		}
	});
</script>

<div
	bind:this={sidebarRef}
	class="editor-sidebar editor-glass-sidebar flex h-auto min-h-0 w-16 shrink-0 flex-col items-center self-stretch overflow-x-hidden overflow-y-auto py-2 bg-[--editor-chrome-bg] border-e border-[--editor-chrome-border]"
	role="tablist"
	aria-label="Image editing tools"
	aria-orientation="vertical"
	onkeydown={handleKeyDown}
	tabindex="0"
>
	<div class="sr-only" aria-live="assertive" aria-atomic="true">
		{announcement}
	</div>

	<div class="sidebar-tools flex w-full flex-col items-center gap-1 px-1">
		{#each tools as tool, idx (tool.id)}
			<button
					class="tool-item flex flex-col gap-[0.3rem] items-center justify-center w-12 h-12 p-0 cursor-pointer bg-transparent border border-transparent rounded-[--editor-radius-control] transition-[background,color,border-color] duration-150 text-[--editor-chrome-text] enabled:hover:text-[--editor-chrome-text-hover] enabled:hover:bg-[--editor-chrome-elevated] enabled:hover:border-[--editor-chrome-border] focus-visible:outline-2 focus-visible:outline-white/30 focus-visible:outline-offset-2"
					class:tool-active={selectedToolId === tool.id}
					class:cursor-not-allowed={!hasImage}
					class:opacity-40={!hasImage}
				onclick={() => handleToolClick(tool)}
				role="tab"
				aria-selected={selectedToolId === tool.id}
				aria-label="{tool.name}{tool.description ? ' — ' + tool.description : ''}"
				aria-posinset={idx + 1}
				aria-setsize={tools.length}
				disabled={!hasImage}
				title={tool.name}
			>
				<span class="tool-icon flex items-center justify-center leading-none" aria-hidden="true">
					<iconify-icon icon={tool.icon} width="20"></iconify-icon>
				</span>
				<span class="tool-label max-w-13 overflow-hidden text-[9px] font-medium leading-none text-center truncate tracking-[0.01em]">{tool.name}</span>
			</button>
		{/each}

		<!-- Plugin-provided image editor tools (image_editor_tool zone) -->
		<Slot
			name="image_editor_tool"
			inline
			props={{ activeState: selectedToolId, onToolSelect, hasImage }}
		/>
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
.tool-active {
	color: var(--editor-chrome-text-active, #fff);
	background: rgba(255, 255, 255, 0.1);
	border-color: rgba(255, 255, 255, 0.14);
}

.tool-active:focus-visible {
	outline-color: rgba(255, 255, 255, 0.45);
}
</style>
