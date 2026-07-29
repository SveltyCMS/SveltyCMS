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
  return combo
    .toLowerCase()
    .replace(/\bmod\b/g, MOD)
    .replace(/\s*\+\s*/g, "+")
    .trim();
}

function eventMatches(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+");
  const required = {
    meta: parts.includes("meta") || parts.includes("cmd"),
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt") || parts.includes("option"),
    shift: parts.includes("shift"),
    key: parts.find((p) => !["meta", "ctrl", "alt", "shift", "cmd", "option"].includes(p)) || "",
  };

  let keyLower = e.key.toLowerCase();
  if (keyLower === " ") keyLower = "space";
  if (keyLower === "escape") keyLower = "esc";

  const isDeleteAlias =
    required.key === "delete" &&
    (keyLower === "delete" || (keyLower === "backspace" && !required.shift));

  return (
    e.metaKey === required.meta &&
    e.ctrlKey === required.ctrl &&
    e.altKey === required.alt &&
    e.shiftKey === required.shift &&
    (required.key === "" || keyLower === required.key || isDeleteAlias)
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
  const id = crypto.randomUUID();

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

export function getRegisteredHotkeys() {
  return Array.from(hotkeys.entries()).map(([combo, stack]) => {
    const active = stack[stack.length - 1];
    return {
      combo: combo.replace(new RegExp(MOD, "gi"), "Mod").replace(/\+/g, " + "),
      description: active?.description,
    };
  });
}
