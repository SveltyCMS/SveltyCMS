/**
 * @file src/utils/hotkeys.ts
 * @description Lightweight, dependency-free, cross-platform keyboard shortcuts manager.
 *
 * ### Hardening (audit 2026-07):
 * - Stack-based LIFO priority: modals can override page hotkeys without destroying them
 * - Strict modifier matching: prevents accidental triggers (e.g., Ctrl+Shift+S firing Ctrl+S)
 * - Svelte context crash protection: try/catch onDestroy for vanilla JS callers
 * - `enableInInputs` option: allows specific hotkeys through the input-blocker
 * - `navigator.userAgent` fallback: navigator.platform is deprecated
 */

import { onDestroy } from "svelte";
import { logger } from "./logger";
import { generateUUID } from "@utils/native-utils";

export type KeyCombo = string;

export interface HotkeyOptions {
  description?: string;
  /** If true, calls e.preventDefault() (default: true) */
  preventDefault?: boolean;
  /** If true, allows the hotkey to trigger even while typing in inputs (default: false) */
  enableInInputs?: boolean;
}

interface HotkeyRegistration extends HotkeyOptions {
  id: string;
  handler: (e: KeyboardEvent) => void;
}

// 🚀 Stack-based storage — supports modals overriding page hotkeys
const hotkeys = new Map<string, HotkeyRegistration[]>();

const isMac =
  typeof navigator !== "undefined"
    ? /Mac|iPod|iPhone|iPad/.test(navigator.userAgent || (navigator as any).platform)
    : false;

const MOD = isMac ? "meta" : "ctrl";

function normalizeCombo(combo: string): string {
  return (
    combo
      .toLowerCase()
      .replace(/\bmod\b/g, MOD)
      // `KeyboardEvent.key` is "Escape" and `eventMatches` aliases it to "esc", so
      // the combo must resolve to the same token or an `escape` shortcut (the
      // editor's close key) never fires.
      .replace(/\bescape\b/g, "esc")
      .replace(/\s*\+\s*/g, "+")
      .trim()
  );
}

function eventMatches(e: KeyboardEvent, combo: string): boolean {
  // "+" is both the separator and a key (`Shift+=` on a US keyboard). A lone "+"
  // or a combo that ends in "++" (`ctrl++`) means the key itself is plus.
  // "+".split("+") is ["", ""], which previously matched every unmodified key.
  const modifiers = new Set(["meta", "ctrl", "alt", "shift", "cmd", "option"]);
  const plusIsKey = combo === "+" || combo.endsWith("++");
  const parts = (plusIsKey ? combo.slice(0, -1) : combo)
    .split("+")
    .filter((part) => part.length > 0);
  const required = {
    meta: parts.includes("meta") || parts.includes("cmd"),
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt") || parts.includes("option"),
    shift: parts.includes("shift"),
    key: plusIsKey ? "+" : parts.find((part) => !modifiers.has(part)) || "",
  };

  let keyLower = e.key.toLowerCase();
  if (keyLower === " ") keyLower = "space";
  if (keyLower === "escape") keyLower = "esc";

  // Keyboard layouts (and Windows Alt handling) can report a different `key`
  // while `code` stays physical — match the physical key too.
  const codeAlias =
    /^[a-z]$/.test(required.key) || /^[0-9]$/.test(required.key)
      ? e.code ===
        (/^[a-z]$/.test(required.key) ? `Key${required.key.toUpperCase()}` : `Digit${required.key}`)
      : false;

  const isDeleteAlias =
    required.key === "delete" &&
    (keyLower === "delete" || (keyLower === "backspace" && !required.shift));

  // `+` and `_` are shifted keys on a US layout (`Shift+=`, `Shift+-`).
  // A combo written as "+" still matches when Shift is held.
  const shiftOptional =
    !required.shift && (required.key === "+" || required.key === "_" || required.key === "?");

  return (
    e.metaKey === required.meta &&
    e.ctrlKey === required.ctrl &&
    e.altKey === required.alt &&
    (shiftOptional || e.shiftKey === required.shift) &&
    (required.key === "" || keyLower === required.key || codeAlias || isDeleteAlias)
  );
}

function globalKeydownHandler(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const tag = target.tagName;
  const isInputTarget =
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;

  for (const [combo, stack] of hotkeys.entries()) {
    if (eventMatches(e, combo)) {
      // LIFO: most recently registered handler wins
      const action = stack[stack.length - 1];
      if (!action) continue;

      if (isInputTarget && !action.enableInInputs) {
        return;
      }

      if (action.preventDefault !== false) e.preventDefault();

      try {
        action.handler(e);
      } catch (err) {
        logger.error(`[Hotkeys] Error executing handler for combo: ${combo}`, err);
      }

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
  handler: (e: KeyboardEvent) => void,
  options: HotkeyOptions | string = {},
  deprecatedPreventDefault?: boolean,
): () => void {
  const norm = normalizeCombo(combo);
  const id = generateUUID();

  const opts: HotkeyOptions =
    typeof options === "string"
      ? { description: options, preventDefault: deprecatedPreventDefault ?? true }
      : { preventDefault: true, enableInInputs: false, ...options };

  const registration: HotkeyRegistration = { id, handler, ...opts };

  if (!hotkeys.has(norm)) {
    hotkeys.set(norm, []);
  }
  hotkeys.get(norm)!.push(registration);
  ensureGlobalListener();

  const unregister = () => {
    const stack = hotkeys.get(norm);
    if (!stack) return;

    const filtered = stack.filter((r) => r.id !== id);
    if (filtered.length === 0) {
      hotkeys.delete(norm);
    } else {
      hotkeys.set(norm, filtered);
    }

    if (hotkeys.size === 0 && listenerActive && typeof window !== "undefined") {
      window.removeEventListener("keydown", globalKeydownHandler, { capture: true });
      listenerActive = false;
    }
  };

  // Auto-cleanup in Svelte components; silent no-op in vanilla JS
  try {
    onDestroy(unregister);
  } catch {
    // Component context inactive — caller must call unregister() manually
  }

  return unregister;
}
