/**
 * @file src/utils/save-shortcut.ts
 * @description Ctrl/Cmd+S in the entry editor.
 *
 * The editor had no keybinding, so the browser's own "Save page" dialog opened
 * instead of the entry being saved. The decision (which key level fires, the
 * in-flight latch, the modal gate) lives here so it can be tested without a
 * DOM; `attachSaveShortcut` is the thin DOM adapter around it.
 *
 * ### Features:
 * - isSaveShortcut: ctrl/meta + S, no alt/shift, not composing, not a repeat
 * - shouldRunSaveShortcut: editor mode only, no open modal, no save in flight
 * - attachSaveShortcut: one window listener, preventDefault, in-flight latch so
 *   a held key cannot produce a second request
 */

/** Modes in which the editor entry exists and a save is meaningful. */
const SAVE_SHORTCUT_MODES: readonly string[] = ["edit", "create"];

export interface SaveShortcutEvent {
  altKey?: boolean;
  ctrlKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  key: string;
  metaKey?: boolean;
  repeat?: boolean;
  shiftKey?: boolean;
}

export interface SaveShortcutContext {
  /** Collection permissions: `false` disables the Save button, so it disables the key too. */
  canWrite?: boolean;
  /** Current editor mode (`edit` | `create` | `view` | …). */
  mode?: string | null;
  /** True while any modal/dialog owns the screen. */
  modalOpen?: boolean;
  /** True while a save is already running. */
  saving?: boolean;
}

/**
 * The key combination itself: Ctrl+S on Windows/Linux, Cmd+S on macOS.
 * Shift is excluded on purpose (Ctrl+Shift+S is the browser's "Save page as"),
 * as are auto-repeats and IME composition.
 */
export function isSaveShortcut(event: SaveShortcutEvent | null | undefined): boolean {
  if (!event) return false;
  if (event.defaultPrevented === true) return false;
  if (event.altKey === true || event.shiftKey === true) return false;
  if (event.ctrlKey !== true && event.metaKey !== true) return false;
  if (event.repeat === true || event.isComposing === true) return false;
  return String(event.key ?? "").toLowerCase() === "s";
}

/**
 * Whether the shortcut must run the save. Guards, in order: the key itself, an
 * open modal (the dialog's own keys win), a save already in flight (one
 * request per press), the write permission, and the editor mode.
 */
export function shouldRunSaveShortcut(
  event: SaveShortcutEvent | null | undefined,
  context: SaveShortcutContext,
): boolean {
  if (!isSaveShortcut(event)) return false;
  if (context.modalOpen === true || context.saving === true) return false;
  if (context.canWrite === false) return false;
  return SAVE_SHORTCUT_MODES.includes(String(context.mode ?? ""));
}

export interface AttachSaveShortcutOptions {
  /** Reads the live editor state at keypress time (never captured up front). */
  getContext: () => SaveShortcutContext;
  /** The component's own save function — the one its Save button calls. */
  runSave: () => unknown;
  /** Test seam; defaults to the global window when it exists. */
  target?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
}

/**
 * Binds the shortcut to the window and returns the detach function. Also
 * prevents the browser default (its "Save page" dialog) on every press that the
 * shortcut claims — including one it declines while a save is running, so the
 * dialog cannot appear mid-save.
 */
export function attachSaveShortcut(options: AttachSaveShortcutOptions): () => void {
  const target =
    options.target ?? (typeof window === "undefined" ? null : (window as unknown as Window));
  if (!target) return () => {};

  let inFlight = false;

  const onKeydown = (event: SaveShortcutEvent & { preventDefault?: () => void }) => {
    if (!isSaveShortcut(event)) return;
    const context = options.getContext();
    const claimed = shouldRunSaveShortcut(event, {
      ...context,
      saving: context.saving === true || inFlight,
    });
    // Claim the combination either way: the browser's Save-page dialog must not
    // open while the editor owns Ctrl/Cmd+S.
    event.preventDefault?.();
    if (!claimed) return;

    inFlight = true;
    try {
      void Promise.resolve(options.runSave()).finally(() => {
        inFlight = false;
      });
    } catch {
      inFlight = false;
    }
  };

  target.addEventListener("keydown", onKeydown as unknown as EventListener);
  return () => target.removeEventListener("keydown", onKeydown as unknown as EventListener);
}
