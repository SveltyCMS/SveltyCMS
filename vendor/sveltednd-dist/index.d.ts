/**
 * @thisux/sveltednd - Lightweight drag and drop for Svelte 5
 *
 * A modern, TypeScript-first drag and drop library built on Svelte 5 runes.
 * Supports both HTML5 drag-and-drop API and custom pointer events for
 * maximum compatibility across desktop and mobile.
 *
 * @example
 * ```svelte
 * <script>
 *   import { draggable, droppable } from '@thisux/sveltednd';
 *
 *   let items = ['Item 1', 'Item 2', 'Item 3'];
 *
 *   function handleDrop(state) {
 *     // Rearrange items based on state.draggedItem and state.dropPosition
 *   }
 * </script>
 *
 * {#each items as item (item)}
 *   <div
 *     use:draggable={{ dragData: item, container: 'my-list' }}
 *     use:droppable={{ container: 'my-list', callbacks: { onDrop: handleDrop } }}
 *   >
 *     {item}
 *   </div>
 * {/each}
 * ```
 *
 * @packageDocumentation
 */
export { draggable, droppable } from "./actions/index.js";
export { attachDraggable, attachDroppable } from "./attachments/index.js";
export { dndState, resetDndState } from "./stores/dnd.svelte.js";
export type {
  DragDropState,
  DragDropCallbacks,
  DragDropAttributes,
  DragDropOptions,
  DraggableOptions,
  DragInputMode,
  KeyboardOptions,
  KeyboardAnnouncementContext,
} from "./types/index.js";
// styles injected at runtime
