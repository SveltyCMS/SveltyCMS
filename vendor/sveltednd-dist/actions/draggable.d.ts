/**
 * Draggable action - Makes any element draggable.
 *
 * This action implements a dual-mode drag system:
 * 1. **HTML5 Drag API**: Native browser drag-and-drop (desktop, high fidelity)
 * 2. **Pointer Events**: Custom implementation for broader device support
 *
 * The action automatically detects which mode to use based on the event type,
 * providing a seamless experience across desktop and touch devices.
 *
 * @example
 * ```svelte
 * <div
 *   use:draggable={{
 *     dragData: task,
 *     container: 'todo-list',
 *     handle: '.drag-handle',
 *     callbacks: {
 *       onDragStart: (state) => console.log('Started dragging:', state.draggedItem)
 *     }
 *   }}
 * >
 *   <span class="drag-handle">⋮⋮</span>
 *   <span>{task.title}</span>
 * </div>
 * ```
 *
 * @module draggable
 */
import type { DraggableOptions } from "../types/index.js";
/**
 * Svelte action that makes an element draggable.
 *
 * @typeParam T - The type of data being dragged
 * @param node - The DOM element to make draggable
 * @param options - Configuration for the drag behavior
 * @returns Svelte action lifecycle object with update and destroy
 */
export declare function draggable<T>(
  node: HTMLElement,
  options: DraggableOptions<T>,
): {
  /**
   * Called when options change - updates the draggable state.
   *
   * @param newOptions - Updated configuration
   */
  update(newOptions: DraggableOptions<T>): void;
  /**
   * Cleanup when the component is destroyed or the action is removed.
   *
   * Removes all event listeners and cleans up any dangling document-level
   * listeners (in case the component unmounts mid-drag).
   */
  destroy(): void;
};
