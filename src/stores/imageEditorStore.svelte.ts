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
export interface EditAction {
	undo: () => void;
	redo: () => void;
}

export interface ImageEditorState {
	file: File | null;
	saveEditedImage: boolean;
	editHistory: EditAction[];
	currentHistoryIndex: number;
	stage: Konva.Stage | null;
	layer: Konva.Layer | null;
	imageNode: Konva.Image | null;
	/**
	 * A container group wrapping the primary image & future overlays so that global transforms
	 * (rotation, pan, zoom, focal point adjustments, clipping) can be applied without mutating
	 * the base image node directly each time.
	 */
	imageGroup: Konva.Group | null;
	activeState: string;
	/**
	 * Snapshot history now stores both a dataURL (raster) plus transform metadata so that undo/redo
	 * can faithfully restore group transforms (rotation, scale, position) rather than only swapping
	 * pixel content which previously produced mismatches. Also includes original image properties
	 * to preserve quality during undo/redo operations.
	 */
	stateHistory: {
		dataURL: string;
		group?: { rotation: number; x: number; y: number; scaleX: number; scaleY: number };
		imageProps?: { width: number; height: number; x: number; y: number; originalImageSrc: string };
	}[];
	/**
	 * Index pointer for stateHistory (dataURL based). We keep this separate from
	 * currentHistoryIndex (which is reserved for the functional editHistory based
	 * undo/redo system) to avoid collisions where invoking one type of undo would
	 * corrupt the other history cursor.
	 */
	stateHistoryIndex: number;
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
		activeState: '',
		stateHistory: [],
		stateHistoryIndex: -1
	});

	// Derived values using $derived rune
	const canUndo = $derived(state.currentHistoryIndex >= 0);
	const canRedo = $derived(state.currentHistoryIndex < state.editHistory.length - 1);
	const hasActiveImage = $derived(!!state.file && !!state.imageNode);
	// Snapshot (dataURL) history derived helpers
	const canUndoState = $derived(state.stateHistoryIndex > 0);
	const canRedoState = $derived(state.stateHistoryIndex >= 0 && state.stateHistoryIndex < state.stateHistory.length - 1);

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

	function setImageGroup(group: Konva.Group) {
		state.imageGroup = group;
	}

	function setActiveState(activeState: string) {
		state.activeState = activeState;
	}

	function addEditAction(action: EditAction) {
		// Remove any redoable actions after current index
		state.editHistory = state.editHistory.slice(0, state.currentHistoryIndex + 1);
		// Add new action
		state.editHistory.push(action);
		// Update current index
		state.currentHistoryIndex = state.editHistory.length - 1;
	}

	function saveStateHistory(snapshot: {
		dataURL: string;
		group?: { rotation: number; x: number; y: number; scaleX: number; scaleY: number };
		imageProps?: { width: number; height: number; x: number; y: number; originalImageSrc: string };
	}) {
		// If we're not at the end of snapshot history, truncate the forward branch
		if (state.stateHistoryIndex < state.stateHistory.length - 1) {
			state.stateHistory = state.stateHistory.slice(0, state.stateHistoryIndex + 1);
		}
		state.stateHistory.push(snapshot);
		state.stateHistoryIndex = state.stateHistory.length - 1;
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

	function undoState(): {
		dataURL: string;
		group?: { rotation: number; x: number; y: number; scaleX: number; scaleY: number };
		imageProps?: { width: number; height: number; x: number; y: number; originalImageSrc: string };
	} | null {
		if (!canUndoState) return null;
		state.stateHistoryIndex--;
		return state.stateHistory[state.stateHistoryIndex];
	}

	function redoState(): {
		dataURL: string;
		group?: { rotation: number; x: number; y: number; scaleX: number; scaleY: number };
		imageProps?: { width: number; height: number; x: number; y: number; originalImageSrc: string };
	} | null {
		if (!canRedoState) return null;
		state.stateHistoryIndex++;
		return state.stateHistory[state.stateHistoryIndex];
	}

	function clearHistory() {
		state.editHistory = [];
		state.currentHistoryIndex = -1;
		state.stateHistory = [];
		state.stateHistoryIndex = -1;
	}

	/**
	 * Temporary Konva nodes (layers, transformers, overlays) registered by tools so we can
	 * reliably destroy them when switching tools or loading a new image to prevent leaks.
	 */
	const tempNodes: Konva.Node[] = [];

	function registerTempNodes(...nodes: (Konva.Node | null | undefined)[]) {
		nodes.forEach((n) => {
			if (n) tempNodes.push(n);
		});
	}

	function cleanupTempNodes() {
		// Destroy & empty registry
		while (tempNodes.length) {
			const n = tempNodes.pop();
			try {
				n?.destroy();
			} catch (e) {
				console.warn('Failed destroying temp node', e);
			}
		}
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
		state.stateHistoryIndex = -1;
		cleanupTempNodes();
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
		addEditAction,
		saveStateHistory,
		undo,
		redo,
		undoState,
		redoState,
		clearHistory,
		registerTempNodes,
		cleanupTempNodes,
		reset
	};
}

// Create and export the store instance
export const imageEditorStore = createImageEditorStore();
