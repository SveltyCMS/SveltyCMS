/**
 * @file src/components/image-editor/bind-shortcuts.ts
 * @description Register a group of editor shortcuts and remove them together.
 *
 * Tool components call this only while that tool is active. The hotkey stack
 * is LIFO, so the active tool wins over the modal's global keys.
 */

import { registerHotkey, type HotkeyOptions } from "@utils/hotkeys";

export type ShortcutEntry = [
  combo: string,
  handler: (event: KeyboardEvent) => void,
  description: string,
  preventDefault?: boolean,
];

export function bindShortcuts(
  entries: readonly ShortcutEntry[],
  options?: HotkeyOptions,
): () => void {
  const stops = entries.map(([combo, handler, description, preventDefault]) =>
    registerHotkey(combo, handler, {
      description,
      preventDefault: preventDefault ?? true,
      ...options,
    }),
  );
  return () => {
    for (const stop of stops) stop();
  };
}
