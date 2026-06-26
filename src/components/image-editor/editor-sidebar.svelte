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

<aside
	bind:this={sidebarRef}
	class="editor-sidebar editor-glass-sidebar flex h-auto min-h-0 w-16 shrink-0 flex-col items-center self-stretch overflow-x-hidden overflow-y-auto py-2"
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
				class="tool-item"
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
				<span class="tool-icon" aria-hidden="true">
					<iconify-icon icon={tool.icon} width="20"></iconify-icon>
				</span>
				<span class="tool-label">{tool.name}</span>
			</button>
		{/each}
	</div>
</aside>

<style>
	.tool-item {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		padding: 0;
		color: var(--editor-chrome-text, rgba(255, 255, 255, 0.55));
		cursor: pointer;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--editor-radius-control, 0.5rem);
		transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
	}

	.tool-item:hover:not(:disabled) {
		color: var(--editor-chrome-text-hover, rgba(255, 255, 255, 0.92));
		background: var(--editor-chrome-elevated, rgba(255, 255, 255, 0.06));
		border-color: var(--editor-chrome-border, rgba(255, 255, 255, 0.07));
	}

	.tool-item.tool-active {
		color: var(--editor-chrome-text-active, #fff);
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.14);
	}

	.editor-glass-sidebar {
		background: var(--editor-chrome-bg, #0a0a0a);
		border-inline-end: 1px solid var(--editor-chrome-border, rgba(255, 255, 255, 0.07));
	}

	.tool-item:focus-visible:not(.tool-active) {
		outline: 2px solid rgba(255, 255, 255, 0.3);
		outline-offset: 2px;
	}

	.tool-item.tool-active:focus-visible {
		outline: 2px solid rgba(255, 255, 255, 0.45);
		outline-offset: 2px;
	}

	.tool-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.tool-label {
		max-width: 3.25rem;
		overflow: hidden;
		font-size: 0.5625rem;
		font-weight: 500;
		line-height: 1;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
		letter-spacing: 0.01em;
	}
</style>
