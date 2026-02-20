/**
 * @file src/stores/image-editor-store.svelte.ts
 * @description Manages the image editor
 *
 * This provides functionality to:
 * - Undo and redo actions in the image editor
 * - Add edit actions to the image editor
 * - Track image editor state
 * - Update image editor state reactively
 */

/**
 * @file src/stores/image-editor-store.svelte.ts
 * @description Manages the image editor state and history
 */

import type { Component } from 'svelte';

// Types
export interface EditAction {
	redo: () => void;
	undo: () => void;
}

export interface ToolbarControls {
	component: Component<any>;
	props: Record<string, any>;
}

export interface ImageEditorTool {
	description: string;
	icon: string;
	id: string;
	name: string;
}

export interface ImageEditorState {
	actions?: {
		undo?: () => void;
		redo?: () => void;
		save?: () => void;
		cancel?: () => void;
	};
	activeState: string;
	annotations: any[];

	blurRegions: any[];

	// Image specific properties
	crop: { x: number; y: number; width: number; height: number } | null;
	currentHistoryIndex: number;
	editHistory: EditAction[];
	error?: string | null;
	file: File | null;
	filters: Record<string, number>;
	flipH: boolean;
	flipV: boolean;
	focalPoint: { x: number; y: number } | null;

	// Canvas related state
	imageElement: HTMLImageElement | null;
	preToolSnapshot: string | null;
	rotation: number;
	saveEditedImage: boolean;
	stateHistory: string[];
	toolbarControls: ToolbarControls | null;
	translateX: number;
	translateY: number;
	watermarks: any[];
	zoom: number;
}

// Create image editor store
function createImageEditorStore() {
	// State using $state rune
	const state = $state<ImageEditorState & { viewportWidth: number }>({
		file: null,
		saveEditedImage: false,
		editHistory: [],
		currentHistoryIndex: -1,
		activeState: '',
		stateHistory: [],
		toolbarControls: null,
		preToolSnapshot: null,
		actions: {},
		error: null,
		viewportWidth: 0,

		imageElement: null,
		zoom: 1,
		rotation: 0,
		flipH: false,
		flipV: false,
		translateX: 0,
		translateY: 0,

		crop: null,
		focalPoint: { x: 0.5, y: 0.5 },
		filters: {},
		annotations: [],

		blurRegions: [],
		watermarks: []
	});

	// Constants
	const BREAKPOINTS = {
		mobile: 768,
		tablet: 1024,
		desktop: 1280
	} as const;

	// Derived values using $derived rune
	const hasActiveImage = $derived(!!state.file && !!state.imageElement);
	const canUndoState = $derived(state.stateHistory.length > 1 && state.currentHistoryIndex > 0);
	const canRedoState = $derived(state.currentHistoryIndex < state.stateHistory.length - 1);

	const isMobile = $derived(state.viewportWidth < BREAKPOINTS.mobile);
	const isTablet = $derived(state.viewportWidth >= BREAKPOINTS.mobile && state.viewportWidth < BREAKPOINTS.tablet);

	// Methods to update state
	function setFile(file: File | null) {
		state.file = file;
	}

	function setImageElement(img: HTMLImageElement | null) {
		state.imageElement = img;
	}

	function setSaveEditedImage(value: boolean) {
		state.saveEditedImage = value;
	}

	function setActiveState(newState: string) {
		const currentState = state.activeState;
		if (newState !== '' && newState !== currentState) {
			// Capture revert point
			state.preToolSnapshot = undoState(true);
		} else if (newState === '') {
			state.preToolSnapshot = null;
		}
		state.activeState = newState;
	}

	function cancelActiveTool() {
		const currentState = state.activeState;
		if (!currentState) {
			return;
		}

		if (state.preToolSnapshot) {
			restoreFromSnapshot(state.preToolSnapshot);
		}

		setActiveState('');
		setToolbarControls(null);
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

	function takeSnapshot() {
		const snapshot = {
			zoom: state.zoom,
			rotation: state.rotation,
			flipH: state.flipH,
			flipV: state.flipV,
			translateX: state.translateX,
			translateY: state.translateY,
			crop: $state.snapshot(state.crop),
			focalPoint: $state.snapshot(state.focalPoint),
			filters: $state.snapshot(state.filters),
			activeState: state.activeState,
			timestamp: Date.now()
		};

		saveStateHistory(JSON.stringify(snapshot));
	}

	function restoreFromSnapshot(snapshotStr: string) {
		try {
			const snapshot = JSON.parse(snapshotStr);
			state.zoom = snapshot.zoom ?? 1;
			state.rotation = snapshot.rotation ?? 0;
			state.flipH = snapshot.flipH ?? false;
			state.flipV = snapshot.flipV ?? false;
			state.translateX = snapshot.translateX ?? 0;
			state.translateY = snapshot.translateY ?? 0;
			state.crop = snapshot.crop ?? null;
			state.focalPoint = snapshot.focalPoint ?? { x: 0.5, y: 0.5 };
			state.filters = snapshot.filters ?? {};
			state.activeState = snapshot.activeState ?? '';
		} catch (e) {
			console.error('Failed to restore snapshot:', e);
		}
	}

	function saveStateHistory(stateData: string) {
		if (state.currentHistoryIndex < state.stateHistory.length - 1) {
			state.stateHistory = state.stateHistory.slice(0, state.currentHistoryIndex + 1);
		}

		state.stateHistory.push(stateData);
		state.currentHistoryIndex = state.stateHistory.length - 1;
	}

	function undoState(peek = false): string | null {
		if (!(peek || canUndoState)) {
			return null;
		}
		if (peek && state.currentHistoryIndex < 0) {
			return null;
		}

		let targetIndex = state.currentHistoryIndex;
		if (!peek) {
			targetIndex--;
			state.currentHistoryIndex = targetIndex;
		}

		if (targetIndex < 0 || targetIndex >= state.stateHistory.length) {
			return null;
		}

		const stateData = state.stateHistory[targetIndex];
		if (!peek) {
			restoreFromSnapshot(stateData);
		}
		return stateData;
	}

	function redoState(): string | null {
		if (!canRedoState) {
			return null;
		}
		state.currentHistoryIndex++;
		const stateData = state.stateHistory[state.currentHistoryIndex];
		restoreFromSnapshot(stateData);
		return stateData;
	}

	function reset() {
		state.file = null;
		state.imageElement = null;
		state.zoom = 1;
		state.rotation = 0;
		state.flipH = false;
		state.flipV = false;
		state.translateX = 0;
		state.translateY = 0;
		state.crop = null;
		state.filters = {};
		state.activeState = '';
		state.stateHistory = [];
		state.currentHistoryIndex = -1;
	}

	function switchTool(tool: string) {
		const currentState = state.activeState;
		const newState = currentState === tool ? '' : tool;

		if (currentState && currentState !== newState) {
			takeSnapshot();
		}

		setActiveState(newState);

		if (newState === '') {
			setToolbarControls(null);
		}
	}

	return {
		get state() {
			return state;
		},
		get canUndoState() {
			return canUndoState;
		},
		get canRedoState() {
			return canRedoState;
		},
		get hasActiveImage() {
			return hasActiveImage;
		},
		get isMobile() {
			return isMobile;
		},
		get isTablet() {
			return isTablet;
		},
		setViewportWidth: (width: number) => {
			state.viewportWidth = width;
		},
		reset,
		setFile,
		setImageElement,
		setActiveState,
		switchTool,
		setToolbarControls,
		setError,
		setActions,
		takeSnapshot,
		cancelActiveTool,
		undoState: (peek?: boolean) => undoState(peek),
		redoState,
		setSaveEditedImage,
		handleUndo: () => undoState(),
		handleRedo: () => redoState()
	};
}

export const imageEditorStore = createImageEditorStore();
