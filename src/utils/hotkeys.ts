/**
 * @file src/utils/hotkeys.ts
 * @module hotkeys
 * @description Lightweight, dependency-free, cross-platform keyboard shortcuts manager
 * for SveltyCMS. Inspired by TanStack Hotkeys / @github/hotkey, but Svelte-native.
 *
 * Features:
 * - Mod key normalization: 'mod' → Ctrl (Win/Linux) / ⌘ Meta (macOS)
 * - Ignores inputs, textareas, contenteditable areas (no accidental triggers while typing)
 * - SSR-safe (no window access during SSR)
 * - Auto-cleanup via onDestroy when registered in components
 * - Global registration possible (e.g. in +layout.svelte)
 * - Accessibility: use with aria-keyshortcuts="Mod+S" on buttons
 * - Optional: preventDefault (default: true)
 *
 * Philosophy:
 * - Zero external dependencies
 * - Intuitive defaults matching common desktop/web apps
 *   Save     → Mod + S     (universal)
 *   Delete   → Delete / Backspace (Win) | Mod + Backspace (Mac)
 *   Cancel   → Escape      (universal modal/close)
 *   Search   → Mod + K / Alt + S (common in modern apps)
 *   Confirm  → Mod + Enter (force submit in some contexts)
 *
 * Usage:
 *   import { registerHotkey } from '$utils/hotkeys';
 *
 *   // Global (in +layout.svelte)
 *   registerHotkey('mod+s', handleSave, 'Save changes');
 *
 *   // Contextual (in component with selections)
 *   registerHotkey('delete', bulkDelete, 'Delete selected', true);
 *
 * Future extensions (planned):
 *   - Priority / scope (modal > global)
 *   - Sequence support (e.g. gg, jj)
 *   - Cheatsheet modal (? or mod+/)
 *   - Conflict detection / logging
 */
import { onDestroy } from "svelte";

type KeyCombo = string; // e.g. 'mod+s', 'delete', 'escape'
type HotkeyAction = {
  handler: () => void;
  description?: string;
  preventDefault?: boolean;
};

const hotkeys = new Map<string, HotkeyAction>();

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const MOD = isMac ? "meta" : "ctrl";

function normalizeCombo(combo: string): string {
  return combo
    .toLowerCase()
    .replace(/\bmod\b/g, MOD)
    .replace(/\s+/g, "+");
}

function eventMatches(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+");
  const required = {
    meta: parts.includes("meta"),
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    key: parts.find((p) => !["meta", "ctrl", "alt", "shift"].includes(p)) || "",
  };

  // Special handling for Delete / Backspace
  const keyLower = e.key.toLowerCase();
  const isDelete = keyLower === "delete" || (e.key === "Backspace" && !required.shift);

  return (
    (!required.meta || e.metaKey) &&
    (!required.ctrl || e.ctrlKey) &&
    (!required.alt || e.altKey) &&
    (!required.shift || e.shiftKey) &&
    (required.key === "" || keyLower === required.key || (required.key === "delete" && isDelete))
  );
}

function globalKeydownHandler(e: KeyboardEvent) {
  // Skip if typing in input/textarea/select/contenteditable
  const target = e.target as HTMLElement;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
    return;
  }

  for (const [combo, action] of hotkeys.entries()) {
    if (eventMatches(e, combo)) {
      if (action.preventDefault !== false) e.preventDefault();
      action.handler();
      // First match wins (can add priority later)
      return;
    }
  }
}

let listenerActive = false;

function ensureGlobalListener() {
  if (listenerActive || typeof window === "undefined") return;
  window.addEventListener("keydown", globalKeydownHandler, { capture: true });
  listenerActive = true;
}

export function registerHotkey(
  combo: KeyCombo,
  handler: () => void,
  description?: string,
  preventDefault = true,
) {
  const norm = normalizeCombo(combo);
  hotkeys.set(norm, { handler, description, preventDefault });

  ensureGlobalListener();

  onDestroy(() => {
    hotkeys.delete(norm);
    if (hotkeys.size === 0 && listenerActive) {
      window.removeEventListener("keydown", globalKeydownHandler, {
        capture: true,
      });
      listenerActive = false;
    }
  });
}

// Optional: for cheatsheet / help menu
export function getRegisteredHotkeys() {
  return Array.from(hotkeys.entries()).map(([combo, { description }]) => ({
    combo: combo.replace(new RegExp(MOD, "gi"), "Mod").replace(/\+/g, " + "),
    description,
  }));
}
