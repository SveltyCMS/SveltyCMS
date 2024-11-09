/**
 * @file src/stores/imageEditorStore.ts
 * @description Manages the image editor
 *
 *
 * This provides functionality to:
 * - Undo and redo actions in the image editor
 * - Add edit actions to the image editor
 * - Track image editor state
 * - Update image editor state
 *
 */

import type Konva from 'konva';

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

class ImageEditor {
	// State declaration
	$state: ImageEditorState = {
		file: null,
		saveEditedImage: false,
		editHistory: [],
		currentHistoryIndex: -1,
		stage: null,
		layer: null,
		imageNode: null
	};

	// Computed values
	get $derived() {
		return {
			canUndo: this.$state.currentHistoryIndex >= 0,
			canRedo: this.$state.currentHistoryIndex < this.$state.editHistory.length - 1,
			hasActiveImage: !!this.$state.file && !!this.$state.imageNode
		};
	}

	// Methods to update state
	setFile(file: File | null) {
		this.$state.file = file;
	}

	setSaveEditedImage(value: boolean) {
		this.$state.saveEditedImage = value;
	}

	setStage(stage: Konva.Stage) {
		this.$state.stage = stage;
	}

	setLayer(layer: Konva.Layer) {
		this.$state.layer = layer;
	}

	setImageNode(imageNode: Konva.Image) {
		this.$state.imageNode = imageNode;
	}

	addEditAction(action: EditAction) {
		// Remove any redoable actions after current index
		this.$state.editHistory = this.$state.editHistory.slice(0, this.$state.currentHistoryIndex + 1);
		// Add new action
		this.$state.editHistory.push(action);
		// Update index
		this.$state.currentHistoryIndex = this.$state.editHistory.length - 1;
	}

	undo() {
		if (this.$derived.canUndo) {
			this.$state.editHistory[this.$state.currentHistoryIndex].undo();
			this.$state.currentHistoryIndex--;
		}
	}

	redo() {
		if (this.$derived.canRedo) {
			this.$state.editHistory[this.$state.currentHistoryIndex + 1].redo();
			this.$state.currentHistoryIndex++;
		}
	}

	clearHistory() {
		this.$state.editHistory = [];
		this.$state.currentHistoryIndex = -1;
	}

	reset() {
		this.$state = {
			file: null,
			saveEditedImage: false,
			editHistory: [],
			currentHistoryIndex: -1,
			stage: null,
			layer: null,
			imageNode: null
		};
	}
}

// Create and export singleton instance
export const imageEditor = new ImageEditor();

// For backward compatibility with existing code that uses stores
export const imageEditorStore = {
	subscribe: (fn: (value: ImageEditorState) => void) => {
		fn(imageEditor.$state);
		return () => {};
	},
	setFile: (file: File | null) => imageEditor.setFile(file),
	setSaveEditedImage: (value: boolean) => imageEditor.setSaveEditedImage(value),
	setStage: (stage: Konva.Stage) => imageEditor.setStage(stage),
	setLayer: (layer: Konva.Layer) => imageEditor.setLayer(layer),
	setImageNode: (imageNode: Konva.Image) => imageEditor.setImageNode(imageNode),
	addEditAction: (action: EditAction) => imageEditor.addEditAction(action),
	undo: () => imageEditor.undo(),
	redo: () => imageEditor.redo(),
	clearHistory: () => imageEditor.clearHistory(),
	reset: () => imageEditor.reset()
};

// For backward compatibility with derived stores
export const canUndo = {
	subscribe: (fn: (value: boolean) => void) => {
		fn(imageEditor.$derived.canUndo);
		return () => {};
	}
};

export const canRedo = {
	subscribe: (fn: (value: boolean) => void) => {
		fn(imageEditor.$derived.canRedo);
		return () => {};
	}
};
