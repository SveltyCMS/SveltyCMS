/**
 * Core type definitions for @thisux/sveltednd
 *
 * These interfaces define the contract between draggable elements and drop zones.
 * All types are generic over `T` - your data type - so you get full type safety
 * throughout the drag and drop lifecycle.
 *
 * @example
 * ```typescript
 * interface Task {
 *   id: string;
 *   title: string;
 * }
 *
 * const options: DraggableOptions<Task> = {
 *   dragData: task,
 *   container: 'todo-list',
 *   callbacks: {
 *     onDrop: (state) => {
 *       // state.draggedItem is fully typed as Task
 *       console.log(state.draggedItem.title);
 *     }
 *   }
 * };
 * ```
 */
export {};
