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
	import { editorWidgets } from './widgets/registry';


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
		}) => void;
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

	// Save behavior: 'new' creates a timestamped copy, 'overwrite' replaces the original
	// Derived values
	const storeState = imageEditorStore.state;
	const activeState = $derived(imageEditorStore.state.activeState);
	const hasImage = $derived(!!storeState.imageElement);
	const toolbarControls = $derived(imageEditorStore.state.toolbarControls);
	const activeToolInstance = $derived.by(() => (activeState ? toolInstances[activeState] ?? null : null));
	let lastActiveToolState = '';

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
		const isMobileViewport = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
		const widthFitRatio = isMobileViewport ? 0.9 : 0.82;
		const heightFitRatio = isMobileViewport ? 0.84 : 0.82;

		if (measuredWidth > 0 && measuredHeight > 0 && img.width > 0 && img.height > 0) {
			const scaleX = (measuredWidth * widthFitRatio) / img.width;
			const scaleY = (measuredHeight * heightFitRatio) / img.height;
			const fitScale = Math.min(scaleX, scaleY);
			const isPortraitViewport = measuredHeight > measuredWidth * 1.08;
			const mobileFitBoost = isMobileViewport ? 1.02 : 1;
			const portraitBoost = isPortraitViewport ? 1.04 : 1;
			imageEditorStore.state.zoom = Math.min(5, Math.max(0.1, fitScale * mobileFitBoost * portraitBoost));
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
							height: Math.round(crop.height)
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

			// Notify parent component to perform the actual API call
			onsave({
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
		// NOTE: imageEditorStore.reset() is intentionally omitted here.
		// The parent modal already resets the store before mounting this component
		// via a $effect. A duplicate reset here races with the image-load $effect
		// and would clear imageElement just after it was set, causing isInitializing
		// to never become false in the modal overlay.
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
	class="image-editor flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(76,76,76,0.18),rgba(11,11,11,0.98)_42%)] text-white"
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

	{#if hasImage}
		<div class="pointer-events-none absolute inset-e-3 top-3 z-40 md:inset-e-4 md:top-4">
			<button
				type="button"
				class="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-primary-400/35 bg-[linear-gradient(180deg,rgba(42,108,255,0.24),rgba(17,33,77,0.9))] px-3 py-2 text-sm font-medium text-white shadow-[0_14px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all hover:border-primary-300/50 hover:bg-[linear-gradient(180deg,rgba(56,129,255,0.34),rgba(20,39,92,0.96))] disabled:cursor-not-allowed disabled:opacity-50 md:px-4"
				onclick={handleSave}
				disabled={isProcessing}
				aria-label="Save edits"
				title="Save edits"
			>
				{#if isProcessing}
					<iconify-icon icon="mdi:loading" width="18" class="animate-spin"></iconify-icon>
				{:else}
					<iconify-icon icon="mdi:content-save" width="18"></iconify-icon>
				{/if}
				<span>Save</span>
			</button>
		</div>
	{/if}

		<div class="editor-layout grid min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-1.5 overflow-hidden p-1.5 md:gap-3 md:p-3 xl:grid-cols-[minmax(0,1fr)_19rem] xl:grid-rows-[minmax(0,1fr)_auto] xl:gap-3 xl:p-4">
			<div class="editor-main grid min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden xl:col-start-1 xl:row-start-1">
				<div class="canvas-wrapper relative flex min-h-0 flex-1 flex-col">
					<div class="relative flex min-h-0 flex-1 overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(34,34,34,0.96),rgba(18,18,18,0.96))] shadow-[0_20px_70px_rgba(0,0,0,0.32)]">
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
					</div>
				</div>
			</div>

			{#if toolbarControls?.component}
				{const Component = toolbarControls.component}
				<div class="toolbar-dock row-start-2 px-0 xl:col-start-2 xl:row-start-1 xl:flex xl:h-full xl:min-h-0">
					<div
						class="mx-auto flex w-full max-w-275 flex-col rounded border border-white/10 bg-[linear-gradient(180deg,rgba(44,44,44,0.96),rgba(24,24,24,0.96))] p-2 shadow-[0_14px_34px_rgba(0,0,0,0.26)] backdrop-blur-xl max-h-[24vh] overflow-auto xl:mx-0 xl:h-full xl:max-h-none xl:min-h-0 xl:max-w-none xl:rounded-[22px] xl:p-3"
					>
						<Component {...toolbarControls.props} />
					</div>
				</div>
			{/if}

			<div class="editor-sidebar-row row-start-3 xl:col-span-2 xl:row-start-2">
				<EditorSidebar
					activeState={activeState}
					hasImage={hasImage}
					onToolSelect={(tool) => imageEditorStore.switchTool(tool)}
					onCancel={() => imageEditorStore.cancelActiveTool()}
				/>
			</div>
		</div>

	<!-- ARIA Live region for accessibility status updates -->
	<div class="sr-only" aria-live="polite" aria-atomic="true">
		{statusMessage}
	</div>
</div>
