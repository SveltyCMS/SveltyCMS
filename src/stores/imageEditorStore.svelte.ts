/**
 * @file src/stores/imageEditorStore.svelte.ts
 * @description Manages the image editor using Svelte 5 runes
 *
 * This provides functionality to:
 * - Undo and redo actions in the image editor
 * - Add edit actions to the image editor
 * - Track image editor state
 * - Update image editor state reactively
 */

import { store } from '@src/utils/reactivity.svelte';
import type Konva from 'konva';

// Types
interface EditAction {
	undo: () => void;
	redo: () => void;
}

interface ImageEditorState {
	file: File | null;
	saveEditedImage: boolean;
	editHistory: EditAction[];
	currentHistoryIndex: number;
	stage: Konva.Stage | null;
	layer: Konva.Layer | null;
	imageNode: Konva.Image | null;
}

// Initial state
const initialState: ImageEditorState = {
	file: null,
	saveEditedImage: false,
	editHistory: [],
	currentHistoryIndex: -1,
	stage: null,
	layer: null,
	imageNode: null
};

// Create base stores
function createImageEditorStores() {
	// Base store
	const state = store<ImageEditorState>(initialState);

	// Derived values
	const canUndo = $derived(state().currentHistoryIndex >= 0);
	const canRedo = $derived(state().currentHistoryIndex < state().editHistory.length - 1);
	const hasActiveImage = $derived(!!state().file && !!state().imageNode);

	// Methods to update state
	function setFile(file: File | null) {
		state.update(($state) => ({ ...$state, file }));
	}

	function setSaveEditedImage(value: boolean) {
		state.update(($state) => ({ ...$state, saveEditedImage: value }));
	}

	function setStage(stage: Konva.Stage) {
		state.update(($state) => ({ ...$state, stage }));
	}

	function setLayer(layer: Konva.Layer) {
		state.update(($state) => ({ ...$state, layer }));
	}

	function setImageNode(imageNode: Konva.Image) {
		state.update(($state) => ({ ...$state, imageNode }));
	}

	function addEditAction(action: EditAction) {
		state.update(($state) => {
			// Remove any redoable actions after current index
			const editHistory = $state.editHistory.slice(0, $state.currentHistoryIndex + 1);
			// Add new action
			editHistory.push(action);
			// Update state with new history and index
			return {
				...$state,
				editHistory,
				currentHistoryIndex: editHistory.length - 1
			};
		});
	}

	function undo() {
		state.update(($state) => {
			if ($state.currentHistoryIndex >= 0) {
				$state.editHistory[$state.currentHistoryIndex].undo();
				return {
					...$state,
					currentHistoryIndex: $state.currentHistoryIndex - 1
				};
			}
			return $state;
		});
	}

	function redo() {
		state.update(($state) => {
			if ($state.currentHistoryIndex < $state.editHistory.length - 1) {
				$state.editHistory[$state.currentHistoryIndex + 1].redo();
				return {
					...$state,
					currentHistoryIndex: $state.currentHistoryIndex + 1
				};
			}
			return $state;
		});
	}

	function clearHistory() {
		state.update(($state) => ({
			...$state,
			editHistory: [],
			currentHistoryIndex: -1
		}));
	}

	function reset() {
		state.set(initialState);
	}

	return {
		state,
		canUndo,
		canRedo,
		hasActiveImage,
		setFile,
		setSaveEditedImage,
		setStage,
		setLayer,
		setImageNode,
		addEditAction,
		undo,
		redo,
		clearHistory,
		reset
	};
}

// Create and export stores
const stores = createImageEditorStores();

// Export main store with full interface
export const imageEditorStore = {
	subscribe: stores.state.subscribe,
	setFile: stores.setFile,
	setSaveEditedImage: stores.setSaveEditedImage,
	setStage: stores.setStage,
	setLayer: stores.setLayer,
	setImageNode: stores.setImageNode,
	addEditAction: stores.addEditAction,
	undo: stores.undo,
	redo: stores.redo,
	clearHistory: stores.clearHistory,
	reset: stores.reset
};

// Export derived values
export const canUndo = { subscribe: () => stores.canUndo };
export const canRedo = { subscribe: () => stores.canRedo };
export const hasActiveImage = { subscribe: () => stores.hasActiveImage };

// Export types
export type { EditAction, ImageEditorState };
