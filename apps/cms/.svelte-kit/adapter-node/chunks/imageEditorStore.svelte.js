import 'clsx';
function createImageEditorStore() {
	const state = {
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
		toolbarControls: null,
		preToolSnapshot: null,
		actions: {},
		error: null
	};
	const canUndo = state.currentHistoryIndex >= 0;
	const canRedo = state.currentHistoryIndex < state.editHistory.length - 1;
	const hasActiveImage = !!state.file && !!state.imageNode;
	const canUndoState = state.stateHistory.length > 1 && state.currentHistoryIndex > 0;
	const canRedoState = state.currentHistoryIndex < state.stateHistory.length - 1;
	function setFile(file) {
		state.file = file;
	}
	function setSaveEditedImage(value) {
		state.saveEditedImage = value;
	}
	function setStage(stage) {
		state.stage = stage;
	}
	function setLayer(layer) {
		state.layer = layer;
	}
	function setImageNode(imageNode) {
		state.imageNode = imageNode;
	}
	function setImageGroup(imageGroup) {
		state.imageGroup = imageGroup;
	}
	function setActiveState(newState) {
		const currentState = state.activeState;
		if (newState !== '' && newState !== currentState) {
			state.preToolSnapshot = undoState(true);
		} else if (newState === '') {
			state.preToolSnapshot = null;
		}
		state.activeState = newState;
	}
	function cancelActiveTool() {
		const currentState = state.activeState;
		if (!currentState) return;
		cleanupToolSpecific(currentState);
		setActiveState('');
		setToolbarControls(null);
	}
	function setToolbarControls(controls) {
		state.toolbarControls = controls;
	}
	function setActions(actions) {
		state.actions = { ...state.actions, ...actions };
	}
	function setError(error) {
		state.error = error;
	}
	function cleanupTempNodes() {
		if (!state.layer) return;
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
			state.layer.find(selector).forEach((node) => {
				try {
					node.destroy();
				} catch (e) {
					console.warn('Error destroying node:', e);
				}
			});
		});
		state.layer.find('Transformer').forEach((node) => {
			if (node.name() === 'annotationTransformer') {
				return;
			}
			try {
				node.destroy();
			} catch (e) {
				console.warn('Error destroying transformer:', e);
			}
		});
		state.layer.find('Image').forEach((node) => {
			if (node !== state.imageNode) {
				try {
					node.destroy();
				} catch (e) {
					console.warn('Error destroying overlay image:', e);
				}
			}
		});
		state.layer.find('Group').forEach((node) => {
			if (node.name() === 'cropOverlayGroup' || node.name().includes('temp')) {
				try {
					node.destroy();
				} catch (e) {
					console.warn('Error destroying temporary group:', e);
				}
			}
		});
		state.layer.clearCache();
		state.layer.batchDraw();
	}
	function cleanupToolSpecific(toolName) {
		if (!state.layer) return;
		switch (toolName) {
			case 'crop':
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
				state.layer.find('Image').forEach((node) => {
					if (node !== state.imageNode) {
						try {
							node.destroy();
						} catch (e) {
							console.warn('Error destroying blur overlay image:', e);
						}
					}
				});
				break;
			case 'watermark':
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
		state.layer.find('Transformer').forEach((node) => {
			if (node.name() === 'annotationTransformer') {
				return;
			}
			try {
				node.destroy();
			} catch (e) {
				console.warn('Error destroying transformer:', e);
			}
		});
		state.layer.clearCache();
		state.layer.batchDraw();
	}
	function saveToolState() {
		if (state.stage) {
			takeSnapshot();
		}
	}
	function hideAllUI() {
		if (!state.stage) return;
		const uiItems = state.stage.find((node) => {
			const className = node.className;
			const name = node.name() || '';
			return (
				className === 'Transformer' ||
				name.includes('toolbar') ||
				name.includes('Overlay') ||
				name.includes('Grid') ||
				name.includes('cropTool') || // Specific for crop
				name.includes('cropCut')
			);
		});
		uiItems.forEach((item) => {
			item.visible(false);
		});
		if (state.layer) state.layer.batchDraw();
		state.stage.batchDraw();
	}
	function takeSnapshot() {
		if (!state.stage) return;
		if (state.layer) {
			state.layer.batchDraw();
		}
		const snapshot = {
			stage: state.stage.toJSON(),
			activeState: state.activeState,
			timestamp: Date.now()
		};
		saveStateHistory(JSON.stringify(snapshot));
	}
	function addEditAction(action) {
		state.editHistory = state.editHistory.slice(0, state.currentHistoryIndex + 1);
		state.editHistory.push(action);
		state.currentHistoryIndex = state.editHistory.length - 1;
	}
	function saveStateHistory(stateData) {
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
	function undoState(peek = false) {
		if (!peek && !canUndoState) {
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
		return stateData;
	}
	function redoState() {
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
		reset,
		setStage,
		setLayer,
		setImageNode,
		setImageGroup,
		setFile,
		setActiveState,
		setToolbarControls,
		setError,
		setActions,
		cleanupTempNodes,
		hideAllUI,
		takeSnapshot,
		addEditAction,
		saveToolState,
		cleanupToolSpecific,
		cancelActiveTool,
		undoState: (peek) => undoState(peek),
		redoState,
		clearHistory,
		setSaveEditedImage,
		handleUndo: () => undo(),
		handleRedo: () => redo()
	};
}
const imageEditorStore = createImageEditorStore();
export { imageEditorStore as i };
//# sourceMappingURL=imageEditorStore.svelte.js.map
