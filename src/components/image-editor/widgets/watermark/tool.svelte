<!--
@file: src/components/image-editor/widgets/Watermark/Tool.svelte
@component
Watermark tool with full text and image watermark support.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { Layer } from 'svelte-canvas';
	import WatermarkControls from './controls.svelte';
	import WatermarkControlsMobile from './controls-mobile.svelte';

	interface WatermarkItem {
		id: string;
		type: 'text' | 'image';
		text?: string;
		imageUrl?: string;
		x: number;
		y: number;
		width: number;
		height: number;
		opacity: number;
		position: string;
		fontSize?: number;
		color?: string;
		rotation?: number;
	}

	let selectedId = $state<string | null>(null);
	let opacity = $state(0.8);
	let currentSize = $state(100);
	let isTiled = $state(false);
	let selectedWatermark = $state<WatermarkItem | null>(null);
	let textDraft = $state('Watermark');
	let preloadedImages = $state<Record<string, HTMLImageElement>>({});

	const TEXT_BASE_FONT_SIZE = 48;
	const TEXT_MIN_FONT_SIZE = 16;
	const TEXT_MAX_FONT_SIZE = 256;

	const storeState = imageEditorStore.state;

	// Get watermarks from store (ensure it's always an array)
	const watermarks = $derived(Array.isArray(storeState.watermarks) ? storeState.watermarks as WatermarkItem[] : []);

	// Generate unique ID
	function generateId(): string {
		return `wm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	function measureTextWatermark(text: string, fontSize: number) {
		const normalizedText = text.trim() || 'Watermark';
		const width = Math.max(80, Math.ceil(normalizedText.length * fontSize * 0.62));
		const height = Math.max(32, Math.ceil(fontSize * 1.35));
		return { width, height };
	}

	function syncTextWatermarkSize(item: WatermarkItem, sizePercent: number) {
		const scale = sizePercent / 100;
		const fontSize = Math.max(TEXT_MIN_FONT_SIZE, Math.min(TEXT_MAX_FONT_SIZE, Math.round(TEXT_BASE_FONT_SIZE * scale)));
		const { width, height } = measureTextWatermark(item.text || 'Watermark', fontSize);
		return {
			...item,
			fontSize,
			width,
			height
		};
	}

	// Add text watermark
	function handleAddText() {
		const img = storeState.imageElement;
		if (!img) return;

		const id = generateId();
		const { width, height } = measureTextWatermark(textDraft.trim() || 'Watermark', TEXT_BASE_FONT_SIZE);
		const newWatermark: WatermarkItem = {
			id,
			type: 'text',
			text: textDraft.trim() || 'Watermark',
			x: img.width / 4,
			y: img.height / 2,
			width,
			height,
			opacity,
			position: 'center',
			fontSize: TEXT_BASE_FONT_SIZE,
			color: '#ffffff'
		};

		storeState.watermarks = [...watermarks, newWatermark];
		selectedId = id;
		selectedWatermark = newWatermark;
		imageEditorStore.takeSnapshot();
		updateToolbar();
	}

	// Add image watermark via file picker
	async function handleAddImage() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';

		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;

			try {
				const url = URL.createObjectURL(file);
				const img = new Image();
				img.crossOrigin = 'anonymous';

				await new Promise<void>((resolve, reject) => {
					img.onload = () => resolve();
					img.onerror = reject;
					img.src = url;
				});

				preloadedImages[url] = img;

				const imageElement = storeState.imageElement;
				if (!imageElement) return;

				const scale = Math.min(imageElement.width / img.width, imageElement.height / img.height) * 0.3;
				const id = generateId();

				const newWatermark: WatermarkItem = {
					id,
					type: 'image',
					imageUrl: url,
					x: imageElement.width / 4,
					y: imageElement.height / 2,
					width: img.width * scale,
					height: img.height * scale,
					opacity,
					position: 'center'
				};

				storeState.watermarks = [...watermarks, newWatermark];
				selectedId = id;
				selectedWatermark = newWatermark;
				imageEditorStore.takeSnapshot();
				updateToolbar();
			} catch (err) {
				console.error('Failed to add image watermark:', err);
			}
		};

		input.click();
	}

	// Delete selected watermark
	function handleDeleteWatermark() {
		if (!selectedId) return;
		storeState.watermarks = watermarks.filter((w) => w.id !== selectedId);
		selectedId = null;
		selectedWatermark = null;
		imageEditorStore.takeSnapshot();
		updateToolbar();
	}

	// Update watermark position
	function handlePositionChange(position: string) {
		if (!selectedId || !selectedWatermark) return;

		const img = storeState.imageElement;
		if (!img) return;

		const padding = 20;
		let x = selectedWatermark.x;
		let y = selectedWatermark.y;

		switch (position) {
			case 'northwest':
				x = padding;
				y = padding;
				break;
			case 'north':
				x = img.width / 2 - selectedWatermark.width / 2;
				y = padding;
				break;
			case 'northeast':
				x = img.width - selectedWatermark.width - padding;
				y = padding;
				break;
			case 'west':
				x = padding;
				y = img.height / 2 - selectedWatermark.height / 2;
				break;
			case 'center':
				x = img.width / 2 - selectedWatermark.width / 2;
				y = img.height / 2 - selectedWatermark.height / 2;
				break;
			case 'east':
				x = img.width - selectedWatermark.width - padding;
				y = img.height / 2 - selectedWatermark.height / 2;
				break;
			case 'southwest':
				x = padding;
				y = img.height - selectedWatermark.height - padding;
				break;
			case 'south':
				x = img.width / 2 - selectedWatermark.width / 2;
				y = img.height - selectedWatermark.height - padding;
				break;
			case 'southeast':
				x = img.width - selectedWatermark.width - padding;
				y = img.height - selectedWatermark.height - padding;
				break;
		}

		storeState.watermarks = watermarks.map((w) =>
			w.id === selectedId ? { ...w, x, y, position } : w
		);
		selectedWatermark = { ...selectedWatermark, x, y, position };
	}

	function handleTextChange(value: string) {
		textDraft = value;
		if (selectedId && selectedWatermark?.type === 'text') {
			const updated = {
				...selectedWatermark,
				text: value
			};
			const synced = syncTextWatermarkSize(updated, currentSize);
			storeState.watermarks = watermarks.map((w) => (w.id === selectedId ? synced : w));
			selectedWatermark = synced;
		}
	}

	function isWatermarkToolbarComponent(component: unknown): boolean {
		return component === WatermarkControls || component === WatermarkControlsMobile;
	}

	function updateToolbar() {
		const isMobile =
			imageEditorStore.state.viewportWidth < imageEditorStore.mobileBreakpoint;
		const ControlsComponent = isMobile ? WatermarkControlsMobile : WatermarkControls;

		const baseProps = {
			onAddImage: handleAddImage,
			onAddText: handleAddText,
			onDeleteWatermark: handleDeleteWatermark,
			onPositionChange: handlePositionChange,
			onOpacityChange: (v: number) => {
				opacity = v;
				if (selectedId) {
					storeState.watermarks = watermarks.map((w) =>
						w.id === selectedId ? { ...w, opacity: v } : w
					);
				}
			},
			onSizeChange: (v: number) => {
				currentSize = v;
				if (selectedId && selectedWatermark) {
					if (selectedWatermark.type === 'text') {
						const resized = syncTextWatermarkSize(selectedWatermark, v);
						storeState.watermarks = watermarks.map((w) => (w.id === selectedId ? resized : w));
						selectedWatermark = resized;
					} else {
						const scale = v / 100;
						const resized = {
							...selectedWatermark,
							width: (selectedWatermark.width || 100) * scale,
							height: (selectedWatermark.height || 50) * scale
						};
						storeState.watermarks = watermarks.map((w) => (w.id === selectedId ? resized : w));
						selectedWatermark = resized;
					}
				}
			},
			onTileToggle: () => {
				isTiled = !isTiled;
			},
			hasSelection: !!selectedId,
			selectedType: selectedWatermark?.type ?? null,
			textDraft,
			onTextDraftChange: handleTextChange,
			onApplyText: () => handleTextChange(textDraft.trim() || 'Watermark'),
			currentOpacity: opacity,
			currentSize,
			isTiled,
			watermarkCount: watermarks.length
		};

		imageEditorStore.setToolbarControls({
			component: ControlsComponent,
			props: isMobile
				? { ...baseProps, currentPosition: selectedWatermark?.position ?? 'center' }
				: baseProps
		});
	}

	$effect(() => {
		const activeState = imageEditorStore.state.activeState;

		if (activeState === 'watermark') {
			imageEditorStore.state.viewportWidth;
			selectedId;
			selectedWatermark;
			textDraft;
			opacity;
			currentSize;
			isTiled;
			watermarks.length;
			updateToolbar();
		} else if (!activeState && isWatermarkToolbarComponent(imageEditorStore.state.toolbarControls?.component)) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	// Mouse handlers for selecting/dragging watermarks
	export function handleMouseDown(e: MouseEvent, width: number, height: number) {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) return;

		const rect = (e.target as HTMLElement).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;

		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;

		const ix = (offsetX - centerX) / zoom + imageElement.width / 2;
		const iy = (offsetY - centerY) / zoom + imageElement.height / 2;

		// Find clicked watermark
		for (const wm of watermarks) {
			if (ix >= wm.x && ix <= wm.x + wm.width && iy >= wm.y && iy <= wm.y + wm.height) {
				selectedId = wm.id;
				selectedWatermark = wm;
				if (wm.type === 'text') {
					textDraft = wm.text || 'Watermark';
				}
				updateToolbar();
				return;
			}
		}

		// Clicked outside - deselect
		selectedId = null;
		selectedWatermark = null;
		updateToolbar();
	}

	let isDragging = $state(false);
	let dragOffset = { x: 0, y: 0 };

	export function handleMouseMove(e: MouseEvent, width: number, height: number) {
		if (!selectedId || !selectedWatermark) return;

		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) return;

		const rect = (e.target as HTMLElement).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;

		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;

		const ix = (offsetX - centerX) / zoom + imageElement.width / 2;
		const iy = (offsetY - centerY) / zoom + imageElement.height / 2;

		if (!isDragging) {
			isDragging = true;
			dragOffset = {
				x: ix - selectedWatermark.x,
				y: iy - selectedWatermark.y
			};
		}

		const newX = Math.max(0, Math.min(imageElement.width - selectedWatermark.width, ix - dragOffset.x));
		const newY = Math.max(0, Math.min(imageElement.height - selectedWatermark.height, iy - dragOffset.y));

		storeState.watermarks = watermarks.map((w) =>
			w.id === selectedId ? { ...w, x: newX, y: newY } : w
		);
		selectedWatermark = { ...selectedWatermark, x: newX, y: newY };
	}

	export function handleMouseUp() {
		if (isDragging) {
			isDragging = false;
			imageEditorStore.takeSnapshot();
		}
	}

	const renderWatermarks = ({ context, width, height }: { context: CanvasRenderingContext2D; width: number; height: number }) => {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) return;

		context.save();
		context.translate(width / 2 + translateX, height / 2 + translateY);
		context.scale(zoom, zoom);

		const offsetX = -imageElement.width / 2;
		const offsetY = -imageElement.height / 2;

		for (const wm of watermarks) {
			context.save();
			context.globalAlpha = wm.opacity || 0.8;

			if (wm.type === 'text') {
				const fontSize = wm.fontSize || TEXT_BASE_FONT_SIZE;
				context.font = `${fontSize}px Arial`;
				context.fillStyle = wm.color || '#ffffff';
				context.textBaseline = 'top';
				context.fillText(wm.text || '', wm.x + offsetX, wm.y + offsetY);
			} else if (wm.type === 'image' && wm.imageUrl) {
				const img = preloadedImages[wm.imageUrl];
				if (img && img.complete) {
					context.drawImage(img, wm.x + offsetX, wm.y + offsetY, wm.width, wm.height);
				}
			}

			// Draw selection indicator
			if (wm.id === selectedId) {
				context.strokeStyle = '#3b82f6';
				context.lineWidth = 2 / zoom;
				context.setLineDash([5 / zoom, 5 / zoom]);
				context.strokeRect(wm.x + offsetX - 2, wm.y + offsetY - 2, wm.width + 4, wm.height + 4);
				context.setLineDash([]);
			}

			context.restore();
		}

		context.restore();
	};

	export function saveState() {
		// Store watermarks in manipulations for server-side processing
		return watermarks;
	}

	export function beforeExit() {}
</script>

<Layer render={renderWatermarks} />
