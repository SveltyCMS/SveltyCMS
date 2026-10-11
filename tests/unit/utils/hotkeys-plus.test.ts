/**
 * @file tests/unit/utils/hotkeys-plus.test.ts
 * @vitest-environment jsdom
 * @description Shifted keys such as "+" still match a "+" shortcut.
 */

import { describe, expect, it } from "vitest";
import { registerHotkey } from "@utils/hotkeys";

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

describe("hotkey shifted keys", () => {
  it("matches + when Shift is held and ignores other keys", () => {
    let fired = 0;
    const stop = registerHotkey(
      "+",
      () => {
        fired += 1;
      },
      "Zoom in",
    );
    try {
      press("f");
      press("+", { shiftKey: true });
      press("+");
      expect(fired).toBe(2);
    } finally {
      stop();
    }
  });

  it("does not treat a plain letter as shifted", () => {
    let fired = 0;
    const stop = registerHotkey(
      "f",
      () => {
        fired += 1;
      },
      "Free crop",
    );
    try {
      press("F", { shiftKey: true });
      press("f");
      expect(fired).toBe(1);
    } finally {
      stop();
    }
  });

  it("fires the Escape key whether the combo is written 'escape' or 'esc'", () => {
    let writtenEscape = 0;
    let writtenEsc = 0;
    // Both spellings normalize to "esc" — same stack, so LIFO decides the winner.
    const stopEscape = registerHotkey("escape", () => (writtenEscape += 1), "Close editor");
    const stopEsc = registerHotkey("esc", () => (writtenEsc += 1), "Close (alt)");
    try {
      press("Escape");
      expect(writtenEsc).toBe(1);
      expect(writtenEscape).toBe(0);
      stopEsc();
      press("Escape");
      expect(writtenEscape).toBe(1);
    } finally {
      stopEscape();
      stopEsc();
    }
  });
});
