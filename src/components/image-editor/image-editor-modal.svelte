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

    $effect(() => {
        if (imageEditorStore.state.imageElement) {
            isInitializing = false;
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
        return () => window.removeEventListener('keydown', handleKeyDown);
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
        class="relative flex h-[calc(100dvh-0.75rem)] min-h-160 w-full flex-col overflow-hidden rounded border border-white/10 bg-[linear-gradient(180deg,rgba(31,31,31,0.98),rgba(12,12,12,0.98))] shadow-[0_28px_90px_rgba(0,0,0,0.45)] md:h-[calc(100dvh-1.5rem)] md:min-h-180"
        role="dialog"
        aria-modal="true"
        aria-label="Image Editor — edit and transform your image"
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
            <div class="absolute top-16 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4" role="alert" aria-live="assertive">
                <div class="bg-error-900/90 border border-error-700/50 rounded-lg p-4 shadow-lg backdrop-blur-sm">
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

        <main class="relative flex min-h-0 flex-1 overflow-hidden bg-surface-900">
            <Editor
                bind:this={editorComponent}
                initialImageSrc={imageSrc}
                {imageFile}
                {mediaId}
                focalPoint={initialFocalPoint}
                oncancel={handleCancelClick}
                onsave={(detail) => onsave(detail)}
            />
        </main>
        <EditorToolbar
            onsave={handleSaveClick}
            {isSaving}
            onZoomIn={() => handleZoomAction('in')}
            onZoomOut={() => handleZoomAction('out')}
            onZoomReset={() => handleZoomAction('reset')}
        />
    </div>
{/if}
