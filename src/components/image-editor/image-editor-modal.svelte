<!--
@file: src/components/image-editor/image-editor-modal.svelte
@component
**Accessible Image Editor Modal**

Full-screen modal wrapping the Image Editor with focus management, keyboard traps,
and proper ARIA dialog semantics. Opens on-demand from Media Gallery or MediaUpload widget.

#### Props
- `image`: MediaImage, File, or URL string to edit
- `watermarkPreset`: Optional pre-configured watermark to auto-apply
- `onsave`: Callback receiving { mediaId, manipulations, focalPoint, saveBehavior }
- `close`: Callback when the modal is dismissed

#### Features:
- Focus trap inside modal (TAB loops internally)
- Focus restoration to trigger element on close
- Escape key closes modal with confirmation prompt
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import { registerHotkey } from '@utils/hotkeys';
	import { imageEditorStore } from '@components/image-editor/image-editor-store.svelte';
	import type { MediaImage, WatermarkOptions } from '@src/utils/media/media-models';
	import { onMount, setContext } from 'svelte';
	import Editor from './editor.svelte';
	import EditorToolbar from './editor-toolbar.svelte';
	import EditorMobileToolbar from './editor-mobile-toolbar.svelte';
	import EditorMobileQuickActions from './editor-mobile-quick-actions.svelte';

	let {
		image = null,
		watermarkPreset = null,
		onsave = () => {},
		close = () => {}
	}: {
		image: MediaImage | File | string | null;
		watermarkPreset?: WatermarkOptions | null;
		onsave?: (detail: any) => void;
		close?: () => void;
	} = $props();

	// Computed image source and metadata
	const imageSrc = $derived.by(() => {
		if (!image) return '';
		if (typeof image === 'string') return image;
		if (image instanceof File) return '';
		return (image as MediaImage).url || '';
	});

	const imageFile = $derived.by(() => (image instanceof File ? image : null));

	const initialFocalPoint = $derived.by(() => {
		if (image && typeof image === 'object' && 'metadata' in image) {
			return (image as MediaImage).metadata?.focalPoint as { x: number; y: number } | undefined;
		}
		return undefined;
	});

	const mediaId = $derived.by(() => {
		if (image && typeof image === 'object' && '_id' in image) {
			return (image as MediaImage)._id;
		}
		return undefined;
	});

	// Accessibility: store triggering element to restore focus on close
	let triggerElement: HTMLElement | null = $state(null);
	let modalContainer: HTMLDivElement | undefined = $state(undefined);

	// Provide watermark preset to child widgets via context
	setContext('watermarkPreset', () => watermarkPreset);

	let editorComponent: Editor | undefined = $state();

	let error = $state<string | null>(null);
	let isSaving = $state(false);
	let isInitializing = $state(true);

	const editorSessionKey = $derived(`${mediaId ?? ''}:${imageSrc}`);

	let lastResetSessionKey = $state('');

	const MOBILE_BREAKPOINT = imageEditorStore.mobileBreakpoint;
	const isMobileEditor = $derived(imageEditorStore.state.viewportWidth < MOBILE_BREAKPOINT);

	function syncViewportWidthFromElement(el: HTMLElement | undefined) {
		if (!el || typeof window === 'undefined') return;
		const width = Math.round(el.getBoundingClientRect().width);
		if (width > 0) {
			imageEditorStore.setViewportWidth(width);
		}
	}

	$effect(() => {
		const el = modalContainer;
		if (!el || typeof window === 'undefined') return;

		syncViewportWidthFromElement(el);
		const ro = new ResizeObserver(() => syncViewportWidthFromElement(el));
		ro.observe(el);
		return () => ro.disconnect();
	});

	// Session boundary — Editor (#key) owns store reset on load; avoid reset here
	// so a synchronous cached decode cannot be cleared after onload (mobile freeze).
	$effect(() => {
		if (!image) {
			lastResetSessionKey = '';
			return;
		}
		const sessionKey = editorSessionKey;
		if (sessionKey === lastResetSessionKey) return;
		lastResetSessionKey = sessionKey;
		isInitializing = true;
		error = null;
		imageEditorStore.setError(null);
	});

	$effect(() => {
		const ready = !!imageEditorStore.state.imageElement;
		const loadError = imageEditorStore.state.error;
		if (ready || loadError) {
			isInitializing = false;
			if (loadError) {
				error = loadError;
			}
		}
	});

	function handleSaveError(err: Error) {
		error = `Failed to save: ${err.message}`;
		logger.error('[ImageEditorModal] Save error:', err);
		isSaving = false;
	}

	async function handleSaveClick() {
		try {
			isSaving = true;
			error = null;
			await editorComponent?.handleSave();
		} catch (err) {
			handleSaveError(err as Error);
		} finally {
			isSaving = false;
		}
	}

	function closeModal() {
		imageEditorStore.reset();
		close?.();
		// Restore focus to trigger element (WCAG 2.2 AA Focus Order)
		if (triggerElement) {
			setTimeout(() => triggerElement?.focus(), 0);
		}
	}

	function handleCancelClick() {
		if (imageEditorStore.isDirty) {
			if (!window.confirm('Discard changes? These edits will not be saved.')) return;
		}
		closeModal();
	}

	function handleZoomAction(type: 'in' | 'out' | 'fit' | 'actual') {
		if (type === 'in') imageEditorStore.zoomBy(1.15);
		else if (type === 'out') imageEditorStore.zoomBy(1 / 1.15);
		else if (type === 'actual') imageEditorStore.zoomActual();
		else imageEditorStore.fitToView();
	}

	function toggleCompare() {
		imageEditorStore.compareSliderPosition = imageEditorStore.compareSliderPosition > 0 ? 0 : 50;
	}

	function nudgeCompare(delta: number) {
		const position = imageEditorStore.compareSliderPosition;
		if (position <= 0) return;
		imageEditorStore.compareSliderPosition = Math.max(1, Math.min(100, position + delta));
	}

	// One registration for the whole editor session. Tool docks add their own
	// keys only while that tool is active, and those win because the stack is LIFO.
	registerHotkey('mod+s', () => void handleSaveClick(), 'Save edited image');
	registerHotkey('mod+z', () => imageEditorStore.handleUndo(), 'Undo');
	registerHotkey('mod+shift+z', () => imageEditorStore.handleRedo(), 'Redo');
	registerHotkey('mod+y', () => imageEditorStore.handleRedo(), 'Redo');
	// The parent <Modal> (useDialog) also closes on Escape. Stop the event at the
	// window-capture layer so this editor's discard confirm actually gates the
	// close — otherwise a cancelled confirm would still dismiss the editor.
	registerHotkey(
		'escape',
		(event) => {
			event.stopPropagation();
			handleCancelClick();
		},
		'Close editor'
	);
	registerHotkey('=', () => handleZoomAction('in'), 'Zoom in');
	registerHotkey('+', () => handleZoomAction('in'), 'Zoom in');
	registerHotkey('-', () => handleZoomAction('out'), 'Zoom out');
	registerHotkey('mod+0', () => handleZoomAction('fit'), 'Fit image');
	registerHotkey('mod+1', () => handleZoomAction('actual'), 'Actual pixels');
	registerHotkey('\\', () => toggleCompare(), 'Toggle compare');
	registerHotkey(
		'[',
		(event) => {
			if (imageEditorStore.compareSliderPosition <= 0) return;
			event.preventDefault();
			nudgeCompare(-5);
		},
		'Move compare left',
		false
	);
	registerHotkey(
		']',
		(event) => {
			if (imageEditorStore.compareSliderPosition <= 0) return;
			event.preventDefault();
			nudgeCompare(5);
		},
		'Move compare right',
		false
	);

	// Focus trap: loop TAB inside the modal
	function trapFocus(e: KeyboardEvent) {
		if (e.key !== 'Tab' || !modalContainer) return;
		const focusable = modalContainer.querySelectorAll<HTMLElement>(
			'button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea, a[href]'
		);
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last?.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first?.focus();
		}
	}

	onMount(() => {
		// Save currently focused element (the trigger button) for restoration
		triggerElement = document.activeElement as HTMLElement;
	});

	// Cleanup blob URLs on destroy
	$effect(() => {
		return () => {
			if (imageSrc?.startsWith('blob:')) {
				URL.revokeObjectURL(imageSrc);
			}
			if (imageFile) {
				const file = imageFile as any;
				if (file._blobUrl) {
					URL.revokeObjectURL(file._blobUrl);
				}
			}
		};
	});
</script>

{#if image}
	<div
		bind:this={modalContainer}
		class="image-editor-panel relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
		class:image-editor-panel--mobile={isMobileEditor}
		data-admin-theme="default"
		role="dialog"
		aria-label="Image Editor — edit and transform your image"
		aria-modal="true"
		tabindex="-1"
		onkeydown={trapFocus}
	>
		<!-- Initial Loading Overlay -->
		{#if isInitializing}
			<div
				class="absolute inset-0 flex items-center justify-center bg-surface-900/80 z-50 backdrop-blur-sm"
			>
				<div class="text-center">
					<iconify-icon
						icon="mdi:loading"
						width="48"
						class="animate-spin text-tertiary-500 dark:text-primary-500"
					></iconify-icon>
					<p class="mt-2 text-sm text-surface-300">Loading editor...</p>
				</div>
			</div>
		{/if}

		<!-- Error Banner with ARIA live announcement -->
		{#if error}
			<div
				class="absolute top-20 inset-s-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4"
				role="alert"
				aria-live="assertive"
			>
				<div
					class="bg-error-900/90 border border-error-700/50 rounded p-4 shadow-lg backdrop-blur-sm"
				>
					<div class="flex items-start gap-3">
						<iconify-icon
							icon="mdi:alert-circle"
							width="24"
							class="text-error-500 shrink-0"
							aria-hidden="true"
						></iconify-icon>
						<div class="flex-1">
							<p class="text-sm text-error-100">{error}</p>
						</div>
						<button
							onclick={() => (error = null)}
							class="text-error-500 hover:text-error-600 dark:text-error-200 dark:hover:text-error-50"
							aria-label="Dismiss error"
						>
							<iconify-icon icon="mdi:close" width="20" aria-hidden="true"></iconify-icon>
						</button>
					</div>
				</div>
			</div>
		{/if}

		{#if isMobileEditor}
			<div
				class="flex shrink-0 flex-col gap-1.5 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-1.5 bg-(--editor-chrome-bg)"
			>
				<EditorMobileToolbar onclose={handleCancelClick} onsave={handleSaveClick} {isSaving} />
				<EditorMobileQuickActions />
			</div>
		{:else}
			<EditorToolbar
				onclose={handleCancelClick}
				onsave={handleSaveClick}
				{isSaving}
				onZoomIn={() => handleZoomAction('in')}
				onZoomOut={() => handleZoomAction('out')}
				onZoomReset={() => handleZoomAction('fit')}
			/>
		{/if}
		<main class="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
			{#key editorSessionKey}
				<Editor
					bind:this={editorComponent}
					initialImageSrc={imageSrc}
					{imageFile}
					{mediaId}
					focalPoint={initialFocalPoint}
					oncancel={handleCancelClick}
					onsave={async (detail) => {
						await onsave(detail);
						closeModal();
					}}
				/>
			{/key}
		</main>
	</div>
{/if}

<style>
	/* Shared design tokens for the image editor chrome.
	   Binds directly to SveltyCMS admin theme tokens so that light/dark mode and
	   custom admin themes are fully respected. */
	.image-editor-panel {
		--editor-chrome-bg: var(--admin-bg-card, var(--color-surface-50, #f8fafc));
		--editor-chrome-surface: var(--admin-bg-page, var(--color-surface-50, #ffffff));
		--editor-chrome-elevated: var(
			--admin-bg-chip,
			color-mix(in oklch, var(--admin-text-body, currentColor) 8%, transparent)
		);
		--editor-chrome-hover: color-mix(
			in oklch,
			var(--admin-text-body, currentColor) 10%,
			transparent
		);
		--editor-chrome-border: var(
			--admin-border-default,
			color-mix(in oklch, var(--admin-text-body, currentColor) 12%, transparent)
		);
		--editor-chrome-border-subtle: var(
			--admin-border-subtle,
			color-mix(in oklch, var(--admin-text-body, #0f172a) 8%, transparent)
		);
		--editor-chrome-text: var(--admin-text-body, #0f172a);
		--editor-chrome-text-hover: var(--admin-text-body, #0f172a);
		--editor-chrome-text-active: var(--admin-text-body, #0f172a);
		/* Active-chip pair: inverted on purpose so one class works in light and dark. */
		--editor-chip-active-bg: var(--admin-text-body, #0f172a);
		--editor-chip-active-text: var(--editor-chrome-bg, #f8fafc);
		--editor-slider-track: color-mix(in oklch, var(--editor-chrome-text, #0f172a) 24%, transparent);
		--editor-accent: var(--color-primary-500, #3b82f6);
		/* Accent used as TEXT/icon colour: darkened in light mode so it reads on its own pale wash (>=4.5:1). */
		--editor-accent-text: color-mix(in oklch, var(--editor-accent) 45%, #000);
		--editor-accent-hover: var(--color-primary-600, #2563eb);
		--editor-canvas-bg: var(--color-surface-200, #e2e8f0);
		--editor-control-h: 2.5rem;
		--editor-control-h-compact: 1.875rem;
		--editor-radius-pill: 9999px;
		--editor-radius-control: var(--admin-radius-button, 0.5rem);
		background: var(--editor-chrome-bg);
		color: var(--editor-chrome-text-active);
	}

	:global(.dark) .image-editor-panel {
		--editor-chrome-bg: var(--admin-bg-card, var(--color-surface-900, #0f172a));
		--editor-chrome-surface: var(--admin-bg-page, var(--color-surface-950, #09090b));
		--editor-canvas-bg: var(--color-surface-950, #09090b);
		/* Muted chrome text, lifted so small labels clear 4.5:1 on the elevated dark chips (was surface-400, ~3.5:1). */
		--editor-chrome-text: color-mix(
			in oklch,
			var(--admin-text-body, #f8fafc) 90%,
			var(--editor-chrome-bg)
		);
		--editor-accent-text: var(--editor-accent);
		--editor-chrome-text-hover: var(--admin-text-body, #f8fafc);
		--editor-chrome-text-active: var(--admin-text-body, #f8fafc);
		--editor-chip-active-bg: var(--admin-text-body, #f8fafc);
		--editor-chip-active-text: var(--editor-chrome-bg, #0f172a);
	}

	/* Shared active-state classes for widget pills (Svelte class directives cannot
	   carry Tailwind arbitrary values like `text-(--var)`). */
	:global(.editor-pill-active) {
		color: var(--editor-chrome-text-active);
		background: var(--editor-chrome-elevated);
		border-color: var(--editor-chrome-border);
	}

	:global(.editor-pill-changed) {
		color: var(--editor-chrome-text-active);
		opacity: 0.85;
	}

	.image-editor-panel--mobile {
		--editor-chrome-bg: var(--admin-bg-card, var(--color-surface-50, #f8fafc));
		--editor-chrome-surface: var(--admin-bg-page, var(--color-surface-50, #ffffff));
		--editor-canvas-bg: var(--color-surface-200, #e2e8f0);
		--editor-slider-track: color-mix(in oklch, var(--editor-chrome-text, #0f172a) 24%, transparent);
		--editor-chrome-elevated: var(
			--admin-bg-chip,
			color-mix(in oklch, var(--admin-text-body, currentColor) 8%, transparent)
		);
		--editor-chrome-hover: color-mix(
			in oklch,
			var(--admin-text-body, currentColor) 10%,
			transparent
		);
		--editor-chrome-border: var(
			--admin-border-default,
			color-mix(in oklch, var(--admin-text-body, currentColor) 12%, transparent)
		);
		--editor-chrome-border-subtle: transparent;
		--editor-control-h: 2.5rem;
		--editor-pill-pad: 0.1875rem;
		--editor-accent: var(--color-primary-500, #3b82f6);
		--editor-accent-hover: var(--color-primary-600, #2563eb);
		height: 100dvh;
		min-height: 100dvh;
		max-height: 100dvh;
		background: var(--editor-chrome-bg);
	}

	:global(.dark) .image-editor-panel--mobile {
		--editor-chrome-bg: var(--admin-bg-card, var(--color-surface-900, #0f172a));
		--editor-chrome-surface: var(--admin-bg-page, var(--color-surface-950, #09090b));
		--editor-canvas-bg: var(--color-surface-950, #09090b);
	}

	.image-editor-panel--mobile main {
		flex: 1 1 auto;
		min-height: 0;
		background: var(--editor-chrome-bg);
	}
</style>
