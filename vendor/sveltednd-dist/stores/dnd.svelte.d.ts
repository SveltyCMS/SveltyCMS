/**
 * Global drag and drop state management using Svelte 5 runes.
 *
 * We use a global $state object rather than a store because:
 * 1. Only one drag operation happens at a time in the browser
 * 2. Droppables need to read the current drag state without prop drilling
 * 3. $state provides fine-grained reactivity with less boilerplate than stores
 *
 * This state is reactive - components accessing these properties will
 * re-render when they change during the drag lifecycle.
 */
import type { DragDropState } from "../types/index.js";
/**
 * Global reactive state for the current drag operation.
 *
 * @example
 * ```svelte
 * <script>
 *   import { dndState } from '@thisux/sveltednd';
 * </script>
 *
 * {#if dndState.isDragging}
 *   <div class="drop-hint">
 *     Dragging {dndState.draggedItem?.title} from {dndState.sourceContainer}
 *   </div>
 * {/if}
 * ```
 */
export declare const dndState: DragDropState<unknown>;
/**
 * Resets all transient drag state to idle.
 *
 * Idempotent — safe to call from multiple end paths (drop, dragend, pointerup,
 * destroy). Critical when `onDrop` removes the dragged node from the DOM:
 * the browser may never fire `dragend`, so droppables must also reset (#60).
 */
export declare function resetDndState(): void;
