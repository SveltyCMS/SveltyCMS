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

/** Precompiled combo — parsed once at registration, compared per event. */
interface ParsedCombo {
  combo: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Canonical lowercase key token ("" = no key constraint). */
  key: string;
  /** Physical `KeyboardEvent.code` alias for layout/AltGr differences. */
  codeAlias: string | null;
  /** `Delete` also accepts `Backspace` unless Shift is held. */
  deleteAlias: boolean;
  shiftOptional: boolean;
}

interface HotkeyBucket {
  descriptor: ParsedCombo;
  stack: HotkeyRegistration[];
}

// 🚀 Stack-based storage — supports modals overriding page hotkeys
const hotkeys = new Map<string, HotkeyBucket>();

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

const MODIFIER_TOKENS = new Set(["meta", "ctrl", "alt", "shift", "cmd", "option"]);

const ASCII_UPPER_A = 65;
const ASCII_UPPER_Z = 90;
const ASCII_CASE_OFFSET = 32;

/** Allocation-free ASCII case-insensitive compare (combo keys are lowercase). */
function equalsIgnoreCase(raw: string, lower: string): boolean {
  if (raw.length !== lower.length) return false;
  for (let i = 0; i < raw.length; i++) {
    let c = raw.charCodeAt(i);
    if (c >= ASCII_UPPER_A && c <= ASCII_UPPER_Z) c += ASCII_CASE_OFFSET;
    if (c !== lower.charCodeAt(i)) return false;
  }
  return true;
}

/** Parse a normalized combo string once (called from `registerHotkey`). */
function parseCombo(combo: string): ParsedCombo {
  // "+" is both the separator and a key (`Shift+=` on a US keyboard). A lone "+"
  // or a combo that ends in "++" (`ctrl++`) means the key itself is plus.
  const plusIsKey = combo === "+" || combo.endsWith("++");
  const parts = (plusIsKey ? combo.slice(0, -1) : combo)
    .split("+")
    .filter((part) => part.length > 0);
  const key = plusIsKey ? "+" : parts.find((part) => !MODIFIER_TOKENS.has(part)) || "";
  const shift = parts.includes("shift");

  return {
    combo,
    meta: parts.includes("meta") || parts.includes("cmd"),
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt") || parts.includes("option"),
    shift,
    key,
    codeAlias: /^[a-z]$/.test(key)
      ? `Key${key.toUpperCase()}`
      : /^[0-9]$/.test(key)
        ? `Digit${key}`
        : null,
    deleteAlias: key === "delete",
    // `+` and `_` are shifted keys on a US layout (`Shift+=`, `Shift+-`).
    shiftOptional: !shift && (key === "+" || key === "_" || key === "?"),
  };
}

/** Key match with zero per-event allocation. `KeyboardEvent.key` is compared first. */
function keyMatches(e: KeyboardEvent, d: ParsedCombo): boolean {
  const raw = e.key;
  if (typeof raw !== "string") return false;
  // Canonical tokens whose raw `event.key` value differs (`" "`, `"Escape"`).
  if (d.key === "space") return raw === " ";
  if (d.key === "esc") return raw === "Escape" || raw === "Esc";
  if (d.deleteAlias && raw === "Backspace" && !d.shift) return true;
  if (equalsIgnoreCase(raw, d.key)) return true;
  // Physical-code fallback: layouts (and Windows Alt handling) can report a
  // different `key` while `code` stays physical.
  return d.codeAlias !== null && e.code === d.codeAlias;
}

function eventMatches(e: KeyboardEvent, d: ParsedCombo): boolean {
  // Compare the key first — it rejects almost every combo before the modifier
  // checks run.
  if (d.key && !keyMatches(e, d)) return false;
  return (
    e.metaKey === d.meta &&
    e.ctrlKey === d.ctrl &&
    e.altKey === d.alt &&
    (d.shiftOptional || e.shiftKey === d.shift)
  );
}

function globalKeydownHandler(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const tag = target.tagName;
  const isInputTarget =
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;

  for (const bucket of hotkeys.values()) {
    if (eventMatches(e, bucket.descriptor)) {
      // LIFO: most recently registered handler wins
      const action = bucket.stack[bucket.stack.length - 1];
      if (!action) continue;

      if (isInputTarget && !action.enableInInputs) {
        return;
      }

      if (action.preventDefault !== false) e.preventDefault();

      try {
        action.handler(e);
      } catch (err) {
        logger.error(
          `[Hotkeys] Error executing handler for combo: ${bucket.descriptor.combo}`,
          err,
        );
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
  const descriptor = parseCombo(norm);
  const id = generateUUID();

  const opts: HotkeyOptions =
    typeof options === "string"
      ? { description: options, preventDefault: deprecatedPreventDefault ?? true }
      : { preventDefault: true, enableInInputs: false, ...options };

  const registration: HotkeyRegistration = { id, handler, ...opts };

  let bucket = hotkeys.get(norm);
  if (!bucket) {
    bucket = { descriptor, stack: [] };
    hotkeys.set(norm, bucket);
  }
  bucket.stack.push(registration);
  ensureGlobalListener();

  const unregister = () => {
    const current = hotkeys.get(norm);
    if (!current) return;

    current.stack = current.stack.filter((r) => r.id !== id);
    if (current.stack.length === 0) {
      hotkeys.delete(norm);
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
