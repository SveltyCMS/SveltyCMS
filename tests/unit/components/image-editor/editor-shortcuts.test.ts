/**
 * @file tests/unit/components/image-editor/editor-shortcuts.test.ts
 * @vitest-environment jsdom
 * @description Editor shortcut precedence: the active tool wins, then the key is released.
 */

import { bindShortcuts } from "@components/image-editor/bind-shortcuts";
import { registerHotkey } from "@utils/hotkeys";
import { describe, expect, it } from "vitest";

const modKey = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? "meta" : "ctrl";

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

function withMod(key: string) {
  press(key, modKey === "meta" ? { metaKey: true } : { ctrlKey: true });
}

describe("image editor shortcuts", () => {
  it("lets the active tool win [ and gives it back when the tool closes", () => {
    let winner = "";
    const releaseGlobal = bindShortcuts([["[", () => (winner = "compare"), "nudge compare"]]);
    const releaseBlur = bindShortcuts([["[", () => (winner = "blur"), "blur strength"]]);
    try {
      press("[");
      expect(winner).toBe("blur");
      releaseBlur();
      press("[");
      expect(winner).toBe("compare");
    } finally {
      releaseBlur();
      releaseGlobal();
    }
  });

  it("keeps Mod+0 and a bare 0 on different actions", () => {
    let fit = 0;
    let angle = 0;
    const stopFit = registerHotkey("mod+0", () => (fit += 1), "Fit image");
    const stopAngle = registerHotkey("0", () => (angle += 1), "Reset rotation");
    try {
      press("0");
      expect(angle).toBe(1);
      expect(fit).toBe(0);
      withMod("0");
      expect(fit).toBe(1);
      expect(angle).toBe(1);
    } finally {
      stopFit();
      stopAngle();
    }
  });

  it("treats Backspace as Delete and leaves a plain letter alone", () => {
    let removed = 0;
    const stop = registerHotkey(
      "delete",
      () => {
        removed += 1;
      },
      "Delete selection",
      false,
    );
    try {
      press("Backspace");
      press("Delete");
      press("f");
      expect(removed).toBe(2);
    } finally {
      stop();
    }
  });

  it("fires the editor's Escape close key", () => {
    // image-editor-modal.svelte registers `registerHotkey('escape', …)`; the
    // engine maps KeyboardEvent.key "Escape" to "esc", so the combo must
    // normalize to the same token or the close key is dead.
    let closed = 0;
    const stop = registerHotkey("escape", () => (closed += 1), "Close editor");
    try {
      press("Escape");
      expect(closed).toBe(1);
      press("e");
      expect(closed).toBe(1);
    } finally {
      stop();
    }
  });

  it("lets the editor stop the Escape event so a parent modal cannot also close", () => {
    // The image editor lives inside a native <dialog> Modal whose useDialog keydown
    // also closes on Escape. The editor's handler stops propagation so a cancelled
    // discard confirm cannot be overridden by the parent modal closing anyway.
    let handled = false;
    let parentSawIt = false;
    const parentListener = () => {
      parentSawIt = true;
    };
    const stop = registerHotkey(
      "escape",
      (event) => {
        event.stopPropagation();
        handled = true;
      },
      "Close editor",
    );
    const child = document.createElement("div");
    document.body.appendChild(child);
    // Bubble-phase listener on an ancestor stands in for the parent <dialog>.
    document.body.addEventListener("keydown", parentListener);
    try {
      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      child.dispatchEvent(event);
      expect(handled).toBe(true);
      // stopPropagation in the window-capture handler means the ancestor (and so
      // the parent modal) must not receive the event.
      expect(parentSawIt).toBe(false);
      expect(event.defaultPrevented).toBe(true);
    } finally {
      document.body.removeEventListener("keydown", parentListener);
      child.remove();
      stop();
    }
  });
});
