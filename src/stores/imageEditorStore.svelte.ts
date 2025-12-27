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
import type { Component } from 'svelte';

// Types
export interface EditAction {
	undo: () => void;
	redo: () => void;
}

export interface ToolbarControls {
	component: Component<any>;
	props: Record<string, any>;
}

export interface ImageEditorTool {
	id: string;
	name: string;
	icon: string;
	description: string;
}

export interface ImageEditorState {
	file: File | null;
	saveEditedImage: boolean;
	editHistory: EditAction[];
	currentHistoryIndex: number;
	stage: Konva.Stage | null;
	layer: Konva.Layer | null;
	imageNode: Konva.Image | null;
	imageGroup: Konva.Group | null;
	activeState: string | null;
	stateHistory: string[];
	toolbarControls: ToolbarControls | null;
	actions?: {
		undo?: () => void;
		redo?: () => void;
		save?: () => void;
		cancel?: () => void;
	};
	error?: string | null;
}

// Create image editor store
function createImageEditorStore() {
	// State using $state rune
	const state = $state<ImageEditorState>({
		file: null,
		saveEditedImage: false,
		editHistory: [],
		currentHistoryIndex: -1,
		stage: null,
		layer: null,
		imageNode: null,
		imageGroup: null,
		activeState: 'rotate',
		stateHistory: [],
		toolbarControls: null,
		actions: {},
		error: null
	});

	// Derived values using $derived rune
	const canUndo = $derived(state.currentHistoryIndex >= 0);
	const canRedo = $derived(state.currentHistoryIndex < state.editHistory.length - 1);
	const hasActiveImage = $derived(!!state.file && !!state.imageNode);
	const canUndoState = $derived(state.stateHistory.length > 1 && state.currentHistoryIndex > 0);
	const canRedoState = $derived(state.currentHistoryIndex < state.stateHistory.length - 1);

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

	function setToolbarControls(controls: ToolbarControls | null) {
		state.toolbarControls = controls;
	}

	function setActions(actions: Partial<NonNullable<ImageEditorState['actions']>>) {
		state.actions = { ...state.actions, ...actions };
	}

	function setError(error: string | null) {
		state.error = error;
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
		if (!state.stage) return;

		// Force a redraw to ensure the current state is captured
		if (state.layer) {
			state.layer.batchDraw();
		}

		// Save current canvas state to history
		const stateData = state.stage.toJSON();
		saveStateHistory(stateData);
	}

	function addEditAction(action: EditAction) {
		// Remove any redoable actions after current index
		state.editHistory = state.editHistory.slice(0, state.currentHistoryIndex + 1);
		// Add new action
		state.editHistory.push(action);
		// Update current index
		state.currentHistoryIndex = state.editHistory.length - 1;
	}

	function saveStateHistory(stateData: string) {
		// If we're not at the end of history, truncate it
		if (state.currentHistoryIndex < state.stateHistory.length - 1) {
			state.stateHistory = state.stateHistory.slice(0, state.currentHistoryIndex + 1);
		}

		state.stateHistory.push(stateData);
		state.currentHistoryIndex = state.stateHistory.length - 1;
	}

	function undo() {
		if (state.currentHistoryIndex >= 0) {
			state.editHistory[state.currentHistoryIndex].undo();
			state.currentHistoryIndex--;
		}
	}

	function redo() {
		if (state.currentHistoryIndex < state.editHistory.length - 1) {
			state.currentHistoryIndex++;
			state.editHistory[state.currentHistoryIndex].redo();
		}
	}

	function undoState(): string | null {
		if (!canUndoState) return null;
		state.currentHistoryIndex--;
		const stateData = state.stateHistory[state.currentHistoryIndex];
		return stateData;
	}

	function redoState(): string | null {
		if (!canRedoState) return null;
		state.currentHistoryIndex++;
		const stateData = state.stateHistory[state.currentHistoryIndex];
		return stateData;
	}

	function clearHistory() {
		state.editHistory = [];
		state.currentHistoryIndex = -1;
		state.stateHistory = [];
	}

	function reset() {
		state.file = null;
		state.saveEditedImage = false;
		state.editHistory = [];
		state.currentHistoryIndex = -1;
		state.stage = null;
		state.layer = null;
		state.imageNode = null;
		state.imageGroup = null;
		state.activeState = '';
		state.stateHistory = [];
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
		get canUndoState() {
			return canUndoState;
		},
		get canRedoState() {
			return canRedoState;
		},
		setFile,
		setSaveEditedImage,
		setStage,
		setLayer,
		setImageNode,
		setImageGroup,
		setActiveState,
		setToolbarControls,
		setActions,
		setError,
		addEditAction,
		saveStateHistory,
		takeSnapshot,
		undo,
		redo,
		undoState,
		redoState,
		clearHistory,
		cleanupTempNodes,
		cleanupToolSpecific,
		saveToolState,
		reset
	};
}

// Create and export the store instance
export const imageEditorStore = createImageEditorStore();
