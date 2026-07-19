/**
 * Droppable action - Makes any element accept drops from draggable items.
 *
 * This action works in tandem with the draggable action to provide drop zones.
 * It handles both HTML5 drag events and custom pointer events, maintaining
 * consistent state across both interaction modes.
 *
 * Key features:
 * - Drop position indicators (line before/after items for sorting)
 * - Drag enter/leave tracking with counter (handles nested elements)
 * - Support for multiple containers with the same identifier
 *
 * @example
 * ```svelte
 * <ul
 *   use:droppable={{
 *     container: 'task-list',
 *     callbacks: {
 *       onDrop: (state) => {
 *         // Move item from state.sourceContainer to this container
 *         // at position state.dropPosition ('before' or 'after' the target)
 *       }
 *     }
 *   }}
 * >
 *   {#each tasks as task}
 *     <li use:draggable={{ dragData: task, container: 'task-list' }}>
 *       {task.title}
 *     </li>
 *   {/each}
 * </ul>
 * ```
 *
 * @module droppable
 */
import type { DragDropOptions } from "../types/index.js";
/**
 * Svelte action that makes an element accept drops.
 *
 * @typeParam T - The type of data being dropped
 * @param node - The DOM element to make a drop zone
 * @param options - Configuration for drop behavior
 * @returns Svelte action lifecycle object with update and destroy
 */
export declare function droppable<T>(
  node: HTMLElement,
  options: DragDropOptions<T>,
): {
  /**
   * Called when options change - updates the droppable configuration.
   *
   * @param newOptions - Updated configuration
   */
  update(newOptions: DragDropOptions<T>): void;
  /**
   * Cleanup when the component is destroyed or the action is removed.
   *
   * Removes all event listeners and clears any visual indicators.
   */
  destroy(): void;
};
