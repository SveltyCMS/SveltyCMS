/**
 * @file src/components/image-editor/image-editor-store.svelte.ts
 * @description Manages the image editor state and history
 */

import { logger } from "@utils/logger";
import { normalizeFocalPercent } from "@utils/media/focal-point";
import type { Component } from "svelte";

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
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
    shape?: "rect" | "circle";
    aspectRatio?: number;
  } | null;
  currentAspectRatio: number | null;
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
  pan: { x: number; y: number };
  canvasSize: { width: number; height: number };
  watermarks: any[];
  zoom: number;
  saveBehavior: "new" | "rotate" | "overwrite";
  compareSliderPosition: number; // 0 = off, 1-100 = split position
}

// Create image editor store
function createImageEditorStore() {
  // State using $state rune
  const state = $state<ImageEditorState & { viewportWidth: number }>({
    file: null,
    saveEditedImage: false,
    editHistory: [],
    currentHistoryIndex: -1,
    activeState: "",
    stateHistory: [],
    toolbarControls: null,
    preToolSnapshot: null,
    actions: {},
    error: null,
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : 1024,

    imageElement: null,
    zoom: 1,
    rotation: 0,
    flipH: false,
    flipV: false,
    translateX: 0,
    translateY: 0,
    pan: { x: 0, y: 0 },
    canvasSize: { width: 0, height: 0 },
    crop: null,
    currentAspectRatio: null,
    focalPoint: { x: 50, y: 50 },
    filters: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      grayscale: 0,
      sepia: 0,
      temperature: 0,
    },
    annotations: [],

    blurRegions: [],
    watermarks: [],
    saveBehavior: "new",
    compareSliderPosition: 0, // 0 = off, 1-100 = slider position
  });

  // Constants
  const BREAKPOINTS = {
    mobile: 768,
    tablet: 1024,
    desktop: 1280,
  } as const;

  // Derived values using $derived rune
  const hasActiveImage = $derived(!!state.file && !!state.imageElement);
  const canUndoState = $derived(state.stateHistory.length > 1 && state.currentHistoryIndex > 0);
  const canRedoState = $derived(state.currentHistoryIndex < state.stateHistory.length - 1);

  function computeIsMobile(width = state.viewportWidth) {
    return width < BREAKPOINTS.mobile;
  }

  function computeIsTablet(width = state.viewportWidth) {
    return width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet;
  }

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
    if (newState !== "" && newState !== currentState) {
      // Capture revert point
      state.preToolSnapshot = undoState(true);
    } else if (newState === "") {
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
    } else if (currentState === "blur") {
      state.blurRegions = [];
    }

    setActiveState("");
    setToolbarControls(null);
  }

  function setToolbarControls(controls: ToolbarControls | null) {
    state.toolbarControls = controls;
  }

  function setActions(actions: Partial<NonNullable<ImageEditorState["actions"]>>) {
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
      currentAspectRatio: state.currentAspectRatio,
      focalPoint: $state.snapshot(state.focalPoint),
      filters: $state.snapshot(state.filters),
      annotations: $state.snapshot(state.annotations),
      blurRegions: $state.snapshot(state.blurRegions),
      watermarks: $state.snapshot(state.watermarks),
      timestamp: Date.now(),
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
      state.currentAspectRatio = snapshot.currentAspectRatio ?? null;
      state.focalPoint = normalizeFocalPercent(snapshot.focalPoint);
      state.filters = snapshot.filters ?? {};
      state.annotations = snapshot.annotations ?? [];
      state.blurRegions = snapshot.blurRegions ?? [];
      state.watermarks = snapshot.watermarks ?? [];
      // activeState is UI-only — never restore from history snapshots
    } catch (e) {
      logger.error("Failed to restore snapshot:", e);
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
    if (peek) {
      const idx = state.currentHistoryIndex;
      if (idx < 0 || idx >= state.stateHistory.length) return null;
      return state.stateHistory[idx];
    }
    if (state.currentHistoryIndex <= 0 || state.stateHistory.length <= 1) return null;

    state.currentHistoryIndex--;
    restoreFromSnapshot(state.stateHistory[state.currentHistoryIndex]);
    return state.stateHistory[state.currentHistoryIndex];
  }

  function redoState(): string | null {
    const nextIdx = state.currentHistoryIndex + 1;
    if (nextIdx >= state.stateHistory.length) return null;

    state.currentHistoryIndex = nextIdx;
    restoreFromSnapshot(state.stateHistory[nextIdx]);
    return state.stateHistory[nextIdx];
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
    state.currentAspectRatio = null;
    state.compareSliderPosition = 0;
    state.activeState = "";
    state.filters = {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      grayscale: 0,
      sepia: 0,
      temperature: 0,
      exposure: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0,
      vibrance: 0,
      tint: 0,
      sharpness: 0,
    };
    state.annotations = [];
    state.blurRegions = [];
    state.watermarks = [];
    state.focalPoint = { x: 50, y: 50 };
    state.stateHistory = [];
    state.currentHistoryIndex = -1;
    state.preToolSnapshot = null;
    state.toolbarControls = null;
    state.error = null;
  }

  function switchTool(tool: string) {
    const currentState = state.activeState;

    // Keep the tool active on repeat clicks — controls stay open (deselect via Escape / Cancel).
    if (currentState === tool) {
      return;
    }

    if (currentState) {
      takeSnapshot();
    }

    if (tool && state.stateHistory.length === 0) {
      takeSnapshot();
    }

    // Update selection immediately so the sidebar highlight follows the first click.
    state.activeState = tool;
    state.preToolSnapshot = tool ? undoState(true) : null;
    state.toolbarControls = null;
  }

  function rotate(degrees: number) {
    state.rotation = (state.rotation + degrees) % 360;
    takeSnapshot();
  }

  function flipH() {
    state.flipH = !state.flipH;
    takeSnapshot();
  }

  function flipV() {
    state.flipV = !state.flipV;
    takeSnapshot();
  }

  function updateZoom(delta: number) {
    state.zoom = Math.max(0.1, Math.min(5, state.zoom + delta));
  }

  /** Multiply the current zoom. Used by + / − and the toolbar. */
  function zoomBy(factor: number) {
    state.zoom = Math.max(0.1, Math.min(5, state.zoom * factor));
  }

  /** Photoshop Cmd+1 — 100% of the source pixel size, centered. */
  function zoomActual() {
    state.zoom = 1;
    state.translateX = 0;
    state.translateY = 0;
  }

  /**
   * Photoshop Cmd+0 — fit the image inside the canvas.
   * Ratios match the fit applied when an image first opens.
   */
  function fitToView() {
    const img = state.imageElement;
    const width = state.canvasSize.width;
    const height = state.canvasSize.height;
    state.translateX = 0;
    state.translateY = 0;
    if (!img || width <= 0 || height <= 0 || img.width <= 0 || img.height <= 0) {
      state.zoom = 1;
      return;
    }
    const mobile = computeIsMobile();
    const widthFitRatio = mobile ? 0.84 : 0.82;
    const heightFitRatio = mobile ? 0.62 : 0.82;
    const fitScale = Math.min(
      (width * widthFitRatio) / img.width,
      (height * heightFitRatio) / img.height,
    );
    const portraitBoost = !mobile && height > width * 1.08 ? 1.04 : 1;
    state.zoom = Math.min(5, Math.max(0.1, fitScale * portraitBoost));
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
      return computeIsMobile();
    },
    get isTablet() {
      return computeIsTablet();
    },
    get mobileBreakpoint() {
      return BREAKPOINTS.mobile;
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
    handleRedo: () => redoState(),
    updateCrop: (newCrop: any) => {
      state.crop = newCrop;
    },
    get adjustments() {
      return state.filters;
    },
    get activeToolId() {
      return state.activeState;
    },
    set activeToolId(value: string) {
      setActiveState(value);
    },
    setActiveTool: (toolId: string) => switchTool(toolId),
    rotate,
    flipH,
    flipV,
    updateZoom,
    zoomBy,
    zoomActual,
    fitToView,
    saveHistory: takeSnapshot,
    get canUndo() {
      return canUndoState;
    },
    get canRedo() {
      return canRedoState;
    },
    undo: () => undoState(),
    redo: () => redoState(),
    get saveBehavior() {
      return state.saveBehavior;
    },
    set saveBehavior(value: "new" | "rotate" | "overwrite") {
      state.saveBehavior = value;
    },
    get imageElement() {
      return state.imageElement;
    },
    set imageElement(value: HTMLImageElement | null) {
      state.imageElement = value;
    },
    get compareSliderPosition() {
      return state.compareSliderPosition;
    },
    set compareSliderPosition(value: number) {
      state.compareSliderPosition = Math.max(0, Math.min(100, value));
    },
  };
}

export const imageEditorStore = createImageEditorStore();
