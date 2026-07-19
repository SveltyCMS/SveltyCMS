/**
 * Type declarations for @thisux/sveltednd v0.4.1
 * Based on the actual shipped npm package (not the GitHub README which documents v0.7.0+)
 */
declare module "@thisux/sveltednd" {
  /**
   * Represents the current state of a drag and drop operation.
   */
  export interface DragDropState<T = unknown> {
    /** True while the user is actively dragging */
    isDragging: boolean;
    /** The data payload being dragged */
    item: T | null;
    /** The container identifier where the drag originated */
    container: string;
    /** The container currently being hovered over (null if not over any drop zone) */
    targetContainer: string | null;
    /** The index where the item would be placed if dropped now */
    targetIndex: number;
    /** Where the item would drop relative to the target element */
    dropPosition: "before" | "after" | "inside" | null;
  }

  /**
   * Configuration options for draggable elements.
   */
  		export interface DraggableOptions<T = unknown> {
  			container: string;
  			dragData: T;
  			disabled?: boolean;
  			handle?: string;
  			interactive?: boolean;
  			keyboard?: boolean;
  			onDragStart?: (state: DragDropState<T>) => void;
  			onDragEnd?: (state: DragDropState<T>) => void;
  		}

  		/**
  		 * Configuration options for droppable elements.
  		 */
  		export interface DroppableOptions<T = unknown> {
  			container: string;
  			direction?: "vertical" | "horizontal" | "grid";
  			onDrop?: (state: DragDropState<T>) => void;
  			onDragEnter?: (state: DragDropState<T>) => void;
  			onDragLeave?: (state: DragDropState<T>) => void;
  			onDragOver?: (state: DragDropState<T>) => void;
  			keyboard?: boolean;
  			attributes?: {
  				draggingClass?: string;
  				dragOverClass?: string;
  				dropBeforeClass?: string;
  				dropAfterClass?: string;
  			};
  		}

  /**
   * Svelte action for making elements draggable.
   */
  export function draggable<T = unknown>(
    node: HTMLElement,
    options?: DraggableOptions<T>,
  ): { destroy?: () => void };

  /**
   * Svelte action for making elements droppable.
   */
  export function droppable<T = unknown>(
    node: HTMLElement,
    options?: DroppableOptions<T>,
  ): { destroy?: () => void };

  /**
   * Global drag-and-drop state store.
   */
  export const dndState: import("svelte/store").Readable<DragDropState>;
}
