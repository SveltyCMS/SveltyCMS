/**
 * @file src/stores/imageEditorStore.ts
 * @description Manages the image editor state for the application using Svelte stores.
 *
 * This  provides functionality to:
 * - Undo and redo actions in the image editor
 * - Add edit actions to the image editor
 */

import { writable, derived } from 'svelte/store';

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

function createImageEditorStore() {
	const { subscribe, update, set } = writable<ImageEditorState>({
		file: null,
		saveEditedImage: false,
		editHistory: [],
		currentHistoryIndex: -1,
		stage: null,
		layer: null,
		imageNode: null
	});

	return {
		subscribe,
		setFile: (file: File | null) => update((state) => ({ ...state, file })),
		setSaveEditedImage: (value: boolean) => update((state) => ({ ...state, saveEditedImage: value })),
		setStage: (stage: Konva.Stage) => update((state) => ({ ...state, stage })),
		setLayer: (layer: Konva.Layer) => update((state) => ({ ...state, layer })),
		setImageNode: (imageNode: Konva.Image) => update((state) => ({ ...state, imageNode })),
		addEditAction: (action: EditAction) =>
			update((state) => {
				const newHistory = state.editHistory.slice(0, state.currentHistoryIndex + 1);
				newHistory.push(action);
				return {
					...state,
					editHistory: newHistory,
					currentHistoryIndex: newHistory.length - 1
				};
			}),
		undo: () =>
			update((state) => {
				if (state.currentHistoryIndex >= 0) {
					state.editHistory[state.currentHistoryIndex].undo();
					return { ...state, currentHistoryIndex: state.currentHistoryIndex - 1 };
				}
				return state;
			}),
		redo: () =>
			update((state) => {
				if (state.currentHistoryIndex < state.editHistory.length - 1) {
					state.editHistory[state.currentHistoryIndex + 1].redo();
					return { ...state, currentHistoryIndex: state.currentHistoryIndex + 1 };
				}
				return state;
			}),
		clearHistory: () => update((state) => ({ ...state, editHistory: [], currentHistoryIndex: -1 })),
		reset: () =>
			set({
				file: null,
				saveEditedImage: false,
				editHistory: [],
				currentHistoryIndex: -1,
				stage: null,
				layer: null,
				imageNode: null
			})
	};
}

export const imageEditorStore = createImageEditorStore();

export const canUndo = derived(imageEditorStore, ($store) => $store.currentHistoryIndex >= 0);
export const canRedo = derived(imageEditorStore, ($store) => $store.currentHistoryIndex < $store.editHistory.length - 1);
