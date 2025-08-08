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
	activeState: string;
	stateHistory: string[];
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
		activeState: '',
		stateHistory: []
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
		return state.stateHistory[state.currentHistoryIndex];
	}

	function redoState(): string | null {
		if (!canRedoState) return null;
		state.currentHistoryIndex++;
		return state.stateHistory[state.currentHistoryIndex];
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
		setActiveState,
		addEditAction,
		saveStateHistory,
		undo,
		redo,
		undoState,
		redoState,
		clearHistory,
		reset
	};
}

// Create and export the store instance
export const imageEditorStore = createImageEditorStore();
