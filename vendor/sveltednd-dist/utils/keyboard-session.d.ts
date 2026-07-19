/**
 * Keyboard drag session — grab / arrow-move / drop / cancel (#24).
 *
 * Shares dndState and droppable commitDrop with pointer/HTML5 paths.
 * Opt-in only (started from draggable when keyboard: true).
 *
 * @module keyboard-session
 */
import type { DragDropState, KeyboardOptions } from "../types/index.js";
import { type DroppableDirection, type DroppableRegistration } from "./dnd-registry.js";
export interface KeyboardSessionConfig {
  sourceElement: HTMLElement;
  sourceContainer: string;
  dragData: unknown;
  draggingClass: string[];
  direction: DroppableDirection;
  keyboard: KeyboardOptions;
  itemLabel: string;
  onDragStart?: (state: DragDropState) => void;
  onDragEnd?: (state: DragDropState) => void;
}
interface Session {
  config: KeyboardSessionConfig;
  targets: DroppableRegistration[];
  targetIndex: number;
  documentKeyHandler: (event: KeyboardEvent) => void;
}
export declare function isKeyboardSessionActive(): boolean;
/**
 * Starts a keyboard drag session from a focused draggable.
 * No-ops if a session is already active.
 */
export declare function startKeyboardSession(config: KeyboardSessionConfig): void;
/**
 * Cancel any active keyboard session (e.g. draggable destroy).
 */
export declare function cancelKeyboardSession(): void;
/** Testing helpers */
export declare const _testing: {
  getSession: () => Session | null;
  reset(): void;
};
export {};
