<!--
@file: /src/routes/(app)/imageEditor/FineTune.svelte
@component
**Fine-tuning adjustments for images with Pintura-inspired UX**
Provides comprehensive image adjustments including brightness, contrast, saturation,
temperature, exposure, highlights, shadows, clarity, and vibrance using a top toolbar approach.

#### Props
- `stage`: Konva stage instance
- `layer`: Konva layer instance
- `imageNode`: Konva image node
- `onFineTuneApplied`: Callback when adjustments are applied
- `onFineTuneReset`: Callback when adjustments are reset
-->

<script lang="ts">
	import Konva from 'konva';
	import FineTuneTopToolbar from './FineTuneTopToolbar.svelte';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		activeAdjustment?: string;
		onActiveAdjustmentChange?: (adjustment: string) => void;
		onFineTuneApplied?: () => void;
		onFineTuneReset?: () => void;
	}

	const {
		stage,
		layer,
		imageNode,
		activeAdjustment: parentActiveAdjustment = 'brightness',
		onActiveAdjustmentChange = () => {},
		onFineTuneApplied = () => {},
		onFineTuneReset = () => {}
	} = $props() as Props;

	// Store original image data for before/after comparison
	let originalImageData: ImageData | null = $state(null);
	let isComparing = $state(false);

	// Fine-tuning adjustments
	interface Adjustments {
		brightness: number;
		contrast: number;
		saturation: number;
		temperature: number;
		exposure: number;
		highlights: number;
		shadows: number;
		clarity: number;
		vibrance: number;
	}

	let adjustments: Adjustments = $state({
		brightness: 0,
		contrast: 0,
		saturation: 0,
		temperature: 0,
		exposure: 0,
		highlights: 0,
		shadows: 0,
		clarity: 0,
		vibrance: 0
	});

	// Cache the custom filter to avoid recreating it unnecessarily
	let customFilter: ((imageData: ImageData) => void) | null = $state(null);

	// Currently active adjustment
	let activeAdjustment = $state(parentActiveAdjustment);

	// Sync with parent's active adjustment
	$effect(() => {
		if (parentActiveAdjustment !== activeAdjustment) {
			activeAdjustment = parentActiveAdjustment;
		}
	});

	// Initialize with original image data
	$effect(() => {
		console.log('FineTune component mounted');
		if (imageNode && imageNode.getCanvas()) {
			const context = imageNode.getCanvas().getContext();
			if (context) {
				originalImageData = context.getImageData(0, 0, imageNode.width(), imageNode.height());
			}

			// Ensure the image node is cached for filters to work
			imageNode.cache();
		}

		return () => {
			console.log('FineTune component unmounting');
			// Cleanup filters when component unmounts
			if (imageNode) {
				imageNode.filters([]);
				imageNode.clearCache();
			}
			layer?.batchDraw();
		};
	});

	// Apply all adjustments to the image
	function applyAdjustments() {
		if (!imageNode || !layer) return;

		const activeFilters: ((imageData: ImageData) => void)[] = [];

		// Reset all filter properties first
		imageNode.brightness(0);
		imageNode.contrast(0);
		imageNode.saturation(0);
		imageNode.hue(0);
		imageNode.luminance(0);

		// Apply brightness
		if (adjustments.brightness !== 0) {
			activeFilters.push(Konva.Filters.Brighten);
			imageNode.brightness(adjustments.brightness / 100);
		}

		// Apply contrast
		if (adjustments.contrast !== 0) {
			activeFilters.push(Konva.Filters.Contrast);
			imageNode.contrast(adjustments.contrast / 100);
		}

		// Apply saturation and vibrance (using HSL filter)
		if (adjustments.saturation !== 0 || adjustments.vibrance !== 0) {
			activeFilters.push(Konva.Filters.HSL);
			// Combine saturation and vibrance
			const combinedSaturation = (adjustments.saturation + adjustments.vibrance * 0.7) / 100;
			imageNode.saturation(combinedSaturation);
		}

		// Apply temperature as hue shift
		if (adjustments.temperature !== 0) {
			activeFilters.push(Konva.Filters.HSL);
			// Map temperature (-100 to 100) to hue rotation
			const hueShift = adjustments.temperature * 0.9; // Scale to reasonable hue range
			imageNode.hue(hueShift);
		}

		// Apply custom filters for non-standard adjustments
		if (adjustments.exposure !== 0 || adjustments.highlights !== 0 || adjustments.shadows !== 0 || adjustments.clarity !== 0) {
			// Create or update the cached custom filter
			customFilter = createCustomFilter();
			activeFilters.push(customFilter);
		} else {
			customFilter = null;
		}

		// Apply filters to the image node
		imageNode.filters(activeFilters);

		// Force cache reset and redraw to apply changes
		imageNode.clearCache();
		imageNode.cache();
		layer.batchDraw();

		// Notify parent component that adjustments have been made
		// This allows the parent to take a snapshot for undo/redo
		if (typeof window !== 'undefined' && window.parent) {
			// Dispatch a custom event to notify the parent
			window.dispatchEvent(new CustomEvent('fineTuneAdjustment', { detail: { adjustments } }));
		}
	}

	// Create custom filter for advanced adjustments
	function createCustomFilter() {
		// Create a closure that captures the current adjustment values
		const { exposure, highlights, shadows, clarity } = adjustments;

		return function (imageData: ImageData) {
			const data = imageData.data;

			for (let i = 0; i < data.length; i += 4) {
				let r = data[i];
				let g = data[i + 1];
				let b = data[i + 2];

				// Apply exposure
				if (exposure !== 0) {
					const exposureFactor = 1 + exposure / 100;
					r = Math.min(255, r * exposureFactor);
					g = Math.min(255, g * exposureFactor);
					b = Math.min(255, b * exposureFactor);
				}

				// Apply highlights adjustment (affects bright areas)
				if (highlights !== 0) {
					const brightness = (r + g + b) / 3;
					if (brightness > 200) {
						const factor = 1 + highlights / 200;
						r = Math.min(255, r * factor);
						g = Math.min(255, g * factor);
						b = Math.min(255, b * factor);
					}
				}

				// Apply shadows adjustment (affects dark areas)
				if (shadows !== 0) {
					const brightness = (r + g + b) / 3;
					if (brightness < 55) {
						const factor = 1 + shadows / 100;
						r = Math.min(255, r * factor);
						g = Math.min(255, g * factor);
						b = Math.min(255, b * factor);
					}
				}

				// Apply clarity (local contrast enhancement)
				if (clarity !== 0) {
					const midtone = 128;
					const factor = 1 + clarity / 100;

					r = midtone + (r - midtone) * factor;
					g = midtone + (g - midtone) * factor;
					b = midtone + (b - midtone) * factor;

					// Clamp values
					r = Math.max(0, Math.min(255, r));
					g = Math.max(0, Math.min(255, g));
					b = Math.max(0, Math.min(255, b));
				}

				data[i] = r;
				data[i + 1] = g;
				data[i + 2] = b;
			}
		};
	}

	// Handle individual adjustment change
	function handleAdjustmentChange(adjustment: keyof Adjustments, value: number) {
		adjustments[adjustment] = value;
		// Use setTimeout to ensure the state is updated before applying adjustments
		setTimeout(() => {
			applyAdjustments();
		}, 0);
	}

	// Handle active adjustment change
	function handleActiveAdjustmentChange(adjustment: string) {
		activeAdjustment = adjustment;
		onActiveAdjustmentChange(adjustment);
	}

	// Handle value change from top toolbar
	function handleValueChange(value: number) {
		handleAdjustmentChange(activeAdjustment as keyof Adjustments, value);
	}

	// Reset all adjustments
	function resetAdjustments() {
		adjustments = {
			brightness: 0,
			contrast: 0,
			saturation: 0,
			temperature: 0,
			exposure: 0,
			highlights: 0,
			shadows: 0,
			clarity: 0,
			vibrance: 0
		};

		imageNode.filters([]);
		imageNode.brightness(0);
		imageNode.contrast(0);
		imageNode.saturation(0);
		imageNode.hue(0);
		imageNode.luminance(0);

		// Force cache reset and redraw
		imageNode.clearCache();
		imageNode.cache();
		layer.batchDraw();

		onFineTuneReset();
	}

	// Before/After comparison
	function startComparison() {
		if (!originalImageData || !imageNode || !layer) return;

		isComparing = true;
		// Temporarily remove all filters to show original
		imageNode.filters([]);
		imageNode.clearCache();
		imageNode.cache();
		layer.batchDraw();
	}

	function endComparison() {
		if (!imageNode || !layer) return;

		isComparing = false;
		// Reapply all adjustments
		applyAdjustments();
	}

	// Exit fine-tuning mode
	function exitFineTune() {
		// Just call the callback - adjustments are now applied separately via Apply button
		onFineTuneApplied();
	}

	// Apply the fine-tuning adjustments permanently to the image
	function applyFineTunePermanently() {
		if (!imageNode || !layer || !stage) return;

		// Create a temporary canvas at the original image resolution
		const tempCanvas = document.createElement('canvas');
		const tempContext = tempCanvas.getContext('2d');
		if (!tempContext) return;

		// Set canvas size to match the original image dimensions
		tempCanvas.width = imageNode.width();
		tempCanvas.height = imageNode.height();

		// Get the image group to calculate position and scale
		const imageGroup = imageNode.getParent();
		if (!imageGroup) return;

		// Calculate the position and scale of the image in the stage
		const stagePos = imageGroup.getAbsolutePosition();
		const scale = imageGroup.scaleX(); // Assuming uniform scaling

		const imageX = stagePos.x - (imageNode.width() * scale) / 2;
		const imageY = stagePos.y - (imageNode.height() * scale) / 2;
		const imageWidth = imageNode.width() * scale;
		const imageHeight = imageNode.height() * scale;

		// Calculate the pixel ratio needed to maintain original quality
		// This ensures we capture at the original image resolution, not the display resolution
		const pixelRatio = Math.max(imageNode.width() / imageWidth, imageNode.height() / imageHeight);

		// Get the current filtered image from the stage at high resolution
		const filteredDataURL = stage.toDataURL({
			x: imageX,
			y: imageY,
			width: imageWidth,
			height: imageHeight,
			pixelRatio: pixelRatio,
			mimeType: 'image/png', // Use PNG for lossless quality
			quality: 1.0
		});

		// Create a new image from the filtered data URL
		const filteredImage = new Image();
		filteredImage.crossOrigin = 'anonymous';

		filteredImage.onload = () => {
			// Draw the filtered image directly to our temporary canvas at full resolution
			// This avoids quality loss from intermediate scaling
			tempContext.drawImage(filteredImage, 0, 0, filteredImage.width, filteredImage.height, 0, 0, imageNode.width(), imageNode.height());

			// Convert the canvas to a data URL with maximum quality
			// Use PNG format to avoid JPEG compression artifacts
			const newImageDataURL = tempCanvas.toDataURL('image/png', 1.0);

			// Create a new image from the data URL
			const newImage = new Image();
			newImage.crossOrigin = 'anonymous';

			newImage.onload = () => {
				// Remove all filters from the current image node
				imageNode.filters([]);
				imageNode.brightness(0);
				imageNode.contrast(0);
				imageNode.saturation(0);
				imageNode.hue(0);
				imageNode.luminance(0);

				// Update the image node with the new filtered image
				imageNode.image(newImage);

				// Clear cache and redraw
				imageNode.clearCache();
				imageNode.cache();
				layer.batchDraw();

				// Reset all adjustments to their default values
				adjustments = {
					brightness: 0,
					contrast: 0,
					saturation: 0,
					temperature: 0,
					exposure: 0,
					highlights: 0,
					shadows: 0,
					clarity: 0,
					vibrance: 0
				};
			};

			newImage.src = newImageDataURL;
		};

		filteredImage.src = filteredDataURL;
	}

	// Expose methods and state for parent component
	export { handleAdjustmentChange, startComparison, endComparison, resetAdjustments, exitFineTune, applyFineTunePermanently, adjustments };
</script>

<!-- Toolbars are now rendered in ImageEditor.svelte -->
