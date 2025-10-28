/**
 * @file src/stores/imageEditorStore.svelte.ts
 * @description Manages the image editor
 *
 * This provides functionality to:
 * - Undo and redo actions in the image editor
 * - Add edit actions to the image editor
 * - Track image editor state
 * - Update image editor state reactively
 */

import type Konva from 'konva';

// Types
// Snapshot data to capture complete image state
interface SnapshotData {
	imageDataURL: string; // The actual image source
	imageAttrs: {
		width: number;
		height: number;
		x: number;
		y: number;
		scaleX: number;
		scaleY: number;
		rotation: number;
		cropX?: number;
		cropY?: number;
		cropWidth?: number;
		cropHeight?: number;
	};
	groupAttrs: {
		x: number;
		y: number;
		scaleX: number;
		scaleY: number;
		rotation: number;
	};
	filters: any[];
}

export interface ImageEditorState {
	file: File | null;
	saveEditedImage: boolean;
	stage: Konva.Stage | null;
	layer: Konva.Layer | null;
	imageNode: Konva.Image | null;
	imageGroup: Konva.Group | null;
	activeState: string | null;
	stateHistory: SnapshotData[]; // Array of snapshots with metadata
	currentHistoryIndex: number;
	maxHistory: number;
	originalImageWidth: number; // Track original unscaled dimensions
	originalImageHeight: number;
}

// Create image editor store
function createImageEditorStore() {
	// State using $state rune
	const state = $state<ImageEditorState>({
		file: null,
		saveEditedImage: false,
		stage: null,
		layer: null,
		imageNode: null,
		imageGroup: null,
		activeState: '',
		stateHistory: [],
		currentHistoryIndex: -1,
		maxHistory: 50,
		originalImageWidth: 0,
		originalImageHeight: 0
	});

	// Derived values using $derived rune
	const hasActiveImage = $derived(!!state.file && !!state.imageNode);
	const canUndo = $derived(state.currentHistoryIndex > 0);
	const canRedo = $derived(state.currentHistoryIndex < state.stateHistory.length - 1);

	// Methods to update state
	function setFile(file: File | null) {
		state.file = file;
	}

	function setSaveEditedImage(value: boolean) {
		state.saveEditedImage = value;
	}

	function setStage(stage: Konva.Stage) {
		state.stage = stage;
	}

	function setLayer(layer: Konva.Layer) {
		state.layer = layer;
	}

	function setImageNode(imageNode: Konva.Image) {
		state.imageNode = imageNode;
	}

	function setImageGroup(imageGroup: Konva.Group) {
		state.imageGroup = imageGroup;
	}

	function setActiveState(activeState: string | null) {
		state.activeState = activeState;
	}

	function cleanupTempNodes() {
		if (!state.layer) return;

		// Remove all temporary nodes by name and class
		const tempSelectors = [
			'.cropTool',
			'.transformer',
			'.blurTool',
			'.cropOverlayGroup',
			'[name="cropTool"]',
			'[name="cropHighlight"]',
			'[name="cropOverlay"]',
			'.rotationGrid',
			'.gridLayer',
			'.blurRegion',
			'.mosaicOverlay',
			'[name="watermark"]',
			'[name="watermarkTransformer"]'
		];
		tempSelectors.forEach((selector) => {
			state.layer!.find(selector).forEach((node) => {
				try {
					node.destroy();
				} catch (e) {
					console.warn('Error destroying node:', e);
				}
			});
		});

		// Remove all transformers EXCEPT the annotation transformer
		state.layer.find('Transformer').forEach((node) => {
			// Keep the annotation transformer alive
			if (node.name() === 'annotationTransformer') {
				return;
			}
			try {
				node.destroy();
			} catch (e) {
				console.warn('Error destroying transformer:', e);
			}
		});

		// Remove any image overlays that might be from blur tool
		state.layer.find('Image').forEach((node) => {
			// Only remove overlay images, not the main image node
			if (node !== state.imageNode) {
				try {
					node.destroy();
				} catch (e) {
					console.warn('Error destroying overlay image:', e);
				}
			}
		});

		// Remove any temporary groups
		state.layer.find('Group').forEach((node) => {
			// Check if it's a temporary overlay group
			if (node.name() === 'cropOverlayGroup' || node.name().includes('temp')) {
				try {
					node.destroy();
				} catch (e) {
					console.warn('Error destroying temporary group:', e);
				}
			}
		});

		// Clear any caches to prevent ghosting
		state.layer.clearCache();
		state.layer.batchDraw();
	}

	function cleanupToolSpecific(toolName: string) {
		if (!state.layer) return;

		switch (toolName) {
			case 'crop':
				// Clean up crop-specific elements
				state.layer.find('.cropTool').forEach((node) => {
					try {
						node.destroy();
					} catch (e) {
						console.warn('Error destroying crop tool:', e);
					}
				});
				state.layer.find('.cropOverlayGroup').forEach((node) => {
					try {
						node.destroy();
					} catch (e) {
						console.warn('Error destroying crop overlay group:', e);
					}
				});
				state.layer.find('[name="cropHighlight"]').forEach((node) => {
					try {
						node.destroy();
					} catch (e) {
						console.warn('Error destroying crop highlight:', e);
					}
				});
				break;

			case 'blur':
				// Clean up blur-specific elements
				state.layer.find('.blurRegion').forEach((node) => {
					try {
						node.destroy();
					} catch (e) {
						console.warn('Error destroying blur region:', e);
					}
				});
				state.layer.find('.mosaicOverlay').forEach((node) => {
					try {
						node.destroy();
					} catch (e) {
						console.warn('Error destroying mosaic overlay:', e);
					}
				});
				// Remove any temporary images created by blur tool
				state.layer.find('Image').forEach((node) => {
					// Only remove overlay images, not the main image node
					if (node !== state.imageNode) {
						try {
							node.destroy();
						} catch (e) {
							console.warn('Error destroying blur overlay image:', e);
						}
					}
				});
				break;

				break;

			case 'watermark':
				// Clean up watermark-specific elements
				state.layer.find('[name="watermark"]').forEach((node) => {
					try {
						node.destroy();
					} catch (e) {
						console.warn('Error destroying watermark:', e);
					}
				});
				state.layer.find('[name="watermarkTransformer"]').forEach((node) => {
					try {
						node.destroy();
					} catch (e) {
						console.warn('Error destroying watermark transformer:', e);
					}
				});
				break;
		}

		// Always clean up transformers EXCEPT the annotation transformer
		state.layer.find('Transformer').forEach((node) => {
			// Keep the annotation transformer alive
			if (node.name() === 'annotationTransformer') {
				return;
			}
			try {
				node.destroy();
			} catch (e) {
				console.warn('Error destroying transformer:', e);
			}
		});

		// Clear cache and redraw
		state.layer.clearCache();
		state.layer.batchDraw();
	}

	function saveToolState() {
		// Take a snapshot before switching tools to preserve the current state
		if (state.stage) {
			takeSnapshot();
		}
	}

	function takeSnapshot() {
		if (!state.stage || !state.layer || !state.imageNode || !state.imageGroup) return;

		console.log('📸 Taking snapshot...');

		// Force a redraw to ensure the current state is captured
		state.layer.batchDraw();

		// Get the base image element (not the rendered output)
		const imgElement = state.imageNode.image() as HTMLImageElement | HTMLCanvasElement;
		if (!imgElement) {
			console.error('❌ No image element found');
			return;
		}

		// Capture current image attributes
		const imageAttrs = {
			width: state.imageNode.width(),
			height: state.imageNode.height(),
			x: state.imageNode.x(),
			y: state.imageNode.y(),
			scaleX: state.imageNode.scaleX(),
			scaleY: state.imageNode.scaleY(),
			rotation: state.imageNode.rotation(),
			cropX: state.imageNode.cropX() || undefined,
			cropY: state.imageNode.cropY() || undefined,
			cropWidth: state.imageNode.cropWidth() || undefined,
			cropHeight: state.imageNode.cropHeight() || undefined
		};

		console.log('📊 Image attributes:', {
			width: imageAttrs.width,
			height: imageAttrs.height,
			hasCrop: !!(imageAttrs.cropX || imageAttrs.cropY || imageAttrs.cropWidth || imageAttrs.cropHeight),
			cropInfo: `${imageAttrs.cropX},${imageAttrs.cropY} ${imageAttrs.cropWidth}x${imageAttrs.cropHeight}`
		});

		// Capture imageGroup attributes (includes rotation from Crop tool)
		const groupAttrs = {
			x: state.imageGroup.x(),
			y: state.imageGroup.y(),
			scaleX: state.imageGroup.scaleX(),
			scaleY: state.imageGroup.scaleY(),
			rotation: state.imageGroup.rotation()
		};

		// Capture filters
		const filters = state.imageNode.filters() || [];

		// Get the image source (this is the original or previously edited image)
		// Handle both HTMLImageElement (has .src) and HTMLCanvasElement (use toDataURL)
		let imageDataURL: string;
		if ('src' in imgElement && imgElement.src) {
			imageDataURL = imgElement.src;
		} else if (imgElement instanceof HTMLCanvasElement) {
			imageDataURL = imgElement.toDataURL('image/png');
		} else {
			console.error('❌ Unknown image element type');
			return;
		}

		console.log('🔍 Captured state:', {
			imageAttrs,
			groupAttrs,
			filtersCount: filters.length,
			imageType: imgElement instanceof HTMLCanvasElement ? 'canvas' : 'image',
			imageSrc: imageDataURL.substring(0, 50) + '...',
			imageDataURLLength: imageDataURL.length,
			isBlob: imageDataURL.startsWith('blob:'),
			isDataURL: imageDataURL.startsWith('data:')
		});

		// Create snapshot data
		const snapshotData: SnapshotData = {
			imageDataURL,
			imageAttrs,
			groupAttrs,
			filters
		};

		// Deduplication: Basic check on image data URL
		const lastSnapshot = state.stateHistory[state.currentHistoryIndex];
		if (lastSnapshot && lastSnapshot.imageDataURL === imageDataURL &&
		    JSON.stringify(lastSnapshot.imageAttrs) === JSON.stringify(imageAttrs)) {
			console.log('⏭️ Skipping duplicate snapshot');
			return;
		}

		// Truncate future history if we're not at the end
		if (state.currentHistoryIndex < state.stateHistory.length - 1) {
			state.stateHistory = state.stateHistory.slice(0, state.currentHistoryIndex + 1);
		}

		// Add new snapshot
		state.stateHistory.push(snapshotData);

		// Limit history size (keep most recent maxHistory snapshots)
		if (state.stateHistory.length > state.maxHistory) {
			state.stateHistory.shift(); // Remove oldest
			// Don't increment index since we removed from the beginning
		} else {
			state.currentHistoryIndex++;
		}

		console.log('✅ Snapshot saved. History:', {
			currentIndex: state.currentHistoryIndex,
			totalSnapshots: state.stateHistory.length
		});
	}

	function undo() {
		if (!canUndo) return;
		state.currentHistoryIndex--;
		restoreSnapshot(state.stateHistory[state.currentHistoryIndex]);
	}

	function redo() {
		if (!canRedo) return;
		state.currentHistoryIndex++;
		restoreSnapshot(state.stateHistory[state.currentHistoryIndex]);
	}

	async function restoreSnapshot(snapshotData: SnapshotData) {
		if (!state.stage || !state.layer || !state.imageGroup || !state.imageNode) return;

		console.log('🔄 Restoring snapshot...');
		console.log('📦 Snapshot data:', {
			imageAttrs: snapshotData.imageAttrs,
			filtersCount: snapshotData.filters.length
		});

		try {
			// Load the snapshot image
			const img = new Image();
			img.src = snapshotData.imageDataURL;

			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = reject;
			});

			console.log('🖼️ Loaded image:', {
				naturalWidth: img.naturalWidth,
				naturalHeight: img.naturalHeight
			});

			// Clear all non-imageGroup children (watermarks, annotations, etc.)
			const children = state.layer.getChildren();
			console.log('🧹 Clearing layer overlays (count):', children.length - 1);
			for (let i = children.length - 1; i >= 0; i--) {
				const child = children[i];
				if (child !== state.imageGroup) {
					child.destroy();
				}
			}

			// Clear all children from imageGroup except the main image
			const groupChildren = state.imageGroup.getChildren();
			for (let i = groupChildren.length - 1; i >= 0; i--) {
				const child = groupChildren[i];
				if (child !== state.imageNode) {
					child.destroy();
				}
			}

			// Restore the image and all its attributes
			state.imageNode.image(img);

			// Explicitly clear or set crop attributes
			if (snapshotData.imageAttrs.cropX !== undefined ||
			    snapshotData.imageAttrs.cropY !== undefined ||
			    snapshotData.imageAttrs.cropWidth !== undefined ||
			    snapshotData.imageAttrs.cropHeight !== undefined) {
				// Has crop - set all crop attributes
				state.imageNode.setAttrs({
					...snapshotData.imageAttrs,
					cropX: snapshotData.imageAttrs.cropX || 0,
					cropY: snapshotData.imageAttrs.cropY || 0,
					cropWidth: snapshotData.imageAttrs.cropWidth || snapshotData.imageAttrs.width,
					cropHeight: snapshotData.imageAttrs.cropHeight || snapshotData.imageAttrs.height
				});
			} else {
				// No crop - clear crop attributes
				state.imageNode.setAttrs({
					...snapshotData.imageAttrs,
					cropX: undefined,
					cropY: undefined,
					cropWidth: undefined,
					cropHeight: undefined
				});
			}

			state.imageNode.filters(snapshotData.filters);

			// Restore imageGroup attributes (including rotation)
			state.imageGroup.setAttrs(snapshotData.groupAttrs);

			console.log('🔢 Restored group attrs:', snapshotData.groupAttrs);

			// CRITICAL: Clear cache and force redraw to show the new image
			state.imageNode.clearCache();
			state.imageNode.cache();

			console.log('✅ Snapshot restored');

			// Redraw
			state.layer.batchDraw();
			state.stage.batchDraw();

			console.log('🖼️ Final redraw completed');
		} catch (error) {
			console.error('❌ Failed to restore snapshot:', error);
		}
	}

	function clearHistory() {
		state.stateHistory = [];
		state.currentHistoryIndex = -1;
	}

	function reset() {
		state.file = null;
		state.saveEditedImage = false;
		state.stage = null;
		state.layer = null;
		state.imageNode = null;
		state.imageGroup = null;
		state.activeState = '';
		state.stateHistory = [];
		state.currentHistoryIndex = -1;
		state.originalImageWidth = 0;
		state.originalImageHeight = 0;
	}

	return {
		get state() {
			return state;
		},
		get canUndo() {
			return canUndo;
		},
		get canRedo() {
			return canRedo;
		},
		get hasActiveImage() {
			return hasActiveImage;
		},
		setFile,
		setSaveEditedImage,
		setStage,
		setLayer,
		setImageNode,
		setImageGroup,
		setActiveState,
		takeSnapshot,
		undo,
		redo,
		clearHistory,
		cleanupTempNodes,
		cleanupToolSpecific,
		saveToolState,
		reset
	};
}

// Create and export the store instance
export const imageEditorStore = createImageEditorStore();
