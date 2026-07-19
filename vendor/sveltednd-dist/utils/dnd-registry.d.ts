/**
 * Registry of active droppable zones for keyboard navigation (#24).
 *
 * Droppables register on mount and unregister on destroy. Keyboard sessions
 * query this list (sorted by geometry) instead of inventing list indexes.
 *
 * @module dnd-registry
 */
import type { DragDropState } from "../types/index.js";
export type DroppableDirection = "vertical" | "horizontal" | "grid";
export interface DroppableRegistration {
  /** DOM node for this drop zone */
  element: HTMLElement;
  /** Container id (same as droppable options.container) */
  container: string;
  direction: DroppableDirection;
  disabled: boolean;
  /**
   * Apply or clear visual hover for keyboard preview.
   * position is used for drop indicators when hovering.
   */
  setKeyboardHover: (active: boolean, position?: "before" | "after" | null) => void;
  /**
   * Commit a drop using the same pipeline as pointer/HTML5.
   * Receives a snapshot of dndState at drop time.
   */
  commitDrop: (state: DragDropState) => void | Promise<void>;
}
export declare function registerDroppable(entry: DroppableRegistration): void;
export declare function unregisterDroppable(entry: DroppableRegistration): void;
export declare function getRegisteredDroppables(): DroppableRegistration[];
/**
 * Returns enabled droppables sorted along an axis for keyboard stepping.
 * Nested parents that fully contain a registered child are omitted so the
 * deepest zones win (same spirit as #27).
 */
export declare function listKeyboardTargets(
  direction?: DroppableDirection,
): DroppableRegistration[];
/**
 * Find the index of a registration that owns `element` or contains it.
 */
export declare function indexOfElement(
  targets: DroppableRegistration[],
  element: HTMLElement | null,
): number;
/** Clear keyboard hover on all registered droppables. */
export declare function clearAllKeyboardHovers(): void;
/** Testing helpers */
export declare const _testing: {
  clearAll(): void;
  size(): number;
};
