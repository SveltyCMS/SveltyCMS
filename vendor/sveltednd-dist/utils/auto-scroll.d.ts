/**
 * Centralized auto-scroll manager for drag operations.
 *
 * Activates when a drag starts, attaches a single set of document-level
 * listeners, and runs a requestAnimationFrame loop that scrolls any
 * scrollable ancestor whose edge the pointer is near.
 *
 * IMPORTANT: The scroll loop must not run until a real pointer/drag
 * position has been observed. Starting with default (0,0) scrolls the
 * page toward the top-left on first pointerdown (issue #61).
 *
 * @module auto-scroll
 */
/**
 * Calculates scroll speed based on distance from edge.
 * Returns 0 if distance >= EDGE_THRESHOLD.
 */
declare function calcScrollSpeed(distance: number): number;
/**
 * Checks if an element is scrollable (has overflow auto/scroll and
 * content exceeding its client dimensions).
 */
declare function isScrollable(el: HTMLElement): boolean;
/**
 * Walks up from `el` to document root, collecting scrollable ancestors.
 */
declare function getScrollableAncestors(el: HTMLElement): HTMLElement[];
/**
 * Starts the auto-scroll manager.
 * Call when a drag operation begins (or on first pointermove after drag start).
 *
 * Scrolling itself only begins after the first pointermove/dragover updates
 * the cached coordinates (#61).
 */
export declare function startAutoScroll(): void;
/**
 * Stops the auto-scroll manager.
 * Call when a drag operation ends.
 */
export declare function stopAutoScroll(): void;
/** Whether auto-scroll is currently active (for tests). */
export declare function isAutoScrollActive(): boolean;
/** Add an element to the exclusion set (autoScroll: false). */
export declare function addScrollExclusion(el: HTMLElement): void;
/** Remove an element from the exclusion set. */
export declare function removeScrollExclusion(el: HTMLElement): void;
/** Exported for testing only. */
export declare const _testing: {
  calcScrollSpeed: typeof calcScrollSpeed;
  isScrollable: typeof isScrollable;
  getScrollableAncestors: typeof getScrollableAncestors;
  addExclusion: typeof addScrollExclusion;
  removeExclusion: typeof removeScrollExclusion;
  readonly hasPointerPosition: boolean;
  readonly lastClientY: number;
  readonly lastClientX: number;
  /** Simulate a pointer position without going through DOM events. */
  setPointerPosition(x: number, y: number): void;
};
export {};
