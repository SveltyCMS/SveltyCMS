<!--
@file: src/components/image-editor/editor-toolbar.svelte
@component
**Pintura-style professional top toolbar**

Three-zone grid: compare (start), undo/redo + zoom (center), Done (end).
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';

	let {
		onsave,
		isSaving,
		onZoomIn = () => {},
		onZoomOut = () => {},
		onZoomReset = () => {}
	}: {
		onsave: () => void;
		isSaving: boolean;
		onZoomIn?: () => void;
		onZoomOut?: () => void;
		onZoomReset?: () => void;
	} = $props();

	const canUndo = $derived(imageEditorStore.canUndoState);
	const canRedo = $derived(imageEditorStore.canRedoState);
	const isComparing = $derived(imageEditorStore.compareSliderPosition > 0);
	const zoomPercent = $derived(Math.round(imageEditorStore.state.zoom * 100));

	function handleKeyDown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

		const cmdOrCtrl = e.metaKey || e.ctrlKey;

		if (cmdOrCtrl && e.key === 's') {
			e.preventDefault();
			onsave();
		}

		if (cmdOrCtrl && !e.shiftKey && e.key === 'z') {
			e.preventDefault();
			imageEditorStore.handleUndo();
		}

		if ((cmdOrCtrl && e.shiftKey && e.key === 'z') || (cmdOrCtrl && e.key === 'y')) {
			e.preventDefault();
			imageEditorStore.handleRedo();
		}
	}

	function toggleCompare() {
		imageEditorStore.compareSliderPosition = imageEditorStore.compareSliderPosition > 0 ? 0 : 50;
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<header class="editor-toolbar editor-glass-bar" role="toolbar" aria-label="Image editor">
	<div class="editor-chrome-toolbar">
		<div class="editor-chrome-zone-start">
			<button
				type="button"
				class="editor-toolbar-solo-btn"
				class:editor-toolbar-solo-btn-active={isComparing}
				onclick={toggleCompare}
				title="Compare before / after"
				aria-pressed={isComparing}
				aria-label="Toggle compare mode"
			>
				<iconify-icon icon="mdi:history" width="18" aria-hidden="true"></iconify-icon>
			</button>
		</div>

		<div class="editor-chrome-zone-center">
			<div class="editor-chrome-pill editor-toolbar-center-cluster">
				<button
					type="button"
					class="editor-chrome-icon-btn"
					onclick={() => imageEditorStore.handleUndo()}
					disabled={!canUndo}
					title="Undo (Mod+Z)"
					aria-label="Undo last change"
					aria-keyshortcuts="Mod+Z"
				>
					<iconify-icon icon="mdi:undo" width="18" aria-hidden="true"></iconify-icon>
				</button>
				<button
					type="button"
					class="editor-chrome-icon-btn"
					onclick={() => imageEditorStore.handleRedo()}
					disabled={!canRedo}
					title="Redo (Mod+Shift+Z)"
					aria-label="Redo last undone change"
					aria-keyshortcuts="Mod+Shift+Z"
				>
					<iconify-icon icon="mdi:redo" width="18" aria-hidden="true"></iconify-icon>
				</button>

				<div class="editor-toolbar-divider" aria-hidden="true"></div>

				<div class="zoom-pill" role="group" aria-label="Zoom controls">
					<button
						type="button"
						class="zoom-pill-btn"
						onclick={onZoomOut}
						title="Zoom out (-)"
						aria-label="Zoom out"
						aria-keyshortcuts="-"
					>
						<iconify-icon icon="mdi:minus" width="15" aria-hidden="true"></iconify-icon>
					</button>
					<button
						type="button"
						class="zoom-pill-value"
						onclick={onZoomReset}
						title="Reset zoom (0)"
						aria-label="Reset zoom to fit"
						aria-keyshortcuts="0"
					>
						{zoomPercent}%
					</button>
					<button
						type="button"
						class="zoom-pill-btn"
						onclick={onZoomIn}
						title="Zoom in (+)"
						aria-label="Zoom in"
						aria-keyshortcuts="+"
					>
						<iconify-icon icon="mdi:plus" width="15" aria-hidden="true"></iconify-icon>
					</button>
				</div>
			</div>
		</div>

		<div class="editor-chrome-zone-end">
			<button
				type="button"
				class="editor-chrome-done"
				onclick={onsave}
				disabled={isSaving}
				title="Save changes (Mod+S)"
				aria-label="Save edited image"
				aria-keyshortcuts="Mod+S"
			>
				{#if isSaving}
					<iconify-icon icon="mdi:loading" width="16" class="animate-spin" aria-hidden="true"></iconify-icon>
				{/if}
				<span>Done</span>
			</button>
		</div>
	</div>

	{#if imageEditorStore.state.error}
		<div
			class="editor-toolbar-error"
			transition:fade={{ duration: 200 }}
			role="alert"
		>
			<iconify-icon icon="mdi:alert-circle" width="16" aria-hidden="true"></iconify-icon>
			<span>{imageEditorStore.state.error}</span>
			<button
				type="button"
				class="editor-toolbar-error-dismiss"
				onclick={() => imageEditorStore.setError(null)}
				aria-label="Dismiss error"
			>
				<iconify-icon icon="mdi:close" width="14" aria-hidden="true"></iconify-icon>
			</button>
		</div>
	{/if}
</header>

<style>
	.editor-toolbar {
		position: relative;
		z-index: 30;
		flex-shrink: 0;
		padding: 0.5rem 1rem;
		background: var(--editor-chrome-bg, #0a0a0a);
		border-bottom: 1px solid var(--editor-chrome-border, rgba(255, 255, 255, 0.07));
	}

	.editor-toolbar-solo-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--editor-control-h, 2.25rem);
		height: var(--editor-control-h, 2.25rem);
		color: var(--editor-chrome-text, rgba(255, 255, 255, 0.68));
		cursor: pointer;
		background: var(--editor-chrome-elevated, rgba(255, 255, 255, 0.06));
		border: 1px solid var(--editor-chrome-border, rgba(255, 255, 255, 0.07));
		border-radius: var(--editor-radius-control, 0.5rem);
		transition:
			background 0.15s ease,
			color 0.15s ease,
			border-color 0.15s ease;
	}

	.editor-toolbar-solo-btn:hover {
		color: var(--editor-chrome-text-hover, rgba(255, 255, 255, 0.92));
		background: rgba(255, 255, 255, 0.1);
	}

	.editor-toolbar-solo-btn-active {
		color: var(--editor-chrome-text-active, #fff);
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.14);
	}

	.editor-toolbar-center-cluster {
		gap: 0.125rem;
		padding-inline: 0.1875rem;
	}

	.editor-toolbar-divider {
		flex-shrink: 0;
		width: 1px;
		height: 1.25rem;
		margin-inline: 0.125rem;
		background: var(--editor-chrome-border, rgba(255, 255, 255, 0.07));
	}

	.zoom-pill {
		display: inline-flex;
		align-items: center;
		height: calc(var(--editor-control-h, 2.25rem) - 0.25rem);
		overflow: hidden;
		background: transparent;
		border: none;
		border-radius: var(--editor-radius-pill, 9999px);
	}

	.zoom-pill-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 100%;
		color: var(--editor-chrome-text, rgba(255, 255, 255, 0.68));
		cursor: pointer;
		background: transparent;
		border: none;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.zoom-pill-btn:hover {
		color: var(--editor-chrome-text-active, #fff);
		background: rgba(255, 255, 255, 0.08);
		border-radius: var(--editor-radius-pill, 9999px);
	}

	.zoom-pill-value {
		min-width: 3rem;
		padding-inline: 0.25rem;
		font-size: 0.75rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--editor-chrome-text-hover, rgba(255, 255, 255, 0.92));
		text-align: center;
		cursor: pointer;
		background: transparent;
		border: none;
		border-inline: 1px solid var(--editor-chrome-border-subtle, rgba(255, 255, 255, 0.05));
	}

	.zoom-pill-value:hover {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 0.25rem;
	}

	.editor-toolbar-error {
		position: absolute;
		inset-inline-start: 50%;
		top: calc(100% + 0.375rem);
		z-index: 50;
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.4rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: #fff;
		white-space: nowrap;
		background: rgba(220, 38, 38, 0.94);
		border-radius: var(--editor-radius-pill, 9999px);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
		transform: translateX(-50%);
	}

	.editor-toolbar-error-dismiss {
		display: inline-flex;
		padding: 0.125rem;
		color: inherit;
		cursor: pointer;
		background: transparent;
		border: none;
		border-radius: var(--editor-radius-pill, 9999px);
		opacity: 0.85;
	}

	.editor-toolbar-error-dismiss:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.15);
	}
</style>
