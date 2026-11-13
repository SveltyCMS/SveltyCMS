/**
 * @file src/services/token/token-target.ts
 * @description Svelte Action to register inputs with the Token System.
 *
 * ### Features:
 * - Registers the element + field metadata for the shared token picker
 * - `openOnFocus: false` keeps a plain focus from opening the picker (the field's
 *   own `{}` button becomes the only opener)
 */

import { activeInput } from "@src/stores/active-input-store.svelte";

/** Element whose next focus must not open the picker (see `closePicker`). */
let suppressedElement: HTMLElement | null = null;

/**
 * Suppress the next focus-triggered open for `node`.
 * The picker calls this before restoring focus to a field on Escape/insert.
 */
export function suppressTokenPickerOnFocus(node: HTMLElement | null): void {
  suppressedElement = node;
}

interface TokenTargetOptions {
  collection?: string;
  label?: string;
  name: string;
  /** Focus opens the picker. Set `false` when the field has a dedicated trigger. */
  openOnFocus?: boolean;
  onInsert?: (token: string) => void;
}

export function tokenTarget(node: HTMLElement, options: TokenTargetOptions) {
  function onFocus() {
    // A plain focus is not a request for the picker: fields that own a `{}`
    // button opt out so clicking into SEO Title/Description never pops a modal.
    if (options.openOnFocus === false) return;
    // Escape/insert hands focus back to the field — that programmatic re-focus
    // must not immediately re-open the picker it just closed.
    if (suppressedElement === node) {
      suppressedElement = null;
      return;
    }

    activeInput.set({
      element: node as unknown as HTMLInputElement | HTMLTextAreaElement,
      field: {
        name: options.name,
        label: options.label || options.name,
        collection: options.collection,
      },
      onInsert: options.onInsert,
    });
  }

  node.addEventListener("focus", onFocus);

  // Escape/insert may hand focus back to an element that already had it, which
  // fires no `focus` event — drop the stale suppression on blur instead of
  // swallowing the next real click into the field.
  function onBlur() {
    if (suppressedElement === node) suppressedElement = null;
  }
  node.addEventListener("blur", onBlur);

  return {
    update(newOptions: TokenTargetOptions) {
      options = newOptions;
    },
    destroy() {
      node.removeEventListener("focus", onFocus);
      node.removeEventListener("blur", onBlur);
      if (activeInput.current?.element === node) {
        activeInput.clear();
      }
    },
  };
}
