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
    import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
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
        console.error('[ImageEditorModal] Save error:', err);
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
        if (!window.confirm('Discard changes? These edits will not be saved.')) return;
        closeModal();
    }

    function handleZoomAction(type: 'in' | 'out' | 'reset') {
        const currentZoom = imageEditorStore.state.zoom;
        if (type === 'in') {
            imageEditorStore.state.zoom = Math.min(5, currentZoom * 1.15);
        } else if (type === 'out') {
            imageEditorStore.state.zoom = Math.max(0.1, currentZoom / 1.15);
        } else {
            imageEditorStore.state.zoom = 1;
            imageEditorStore.state.translateX = 0;
            imageEditorStore.state.translateY = 0;
        }
    }

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

    function handleKeyDown(e: KeyboardEvent) {
        const cmdOrCtrl = e.metaKey || e.ctrlKey;
        if (cmdOrCtrl && e.key === 's') {
            e.preventDefault();
            editorComponent?.handleSave();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            handleCancelClick();
        }
    }

    onMount(() => {
        // Save currently focused element (the trigger button) for restoration
        triggerElement = document.activeElement as HTMLElement;

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
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
        role="dialog"
        aria-label="Image Editor — edit and transform your image"
        aria-modal="true"
        tabindex="-1"
        onkeydown={trapFocus}
    >
        <!-- Initial Loading Overlay -->
        {#if isInitializing}
            <div class="absolute inset-0 flex items-center justify-center bg-surface-900/80 z-50 backdrop-blur-sm">
                <div class="text-center">
                    <iconify-icon icon="mdi:loading" width="48" class="animate-spin text-tertiary-500 dark:text-primary-500"></iconify-icon>
                    <p class="mt-2 text-sm text-surface-300">Loading editor...</p>
                </div>
            </div>
        {/if}

        <!-- Error Banner with ARIA live announcement -->
        {#if error}
            <div class="absolute top-20 inset-s-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4" role="alert" aria-live="assertive">
                <div class="bg-error-900/90 border border-error-700/50 rounded p-4 shadow-lg backdrop-blur-sm">
                    <div class="flex items-start gap-3">
                        <iconify-icon icon="mdi:alert-circle" width="24" class="text-error-500 shrink-0" aria-hidden="true"></iconify-icon>
                        <div class="flex-1">
                            <p class="text-sm text-error-100">{error}</p>
                        </div>
                        <button
                            onclick={() => (error = null)}
                            class="text-error-500 hover:text-error-600 dark:text-error-200 hover:dark:text-error-50"
                            aria-label="Dismiss error"
                        >
                            <iconify-icon icon="mdi:close" width="20" aria-hidden="true"></iconify-icon>
                        </button>
                    </div>
                </div>
            </div>
        {/if}

        {#if isMobileEditor}
            <div class="flex shrink-0 flex-col gap-1.5 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-1.5 bg-[--editor-chrome-bg]">
                <EditorMobileToolbar onclose={handleCancelClick} onsave={handleSaveClick} {isSaving} />
                <EditorMobileQuickActions />
            </div>
        {:else}
            <EditorToolbar
                onsave={handleSaveClick}
                {isSaving}
                onZoomIn={() => handleZoomAction('in')}
                onZoomOut={() => handleZoomAction('out')}
                onZoomReset={() => handleZoomAction('reset')}
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
                    onsave={async (detail) => { await onsave(detail); closeModal(); }}
                />
            {/key}
        </main>
    </div>
{/if}

<style>
	/* Shared design tokens for the image editor chrome */
	.image-editor-panel {
		--editor-chrome-bg: #0a0a0a;
		--editor-chrome-surface: #0f0f0f;
		--editor-chrome-elevated: rgba(255, 255, 255, 0.06);
		--editor-chrome-border: rgba(255, 255, 255, 0.07);
		--editor-chrome-border-subtle: rgba(255, 255, 255, 0.05);
		--editor-chrome-text: rgba(255, 255, 255, 0.68);
		--editor-chrome-text-hover: rgba(255, 255, 255, 0.92);
		--editor-chrome-text-active: #fff;
		--editor-accent: #22c55e;
		--editor-accent-hover: #16a34a;
		--editor-canvas-bg: var(--editor-chrome-bg);
		--editor-control-h: 2.25rem;
		--editor-control-h-compact: 1.875rem;
		--editor-radius-pill: 9999px;
		--editor-radius-control: 0.5rem;
		background: var(--editor-chrome-bg);
	}

	.image-editor-panel--mobile {
		--editor-chrome-bg: #1a1a1a;
		--editor-chrome-surface: #1a1a1a;
		--editor-canvas-bg: #1a1a1a;
		--editor-chrome-elevated: rgba(255, 255, 255, 0.08);
		--editor-chrome-border: rgba(255, 255, 255, 0.1);
		--editor-chrome-border-subtle: transparent;
		--editor-control-h: 2.25rem;
		--editor-pill-pad: 0.1875rem;
		--editor-accent: #22c55e;
		--editor-accent-hover: #16a34a;
		height: 100dvh;
		min-height: 100dvh;
		max-height: 100dvh;
		background: var(--editor-chrome-bg);
	}

	.image-editor-panel--mobile main {
		flex: 1 1 auto;
		min-height: 0;
		background: var(--editor-chrome-bg);
	}
</style>
