<!--
@file: src/components/image-editor/editor.svelte
@component
**Enhanced Image Editor - Svelte 5 Optimized**

Comprehensive image editing interface with svelte-canvas integration.
-->

<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { logger } from '@utils/logger';
	import { onDestroy, onMount } from 'svelte';
	import { registerHotkey } from '@src/utils/hotkeys';
	import EditorCanvas from './editor-canvas.svelte';
	import EditorSidebar from './editor-sidebar.svelte';
	import EditorMobilePanel from './editor-mobile-panel.svelte';
	import { editorWidgets } from './widgets/registry';

	const MOBILE_BREAKPOINT = imageEditorStore.mobileBreakpoint;
	const isMobileEditor = $derived(imageEditorStore.state.viewportWidth < MOBILE_BREAKPOINT);


	interface Props {
		focalPoint?: { x: number; y: number };
		imageFile?: File | null;
		initialImageSrc?: string;
		mediaId?: string;
		oncancel?: () => void;
		onsave?: (detail: {
			dataURL?: string;
			file?: File;
			focalPoint?: any;
			mediaId?: string;
			manipulations?: any;
			operations?: Record<string, unknown>;
			saveBehavior?: 'new' | 'rotate' | 'overwrite';
		}) => Promise<void> | void;
	}

	let {
		imageFile = null,
		initialImageSrc = '',
		mediaId = undefined,
		focalPoint = $bindable({ x: 50, y: 50 }),
		oncancel = () => {},
		onsave = () => {}
	}: Props = $props();

	// Accessibility status message
	let statusMessage = $state('');

	// State
	let selectedImage = $state('');
	let containerRef = $state<HTMLDivElement | undefined>(undefined);
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let isProcessing = $state(false);
	let error = $state<string | null>(null);
	let toolInstances = $state<Record<string, any>>({});
	let editorRootRef = $state<HTMLDivElement | undefined>(undefined);

	// Save behavior: 'new' creates a timestamped copy, 'overwrite' replaces the original
	// Derived values
	const storeState = imageEditorStore.state;
	const activeState = $derived(imageEditorStore.state.activeState);
	const hasImage = $derived(!!storeState.imageElement);
	const toolbarControls = $derived(imageEditorStore.state.toolbarControls);
	const activeToolInstance = $derived.by(() => (activeState ? toolInstances[activeState] ?? null : null));
	let lastActiveToolState = '';
	let bottomDockRef = $state<HTMLDivElement | undefined>(undefined);
	let dockHeight = $state(0);

	$effect(() => {
		const el = bottomDockRef;
		if (!el || isMobileEditor) {
			if (isMobileEditor) dockHeight = 0;
			return;
		}

		const syncHeight = () => {
			dockHeight = Math.ceil(el.getBoundingClientRect().height);
		};

		syncHeight();
		const ro = new ResizeObserver(() => syncHeight());
		ro.observe(el);
		return () => ro.disconnect();
	});

	function syncViewportWidthFromElement(el: HTMLElement | undefined) {
		if (!el || typeof window === 'undefined') return;
		const width = Math.round(el.getBoundingClientRect().width);
		if (width > 0) {
			imageEditorStore.setViewportWidth(width);
		}
	}

	$effect(() => {
		const el = editorRootRef;
		if (!el || typeof window === 'undefined') return;

		syncViewportWidthFromElement(el);
		const ro = new ResizeObserver(() => syncViewportWidthFromElement(el));
		ro.observe(el);
		return () => ro.disconnect();
	});

	function handleCancelActiveTool() {
		imageEditorStore.cancelActiveTool();
		oncancel?.();
	}

	// Tracks in-flight loads so stale onload/onerror handlers cannot leave isProcessing stuck
	let loadGeneration = 0;
	let lastLoadKey = $state('');

	// Register Keyboard Shortcuts for Accessibility (Top-level for auto-cleanup)
	registerHotkey('mod+s', () => handleSave(), 'Save edited image');
	registerHotkey('mod+z', () => imageEditorStore.handleUndo(), 'Undo last edit');
	registerHotkey('mod+shift+z', () => imageEditorStore.handleRedo(), 'Redo last edit');
	registerHotkey('escape', () => oncancel(), 'Cancel editing');
	registerHotkey('=', () => { imageEditorStore.state.zoom = Math.min(5, imageEditorStore.state.zoom * 1.15); }, 'Zoom in');
	registerHotkey('+', () => { imageEditorStore.state.zoom = Math.min(5, imageEditorStore.state.zoom * 1.15); }, 'Zoom in');
	registerHotkey('-', () => { imageEditorStore.state.zoom = Math.max(0.1, imageEditorStore.state.zoom / 1.15); }, 'Zoom out');
	registerHotkey('0', () => { imageEditorStore.state.zoom = 1; imageEditorStore.state.translateX = 0; imageEditorStore.state.translateY = 0; }, 'Reset zoom');

	// Note: keydown listener is registered in the second onMount below alongside store setup.
	// The duplicate onMount block was removed to prevent double-registration.

	$effect(() => {
		if (activeState === lastActiveToolState) {
			return;
		}

		if (lastActiveToolState) {
			toolInstances[lastActiveToolState]?.beforeExit?.();
		}

		lastActiveToolState = activeState;
	});

	// Cleanup effect for selected image
	$effect(() => {
		return () => {
			if (selectedImage?.startsWith('blob:')) {
				URL.revokeObjectURL(selectedImage);
			}
		};
	});

	// Keep canvas dimensions in sync without re-triggering image decode
	$effect(() => {
		if (!containerRef || (containerWidth > 0 && containerHeight > 0)) {
			return;
		}

		const sizeSyncTimer = setTimeout(() => {
			if (containerRef && containerRef.clientWidth > 0) {
				containerWidth = containerRef.clientWidth;
				containerHeight = containerRef.clientHeight;
			}
		}, 150);

		return () => clearTimeout(sizeSyncTimer);
	});

	// Load initial image effect — decode must not wait on canvas mount/size
	$effect(() => {
		const src = initialImageSrc;
		const file = imageFile;

		if (!(src || file)) {
			return;
		}

		const loadKey = file
			? `file:${file.name}:${file.size}:${file.lastModified}`
			: `src:${src}`;

		if (loadKey === lastLoadKey) {
			return;
		}

		lastLoadKey = loadKey;
		selectedImage = '';
		imageEditorStore.reset();
		imageEditorStore.setError(null);
		error = null;

		if (src) {
			selectedImage = src;
			loadImage(src);
		} else if (file) {
			const blobUrl = URL.createObjectURL(file);
			selectedImage = blobUrl;
			loadImage(blobUrl, file);
		}
	});

	function finalizeLoadedImage(img: HTMLImageElement, file: File | undefined = undefined) {
		imageEditorStore.setError(null);
		imageEditorStore.setImageElement(img);
		if (file) {
			imageEditorStore.setFile(file);
		}

		const measuredWidth = containerRef?.clientWidth ?? containerWidth;
		const measuredHeight = containerRef?.clientHeight ?? containerHeight;
		const isMobileViewport = imageEditorStore.isMobile;
		const widthFitRatio = isMobileViewport ? 0.84 : 0.82;
		const heightFitRatio = isMobileViewport ? 0.62 : 0.82;

		if (measuredWidth > 0 && measuredHeight > 0 && img.width > 0 && img.height > 0) {
			const scaleX = (measuredWidth * widthFitRatio) / img.width;
			const scaleY = (measuredHeight * heightFitRatio) / img.height;
			const fitScale = Math.min(scaleX, scaleY);
			const isPortraitViewport = measuredHeight > measuredWidth * 1.08;
			const portraitBoost = isPortraitViewport && !isMobileViewport ? 1.04 : 1;
			imageEditorStore.state.zoom = Math.min(5, Math.max(0.1, fitScale * portraitBoost));
		} else {
			imageEditorStore.state.zoom = 1;
		}

		imageEditorStore.state.translateX = 0;
		imageEditorStore.state.translateY = 0;

		try {
			imageEditorStore.takeSnapshot();
		} catch (snapshotErr) {
			console.warn('[ImageEditor] takeSnapshot failed:', snapshotErr);
		}

		// Default to crop — primary entry workflow when opening the editor
		imageEditorStore.switchTool('crop');
		isProcessing = false;
	}

	function loadImage(imageSrc: string, file: File | undefined = undefined, retryAttempt = 0, activeGeneration: number | undefined = undefined) {
		let cleanedSrc = imageSrc;
		// Handle duplicate /files/ paths correctly, allowing dynamic paths via regex
		cleanedSrc = cleanedSrc.replace(/(?:\/files)+\//g, '/files/');

		const generation = activeGeneration ?? ++loadGeneration;
		isProcessing = true;
		error = null;

		const img = new Image();
		try {
			const resolved = new URL(cleanedSrc, window.location.href);
			if (resolved.origin !== window.location.origin) {
				img.crossOrigin = 'anonymous';
			}
		} catch {
			// Relative or blob URLs — same-origin, no CORS attribute needed
		}

		const safetyTimer = setTimeout(() => {
			if (generation !== loadGeneration) return;
			if (isProcessing) {
				console.warn('[ImageEditor] loadImage safety timeout triggered — forcing isProcessing=false');
				isProcessing = false;
			}
		}, 15_000);

		img.onerror = () => {
			if (generation !== loadGeneration) return;
			clearTimeout(safetyTimer);
			if (retryAttempt < 3) {
				setTimeout(() => loadImage(imageSrc, file, retryAttempt + 1, generation), 1000);
			} else {
				const message = 'Failed to load image after 3 attempts';
				error = message;
				imageEditorStore.setError(message);
				isProcessing = false;
			}
		};

		img.onload = () => {
			if (generation !== loadGeneration) return;
			clearTimeout(safetyTimer);
			finalizeLoadedImage(img, file);
		};

		// Assign handlers before src — cached images can complete synchronously
		img.src = cleanedSrc;
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Guard against events with detached targets (e.g. in embedded browser contexts)
		if (!event?.target || !(event.target as Node).ownerDocument) return;
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
			return;
		}

		const cmdOrCtrl = event.metaKey || event.ctrlKey;
		const shift = event.shiftKey;

		if (cmdOrCtrl && !shift && event.key === 'z') {
			event.preventDefault();
			imageEditorStore.undoState();
		} else if ((cmdOrCtrl && shift && event.key === 'z') || (cmdOrCtrl && event.key === 'y')) {
			event.preventDefault();
			imageEditorStore.redoState();
		}
	}

	export function handleCancel() {
		handleCancelActiveTool();
	}



	// --- RENDER LOGIC (For Canvas Preview) ---
	// Client-side rendering functions (normalizeCropRect, buildFilterString, etc.)
	// have been removed as part of the Server-Side Baking strategy.
	// Sharp.js on the server now handles all image processing.

	export async function handleSave() {
		try {
			if (!mediaId && !imageFile) {
				throw new Error('No media source found to save.');
			}

			isProcessing = true;
			statusMessage = 'Preparing to save changes...';

			// --- SERVER-SIDE BAKING STRATEGY ---
			// Instead of sending a lossy rendered blob, we send the manipulation instructions.
			// This preserves quality by applying Sharp.js on the server to the original asset.

			const {
				rotation,
				flipH,
				flipV,
				crop,
				filters,
				focalPoint: currentFocalPoint,
				saveBehavior,
				blurRegions,
				watermarks,
				annotations
			} = imageEditorStore.state;

			const manipulations = {
				rotation,
				flipH,
				flipV,
				crop: crop
					? {
							x: Math.round(crop.x),
							y: Math.round(crop.y),
							width: Math.round(crop.width),
							height: Math.round(crop.height),
							shape: crop.shape ?? "rect"
						}
					: undefined,
				filters,
				focalPoint: currentFocalPoint,
				saveBehavior,
				blurRegions,
				watermarks,
				annotations
			};

			statusMessage = 'Baking image on server...';

			// Notify parent component to perform the actual API call and await it
			await onsave({
				mediaId,
				manipulations,
				focalPoint: currentFocalPoint,
				saveBehavior
			});

			statusMessage = 'Changes submitted successfully.';
		} catch (err) {
			logger.error('Save error:', err);
			error = `Failed to save: ${err instanceof Error ? err.message : String(err)}`;
			statusMessage = `Error: ${(err as Error).message}`;
		} finally {
			isProcessing = false;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		loadGeneration++;
		window.removeEventListener('keydown', handleKeyDown);
		const toolId = imageEditorStore.state.activeState || lastActiveToolState;
		if (toolId) {
			toolInstances[toolId]?.beforeExit?.();
		}
		imageEditorStore.reset();
	});
</script>

<div
	bind:this={editorRootRef}
	class="image-editor flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-white"
	class:image-editor--mobile={isMobileEditor}
	role="application"
	aria-label="Image editor"
	aria-busy={isProcessing}
>
	{#if error}
		<div class="error-banner bg-error-50 border-s-4 border-error-500 p-4 text-error-700 dark:bg-error-900/20 dark:text-error-300" role="alert">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:alert-circle" width="20"></iconify-icon>
				<span>{error}</span>
				<button onclick={() => (error = null)} class="ml-auto text-error-600 hover:text-error-800" aria-label="Dismiss error">
					<iconify-icon icon="mdi:close" width="18"></iconify-icon>
				</button>
			</div>
		</div>
	{/if}

	{#if isProcessing}
		<div class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			<div class="text-white flex flex-col items-center gap-2">
				<iconify-icon icon="mdi:loading" class="animate-spin text-tertiary-500 dark:text-primary-500" width="48"></iconify-icon>
				<p class="font-medium">Processing image...</p>
			</div>
		</div>
	{/if}

	<div class="editor-layout flex min-h-0 min-w-0 flex-1 overflow-hidden items-stretch">
		{#if !isMobileEditor}
			<EditorSidebar
				hasImage={hasImage}
				onToolSelect={(tool) => imageEditorStore.switchTool(tool)}
			/>
		{/if}

		<div
				class="editor-workspace relative min-h-0 min-w-0 flex-1 overflow-hidden"
			style:--editor-dock-h="{isMobileEditor ? 0 : dockHeight}px"
		>
			<div class="editor-canvas-slot flex min-h-0 flex-col overflow-hidden">
				<div class="canvas-wrapper relative flex min-h-0 flex-1 flex-col">
					<div class="editor-canvas-frame relative flex min-h-0 flex-1 overflow-hidden bg-(--editor-canvas-bg,var(--editor-chrome-bg,#0a0a0a)) border-none rounded-none shadow-none outline-none">
						<EditorCanvas
							bind:containerRef
							bind:containerWidth
							bind:containerHeight
							{hasImage}
							isLoading={isProcessing}
							activeTool={activeToolInstance}
						>
							{#if hasImage}
								{#each editorWidgets as widget (widget.key)}
									{const Component = widget.tool}
									<Component bind:this={toolInstances[widget.key]} onCancel={() => imageEditorStore.cancelActiveTool()} />
								{/each}
							{/if}
						</EditorCanvas>
						{#if hasImage}
							<div class="canvas-edge-vignette" aria-hidden="true"></div>
						{/if}
					</div>
				</div>
			</div>

			{#if toolbarControls?.component && !isMobileEditor}
				<div
					bind:this={bottomDockRef}
					class="editor-bottom-dock editor-desktop-dock editor-glass-dock absolute inset-x-0 bottom-0 z-20 overflow-x-auto px-2 py-1.5 md:px-3 w-full h-fit max-h-fit bg-[--editor-chrome-bg] border-t border-[--editor-chrome-border]"
				>
					{#key toolbarControls.component}
						{const Component = toolbarControls.component}
						<Component {...toolbarControls.props} />
					{/key}
				</div>
			{/if}

			{#if isMobileEditor}
				<EditorMobilePanel {hasImage} onToolSelect={(tool) => imageEditorStore.switchTool(tool)} />
			{/if}
		</div>
	</div>

	<!-- ARIA Live region for accessibility status updates -->
	<div class="sr-only" aria-live="polite" aria-atomic="true">
		{statusMessage}
	</div>
</div>

<style>
	.editor-canvas-slot {
		position: absolute;
		inset-inline: 0;
		top: 0;
		bottom: var(--editor-dock-h, 0px);
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--editor-canvas-bg, var(--editor-chrome-bg, #0a0a0a));
	}

	.canvas-edge-vignette {
		pointer-events: none;
		position: absolute;
		inset: 0;
		z-index: 6;
		border: none;
		border-radius: 0;
		box-shadow: none;
		outline: none;
		background:
			radial-gradient(ellipse 100% 100% at 50% 50%, transparent 78%, rgba(10, 10, 10, 0.28) 90%, rgba(10, 10, 10, 0.72) 100%),
			linear-gradient(to bottom, rgba(10, 10, 10, 0.5) 0%, transparent 8%),
			linear-gradient(to right, rgba(10, 10, 10, 0.35) 0%, transparent 6%),
			linear-gradient(to left, rgba(10, 10, 10, 0.35) 0%, transparent 6%);
	}

	/* Mobile — column layout: canvas + bottom panel */
	.image-editor--mobile .editor-workspace {
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--editor-chrome-bg, #1a1a1a);
	}

	.image-editor--mobile .editor-canvas-slot {
		position: relative;
		inset: auto;
		flex: 1 1 auto;
		min-height: 0;
		background: var(--editor-canvas-bg, var(--editor-chrome-bg, #1a1a1a));
	}

	.image-editor--mobile .canvas-wrapper,
	.image-editor--mobile .editor-canvas-frame,
	.image-editor--mobile :global(.editor-canvas-wrapper) {
		flex: 1 1 auto;
		min-height: 0;
	}

	.image-editor--mobile .editor-canvas-frame {
		background: var(--editor-canvas-bg, var(--editor-chrome-bg, #1a1a1a));
	}

	.image-editor.image-editor--mobile {
		background: var(--editor-chrome-bg, #1a1a1a);
	}

	.image-editor--mobile .canvas-edge-vignette {
		display: none;
	}
</style>
