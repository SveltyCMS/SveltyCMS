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
	import EditorCanvas from './editor-canvas.svelte';
	import EditorSidebar from './editor-sidebar.svelte';
	import { editorWidgets } from './widgets/registry';

	interface SavedWatermark {
		id: string;
		type: 'text' | 'image';
		text?: string;
		imageUrl?: string;
		x: number;
		y: number;
		width: number;
		height: number;
		opacity?: number;
		fontSize?: number;
		color?: string;
	}

	interface SavedAnnotation {
		id: string;
		type: 'text' | 'arrow' | 'rect' | 'circle';
		x: number;
		y: number;
		x2?: number;
		y2?: number;
		width?: number;
		height?: number;
		radius?: number;
		text?: string;
		stroke: string;
		fill: string;
		strokeWidth: number;
		fontSize?: number;
	}

	interface SavedBlurRegion {
		id: string;
		x: number;
		y: number;
		width: number;
		height: number;
		rotation: number;
		flipped: boolean;
		strength: number;
	}

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

	let { imageFile = null, initialImageSrc = '', mediaId = '', focalPoint = $bindable({ x: 0.5, y: 0.5 }), oncancel = () => {}, onsave = () => {} }: Props = $props();

	// State
	let selectedImage = $state('');
	let containerRef = $state<HTMLDivElement | undefined>(undefined);
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let initialImageLoaded = $state(false);
	let isProcessing = $state(false);
	let error = $state<string | null>(null);
	let toolInstances = $state<Record<string, any>>({});

	// Save behavior: 'new' creates a timestamped copy, 'overwrite' replaces the original
	let saveBehavior = $state<'new' | 'overwrite'>('new');

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

	// Reset load state when image source changes
	let lastLoadedSrc = $state('');
	let lastLoadedFile = $state<File | null>(null);

	$effect(() => {
		saveBehavior = mediaId ? 'overwrite' : 'new';
	});

	$effect(() => {
		if (activeState === lastActiveToolState) {
			return;
		}

		if (lastActiveToolState) {
			toolInstances[lastActiveToolState]?.beforeExit?.();
		}

		lastActiveToolState = activeState;
	});

	$effect(() => {
		const src = initialImageSrc;
		const file = imageFile;
		if (src !== lastLoadedSrc || file !== lastLoadedFile) {
			initialImageLoaded = false;
			selectedImage = '';
		}
	});

	// Cleanup effect for selected image
	$effect(() => {
		return () => {
			if (selectedImage?.startsWith('blob:')) {
				URL.revokeObjectURL(selectedImage);
			}
		};
	});

	// Load initial image effect
	$effect(() => {
		const src = initialImageSrc;
		const file = imageFile;

		if (src !== lastLoadedSrc || file !== lastLoadedFile) {
			initialImageLoaded = false;
		}

		if (!(containerRef && (src || file))) {
			return;
		}

		// Wait for container to have size
		if (containerWidth === 0 || containerHeight === 0) {
			const timeoutId = setTimeout(() => {
				if (containerRef && containerRef.clientWidth > 0) {
					containerWidth = containerRef.clientWidth;
					containerHeight = containerRef.clientHeight;
				}
			}, 150);
			return () => clearTimeout(timeoutId);
		}

		if (initialImageLoaded && src === selectedImage && !file) {
			return;
		}

		queueMicrotask(() => {
			if (src) {
				selectedImage = src;
				loadImage(src);
				lastLoadedSrc = src;
				lastLoadedFile = null;
			} else if (file) {
				const blobUrl = URL.createObjectURL(file);
				selectedImage = blobUrl;
				loadImage(blobUrl, file);
				lastLoadedSrc = '';
				lastLoadedFile = file;
			}
			initialImageLoaded = true;
		});
	});

	function loadImage(imageSrc: string, file?: File, retryAttempt = 0) {
		let cleanedSrc = imageSrc;
		// Handle duplicate /files/ paths correctly, allowing dynamic paths via regex
		cleanedSrc = cleanedSrc.replace(/(?:\/files)+\//g, '/files/');

		isProcessing = true;
		error = null;

		const img = new Image();
		img.crossOrigin = 'anonymous';

		img.onerror = () => {
			if (retryAttempt < 3) {
				setTimeout(() => loadImage(imageSrc, file, retryAttempt + 1), 1000);
			} else {
				error = 'Failed to load image after 3 attempts';
				isProcessing = false;
			}
		};

		img.onload = () => {
			imageEditorStore.setImageElement(img);
			if (file) {
				imageEditorStore.setFile(file);
			}

			// Initial fit
			const containerWidth = containerRef?.clientWidth;
			const containerHeight = containerRef?.clientHeight;
			const isMobileViewport = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
			const widthFitRatio = isMobileViewport ? 0.9 : 0.82;
			const heightFitRatio = isMobileViewport ? 0.84 : 0.82;
			const scaleX = (containerWidth! * widthFitRatio) / img.width;
			const scaleY = (containerHeight! * heightFitRatio) / img.height;
			const fitScale = Math.min(scaleX, scaleY);
			const isPortraitViewport = containerHeight! > containerWidth! * 1.08;
			const mobileFitBoost = isMobileViewport ? 1.02 : 1;
			const portraitBoost = isPortraitViewport ? 1.04 : 1;
			imageEditorStore.state.zoom = Math.min(5, Math.max(0.1, fitScale * mobileFitBoost * portraitBoost));
			imageEditorStore.state.translateX = 0;
			imageEditorStore.state.translateY = 0;

			imageEditorStore.takeSnapshot();
			isProcessing = false;
		};

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



	function normalizeCropRect(
		crop: { x: number; y: number; width: number; height: number } | null,
		imageWidth: number,
		imageHeight: number
	): { x: number; y: number; width: number; height: number } | null {
		if (!crop) {
			return null;
		}

		let x = Number.isFinite(crop.x) ? crop.x : 0;
		let y = Number.isFinite(crop.y) ? crop.y : 0;
		let width = Number.isFinite(crop.width) ? crop.width : imageWidth;
		let height = Number.isFinite(crop.height) ? crop.height : imageHeight;

		if (width < 0) {
			x += width;
			width = Math.abs(width);
		}
		if (height < 0) {
			y += height;
			height = Math.abs(height);
		}

		x = Math.max(0, Math.min(x, imageWidth - 1));
		y = Math.max(0, Math.min(y, imageHeight - 1));
		width = Math.max(1, Math.min(width, imageWidth - x));
		height = Math.max(1, Math.min(height, imageHeight - y));

		return {
			x: Math.round(x),
			y: Math.round(y),
			width: Math.round(width),
			height: Math.round(height)
		};
	}

	/**
	 * Build CSS filter string from filters object
	 */
	function buildFilterString(filters: Record<string, number>): string {
		const parts: string[] = [];

		if (filters.brightness !== undefined && filters.brightness !== 0) {
			parts.push(`brightness(${100 + filters.brightness}%)`);
		}
		if (filters.contrast !== undefined && filters.contrast !== 0) {
			parts.push(`contrast(${100 + filters.contrast}%)`);
		}
		if (filters.saturation !== undefined && filters.saturation !== 0) {
			parts.push(`saturate(${100 + filters.saturation}%)`);
		}
		if (filters.clarity !== undefined && filters.clarity !== 0) {
			const clarity = filters.clarity;
			if (clarity > 0) {
				parts.push(`contrast(${100 + clarity * 0.42}%)`);
				parts.push(`saturate(${100 + clarity * 0.18}%)`);
				parts.push(`brightness(${100 - clarity * 0.05}%)`);
			} else {
				const softness = Math.abs(clarity);
				parts.push(`contrast(${100 - softness * 0.26}%)`);
				parts.push(`brightness(${100 + softness * 0.1}%)`);
				parts.push(`saturate(${100 - softness * 0.08}%)`);
			}
		}
		if (filters.highlights !== undefined && filters.highlights !== 0) {
			const highlights = filters.highlights;
			if (highlights > 0) {
				parts.push(`brightness(${100 + highlights * 0.25}%)`);
				parts.push(`contrast(${100 - highlights * 0.08}%)`);
			} else {
				const lift = Math.abs(highlights);
				parts.push(`contrast(${100 + lift * 0.12}%)`);
				parts.push(`brightness(${100 - lift * 0.08}%)`);
			}
		}
		if (filters.shadows !== undefined && filters.shadows !== 0) {
			const shadows = filters.shadows;
			if (shadows > 0) {
				parts.push(`brightness(${100 + shadows * 0.2}%)`);
				parts.push(`contrast(${100 - shadows * 0.05}%)`);
			} else {
				const depth = Math.abs(shadows);
				parts.push(`brightness(${100 - depth * 0.18}%)`);
				parts.push(`contrast(${100 + depth * 0.1}%)`);
			}
		}
		if (filters.temperature !== undefined && filters.temperature !== 0) {
			const temp = filters.temperature;
			if (temp > 0) {
				parts.push(`sepia(${temp * 0.3}%)`);
				parts.push(`hue-rotate(${-temp * 0.2}deg)`);
			} else {
				parts.push(`hue-rotate(${Math.abs(temp) * 0.3}deg)`);
			}
		}
		if (filters.tint !== undefined && filters.tint !== 0) {
			parts.push(`hue-rotate(${filters.tint * 1.5}deg)`);
		}
		if (filters.exposure !== undefined && filters.exposure !== 0) {
			parts.push(`brightness(${100 + filters.exposure * 1.2}%)`);
		}
		if (filters.vibrance !== undefined && filters.vibrance !== 0) {
			parts.push(`saturate(${100 + filters.vibrance * 0.7}%)`);
		}

		return parts.join(' ');
	}

	function getSavedToolState<T>(key: string): T[] {
		const state = toolInstances[key]?.saveState?.();
		return Array.isArray(state) ? (state as T[]) : [];
	}

	function loadOverlayImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const image = new Image();
			image.crossOrigin = 'anonymous';
			image.onload = () => resolve(image);
			image.onerror = () => reject(new Error(`Failed to load overlay image: ${src}`));
			image.src = src;
		});
	}



	function applySharpness(canvasContext: CanvasRenderingContext2D, width: number, height: number, filters: Record<string, number>) {
		const sharpness = filters.sharpness ?? 0;
		const clarity = filters.clarity ?? 0;
		const strength = sharpness / 72 + clarity / 92;
		if (strength === 0) {
			return;
		}

		const imageData = canvasContext.getImageData(0, 0, width, height);
		const { data } = imageData;
		const output = new Uint8ClampedArray(data.length);
		const clamp = (value: number) => Math.max(0, Math.min(255, value));

		if (strength < 0) {
			const amount = Math.min(1, Math.abs(strength));
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const index = (y * width + x) * 4;
					let red = 0;
					let green = 0;
					let blue = 0;
					let samples = 0;

					for (let ky = -1; ky <= 1; ky++) {
						const py = Math.max(0, Math.min(height - 1, y + ky));
						for (let kx = -1; kx <= 1; kx++) {
							const px = Math.max(0, Math.min(width - 1, x + kx));
							const sourceIndex = (py * width + px) * 4;
							red += data[sourceIndex];
							green += data[sourceIndex + 1];
							blue += data[sourceIndex + 2];
							samples++;
						}
					}

					const blurredRed = red / samples;
					const blurredGreen = green / samples;
					const blurredBlue = blue / samples;

					output[index] = clamp(data[index] * (1 - amount) + blurredRed * amount);
					output[index + 1] = clamp(data[index + 1] * (1 - amount) + blurredGreen * amount);
					output[index + 2] = clamp(data[index + 2] * (1 - amount) + blurredBlue * amount);
					output[index + 3] = data[index + 3];
				}
			}
			imageData.data.set(output);
			canvasContext.putImageData(imageData, 0, 0);
			return;
		}

		const amount = Math.min(1, strength);
		const sideWeight = -amount * 0.6;
		const centerWeight = 1 + amount * 4.8;
		const totalWeight = centerWeight + sideWeight * 4;
		const normalize = totalWeight !== 0 ? totalWeight : 1;

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const index = (y * width + x) * 4;
				let red = 0;
				let green = 0;
				let blue = 0;
				const alpha = data[index + 3];

				for (let ky = -1; ky <= 1; ky++) {
					const py = Math.max(0, Math.min(height - 1, y + ky));
					for (let kx = -1; kx <= 1; kx++) {
						const px = Math.max(0, Math.min(width - 1, x + kx));
						const sourceIndex = (py * width + px) * 4;
						const weight = kx === 0 && ky === 0 ? centerWeight : kx === 0 || ky === 0 ? sideWeight : 0;
						red += data[sourceIndex] * weight;
						green += data[sourceIndex + 1] * weight;
						blue += data[sourceIndex + 2] * weight;
					}
				}

				output[index] = clamp(red / normalize);
				output[index + 1] = clamp(green / normalize);
				output[index + 2] = clamp(blue / normalize);
				output[index + 3] = alpha;
			}
		}

		imageData.data.set(output);
		canvasContext.putImageData(imageData, 0, 0);
	}

	function drawSourceImage(
		context: CanvasRenderingContext2D,
		img: HTMLImageElement,
		crop: { x: number; y: number; width: number; height: number } | null
	) {
		if (crop) {
			context.drawImage(img, crop.x, crop.y, crop.width, crop.height, -crop.width / 2, -crop.height / 2, crop.width, crop.height);
			return;
		}

		context.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);
	}

	function drawBlurRegions(
		context: CanvasRenderingContext2D,
		img: HTMLImageElement,
		blurRegions: SavedBlurRegion[],
		crop: { x: number; y: number; width: number; height: number } | null
	) {
		if (!blurRegions.length) {
			return;
		}

		for (const region of blurRegions) {
			const blurRadius = Math.max(1, region.strength / 12);
			const imageOffsetX = crop ? -crop.x - crop.width / 2 : -img.width / 2;
			const imageOffsetY = crop ? -crop.y - crop.height / 2 : -img.height / 2;
			const rx = region.x + imageOffsetX;
			const ry = region.y + imageOffsetY;

			context.save();

			if (region.rotation !== 0) {
				const cx = region.x + region.width / 2;
				const cy = region.y + region.height / 2;
				context.translate(cx, cy);
				context.rotate((region.rotation * Math.PI) / 180);
				if (region.flipped) {
					context.scale(-1, 1);
				}
				context.translate(-cx, -cy);
			}

			context.beginPath();
			context.rect(rx, ry, region.width, region.height);
			context.clip();

			context.fillStyle = 'rgba(59, 130, 246, 0.12)';
			context.fillRect(rx, ry, region.width, region.height);
			context.filter = `blur(${blurRadius}px)`;
			drawSourceImage(context, img, crop);
			context.filter = 'none';

			context.restore();
		}
	}

	async function drawEditorOverlays(
		canvas: HTMLCanvasElement,
		options: {
		rotation: number;
		flipH: boolean;
		flipV: boolean;
		crop: { x: number; y: number; width: number; height: number } | null;
		filters: Record<string, number>;
		},
		overlays: {
			watermarks: SavedWatermark[];
			annotations: SavedAnnotation[];
		}
	) {
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			return;
		}

		const outputWidth = canvas.width;
		const outputHeight = canvas.height;
		const crop = options.crop;
		const cropOffsetX = -(crop?.x ?? 0);
		const cropOffsetY = -(crop?.y ?? 0);

		ctx.save();
		ctx.translate(outputWidth / 2, outputHeight / 2);
		ctx.scale(options.flipH ? -1 : 1, options.flipV ? -1 : 1);
		ctx.rotate((options.rotation * Math.PI) / 180);
		ctx.filter = 'none';

		const offsetX = cropOffsetX - outputWidth / 2;
		const offsetY = cropOffsetY - outputHeight / 2;

		for (const annotation of overlays.annotations) {
			ctx.save();
			ctx.globalAlpha = 1;
			ctx.strokeStyle = annotation.stroke;
			ctx.fillStyle = annotation.fill;
			ctx.lineWidth = annotation.strokeWidth;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			if (annotation.type === 'text') {
				ctx.font = `${annotation.fontSize ?? 24}px Arial`;
				ctx.textBaseline = 'top';
				ctx.fillStyle = annotation.stroke;
				ctx.fillText(annotation.text || '', annotation.x + offsetX, annotation.y + offsetY);
			} else if (annotation.type === 'arrow' && annotation.x2 !== undefined && annotation.y2 !== undefined) {
				const ax = annotation.x + offsetX;
				const ay = annotation.y + offsetY;
				const ax2 = annotation.x2 + offsetX;
				const ay2 = annotation.y2 + offsetY;
				ctx.beginPath();
				ctx.moveTo(ax, ay);
				ctx.lineTo(ax2, ay2);
				ctx.stroke();
				const angle = Math.atan2(ay2 - ay, ax2 - ax);
				const headLength = Math.max(10, annotation.strokeWidth * 4);
				ctx.beginPath();
				ctx.moveTo(ax2, ay2);
				ctx.lineTo(ax2 - headLength * Math.cos(angle - Math.PI / 6), ay2 - headLength * Math.sin(angle - Math.PI / 6));
				ctx.moveTo(ax2, ay2);
				ctx.lineTo(ax2 - headLength * Math.cos(angle + Math.PI / 6), ay2 - headLength * Math.sin(angle + Math.PI / 6));
				ctx.stroke();
			} else if (annotation.type === 'rect' && annotation.width && annotation.height) {
				ctx.strokeRect(annotation.x + offsetX, annotation.y + offsetY, annotation.width, annotation.height);
				if (annotation.fill !== 'transparent') {
					ctx.fillRect(annotation.x + offsetX, annotation.y + offsetY, annotation.width, annotation.height);
				}
			} else if (annotation.type === 'circle' && annotation.radius) {
				ctx.beginPath();
				ctx.arc(annotation.x + offsetX, annotation.y + offsetY, annotation.radius, 0, Math.PI * 2);
				ctx.stroke();
				if (annotation.fill !== 'transparent') {
					ctx.fill();
				}
			}

			ctx.restore();
		}

		for (const watermark of overlays.watermarks) {
			ctx.save();
			ctx.globalAlpha = watermark.opacity ?? 0.8;

			if (watermark.type === 'text') {
				ctx.font = `${watermark.fontSize ?? 48}px Arial`;
				ctx.fillStyle = watermark.color ?? '#ffffff';
				ctx.textBaseline = 'top';
				ctx.fillText(watermark.text || '', watermark.x + offsetX, watermark.y + offsetY);
			} else if (watermark.type === 'image' && watermark.imageUrl) {
				try {
					const overlayImage = await loadOverlayImage(watermark.imageUrl);
					ctx.drawImage(overlayImage, watermark.x + offsetX, watermark.y + offsetY, watermark.width, watermark.height);
				} catch (overlayError) {
					logger.warn('Failed to draw watermark overlay image during save', {
						watermarkId: watermark.id,
						error: overlayError
					});
				}
			}

			ctx.restore();
		}

		ctx.restore();
	}

	/**
	 * Render image with all effects applied to an offscreen canvas
	 * This ensures filters are baked into the final image
	 */
	async function renderToCanvas(
		img: HTMLImageElement,
		options: {
			rotation: number;
			flipH: boolean;
			flipV: boolean;
			crop: { x: number; y: number; width: number; height: number } | null;
			filters: Record<string, number>;
		},
		overlays: {
			watermarks: SavedWatermark[];
			annotations: SavedAnnotation[];
		}
	): Promise<HTMLCanvasElement> {
		// Determine output size
		let outputWidth: number;
		let outputHeight: number;

		if (options.crop) {
			outputWidth = options.crop.width;
			outputHeight = options.crop.height;
		} else {
			// For rotation, swap dimensions if needed
			const isRotated = options.rotation % 180 !== 0;
			outputWidth = isRotated ? img.height : img.width;
			outputHeight = isRotated ? img.width : img.height;
		}

		const canvas = document.createElement('canvas');
		canvas.width = outputWidth;
		canvas.height = outputHeight;
		const ctx = canvas.getContext('2d')!;

		// Apply filters
		const filterString = buildFilterString(options.filters);
		if (filterString) {
			ctx.filter = filterString;
		}

		// Move to center
		ctx.translate(outputWidth / 2, outputHeight / 2);

		// Apply transforms
		ctx.scale(options.flipH ? -1 : 1, options.flipV ? -1 : 1);
		ctx.rotate((options.rotation * Math.PI) / 180);

		// Draw image
		drawSourceImage(ctx, img, options.crop);

		applySharpness(ctx, outputWidth, outputHeight, options.filters);
		drawBlurRegions(ctx, img, getSavedToolState<SavedBlurRegion>('blur'), options.crop);
		ctx.restore();

		await drawEditorOverlays(canvas, options, overlays);

		return canvas;
	}

	export async function handleSave() {
		const { imageElement, file, rotation, flipH, flipV, crop, filters } = imageEditorStore.state;
		const storeMediaId = mediaId;

		if (!imageElement) {
			error = 'No image to save';
			return;
		}

		isProcessing = true;
		error = null;

		try {
			const safeCrop = normalizeCropRect(crop, imageElement.width, imageElement.height);

			logger.debug('Starting save process', {
				hasFile: !!file,
				storeMediaId,
				mediaId,
				rotation,
				flipH,
				flipV,
				hasCrop: !!crop,
				filters
			});

			// Render image with all effects to canvas
			const renderedCanvas = await renderToCanvas(imageElement, {
				rotation,
				flipH,
				flipV,
				crop: safeCrop,
				filters
			}, {
				watermarks: getSavedToolState<SavedWatermark>('watermark'),
				annotations: getSavedToolState<SavedAnnotation>('annotate')
			});

			// Convert canvas to blob
			const blob = await new Promise<Blob>((resolve, reject) => {
				renderedCanvas.toBlob(
					(b) => {
						if (b) resolve(b);
						else reject(new Error('Canvas toBlob returned null'));
					},
					'image/webp',
					0.95
				);
			});

			logger.debug('Blob created', { size: blob.size, type: blob.type });

			// Generate unique filename
			const timestamp = Date.now();
			const randomSuffix = Math.random().toString(36).substring(2, 8);
			let originalFileName = 'edited-image';
			if (file instanceof File) {
				originalFileName = file.name.replace(/\.[^/.]+$/, '') || 'edited-image';
			}
			const newFileName = `${originalFileName}-${timestamp}-${randomSuffix}.webp`;

			const editedFile = new File([blob], newFileName, { type: 'image/webp' });
			logger.debug('File created', { name: editedFile.name, size: editedFile.size });

			// Prepare form data
			const formData = new FormData();
			formData.append('file', editedFile);

			if (storeMediaId) {
				formData.append('mediaId', storeMediaId);
			}

			formData.append('operations', JSON.stringify({}));
			formData.append('saveBehavior', saveBehavior as string);
			formData.append('focalPoint', JSON.stringify(focalPoint ?? { x: 50, y: 50 }));

			logger.info('Sending to /api/media/edit', { mediaId: storeMediaId, saveBehavior });

			const response = await fetch('/api/media/edit', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			logger.debug('API response', { success: result.success, hasData: !!result.data });

			if (!result.success) {
				throw new Error(result.error || 'Failed to save image');
			}

			onsave({
				...result.data,
				dataURL: renderedCanvas.toDataURL('image/webp', 0.95),
				file: editedFile,
				mediaId: result.data?._id || storeMediaId,
				saveBehavior,
				manipulations: {
					rotation,
					flipH,
					flipV,
					crop: safeCrop,
					focalPoint: $state.snapshot(focalPoint),
					filters: $state.snapshot(filters),
					blurRegions: getSavedToolState<SavedBlurRegion>('blur'),
					watermarks: getSavedToolState<SavedWatermark>('watermark'),
					annotations: getSavedToolState<SavedAnnotation>('annotate')
				}
			});
		} catch (err) {
			logger.error('Save error:', err);
			error = `Failed to save: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			isProcessing = false;
		}
	}

	onMount(() => {
		imageEditorStore.reset();
		window.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeyDown);
		const toolId = imageEditorStore.state.activeState || lastActiveToolState;
		if (toolId) {
			toolInstances[toolId]?.beforeExit?.();
		}
		imageEditorStore.reset();
	});
</script>

<div
	class="image-editor flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(76,76,76,0.18),_rgba(11,11,11,0.98)_42%)] text-white"
	role="application"
	aria-label="Image editor"
	aria-busy={isProcessing}
>
	{#if error}
		<div class="error-banner bg-error-50 border-l-4 border-error-500 p-4 text-error-700 dark:bg-error-900/20 dark:text-error-300" role="alert">
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
				<iconify-icon icon="mdi:loading" class="animate-spin text-primary-500" width="48"></iconify-icon>
				<p class="font-medium">Processing image...</p>
			</div>
		</div>
	{/if}

	{#if hasImage}
		<div class="pointer-events-none absolute right-3 top-3 z-40 md:right-4 md:top-4">
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
					<div class="relative flex min-h-0 flex-1 overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,_rgba(34,34,34,0.96),_rgba(18,18,18,0.96))] shadow-[0_20px_70px_rgba(0,0,0,0.32)]">
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
									{@const Component = widget.tool}
									<Component bind:this={toolInstances[widget.key]} onCancel={() => imageEditorStore.cancelActiveTool()} />
								{/each}
							{/if}
						</EditorCanvas>
					</div>
				</div>
			</div>

			{#if toolbarControls?.component}
				{@const Component = toolbarControls.component}
				<div class="toolbar-dock row-start-2 px-0 xl:col-start-2 xl:row-start-1 xl:flex xl:h-full xl:min-h-0">
					<div
						class="mx-auto flex w-full max-w-[1100px] flex-col rounded-[16px] border border-white/10 bg-[linear-gradient(180deg,_rgba(44,44,44,0.96),_rgba(24,24,24,0.96))] p-2 shadow-[0_14px_34px_rgba(0,0,0,0.26)] backdrop-blur-xl max-h-[24vh] overflow-auto xl:mx-0 xl:h-full xl:max-h-none xl:min-h-0 xl:max-w-none xl:rounded-[22px] xl:p-3"
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
</div>
