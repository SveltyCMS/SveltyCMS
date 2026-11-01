/**
 * @file tests/unit/utils/save-shortcut.test.ts
 * @description M6 — Ctrl/Cmd+S in the entry editor.
 *
 * Features:
 * - isSaveShortcut: ctrl or meta + S, and the combinations it must ignore
 * - shouldRunSaveShortcut: editor modes only, blocked by an open modal, an
 *   in-flight save and a missing write permission
 * - attachSaveShortcut: preventDefault on the claimed key, exactly one save per
 *   press (held key / repeat), and a working detach
 */
import { describe, expect, it, vi } from "vitest";
import { attachSaveShortcut, isSaveShortcut, shouldRunSaveShortcut } from "@utils/save-shortcut";

const key = (overrides: Record<string, unknown> = {}) => ({
  key: "s",
  ctrlKey: true,
  ...overrides,
});

describe("isSaveShortcut", () => {
  it("claims Ctrl+S and Cmd+S", () => {
    expect(isSaveShortcut(key())).toBe(true);
    expect(isSaveShortcut({ key: "s", metaKey: true })).toBe(true);
    // Shift changes the character but not the intent on some layouts.
    expect(isSaveShortcut(key({ key: "S" }))).toBe(true);
  });

  it("ignores plain keys, browser save-as and composed input", () => {
    expect(isSaveShortcut({ key: "s" })).toBe(false);
    expect(isSaveShortcut(key({ shiftKey: true }))).toBe(false);
    expect(isSaveShortcut(key({ altKey: true }))).toBe(false);
    expect(isSaveShortcut(key({ key: "d" }))).toBe(false);
    expect(isSaveShortcut(key({ repeat: true }))).toBe(false);
    expect(isSaveShortcut(key({ isComposing: true }))).toBe(false);
    expect(isSaveShortcut(key({ defaultPrevented: true }))).toBe(false);
    expect(isSaveShortcut(null)).toBe(false);
  });
});

describe("shouldRunSaveShortcut", () => {
  it("runs in edit and create, never in view", () => {
    expect(shouldRunSaveShortcut(key(), { mode: "edit" })).toBe(true);
    expect(shouldRunSaveShortcut(key(), { mode: "create" })).toBe(true);
    expect(shouldRunSaveShortcut(key(), { mode: "view" })).toBe(false);
    expect(shouldRunSaveShortcut(key(), { mode: null })).toBe(false);
  });

  it("never fires while a modal is open or a save is running", () => {
    expect(shouldRunSaveShortcut(key(), { mode: "edit", modalOpen: true })).toBe(false);
    expect(shouldRunSaveShortcut(key(), { mode: "edit", saving: true })).toBe(false);
    expect(shouldRunSaveShortcut(key(), { mode: "edit", canWrite: false })).toBe(false);
    expect(shouldRunSaveShortcut(key(), { mode: "edit", canWrite: true })).toBe(true);
  });
});

describe("attachSaveShortcut", () => {
  const fakeWindow = () => {
    const listeners: Array<(event: any) => void> = [];
    return {
      addEventListener: (_type: string, handler: (event: any) => void) => listeners.push(handler),
      removeEventListener: (_type: string, handler: (event: any) => void) => {
        const at = listeners.indexOf(handler);
        if (at >= 0) listeners.splice(at, 1);
      },
      press: (event: any) =>
        listeners.forEach((handler) => handler({ preventDefault: vi.fn(), ...event })),
      get count() {
        return listeners.length;
      },
    };
  };

  it("runs the save once and suppresses the browser dialog", () => {
    const target = fakeWindow();
    const save = vi.fn();
    attachSaveShortcut({
      target: target as never,
      getContext: () => ({ mode: "edit" }),
      runSave: save,
    });

    const preventDefault = vi.fn();
    target.press({ key: "s", ctrlKey: true, preventDefault });

    expect(save).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("still suppresses the browser dialog when a modal owns the key", () => {
    const target = fakeWindow();
    const save = vi.fn();
    attachSaveShortcut({
      target: target as never,
      getContext: () => ({ mode: "edit", modalOpen: true }),
      runSave: save,
    });

    const preventDefault = vi.fn();
    target.press({ key: "s", metaKey: true, preventDefault });

    expect(save).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does not fire a second save while the first is still in flight", async () => {
    const target = fakeWindow();
    let release: () => void = () => {};
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    attachSaveShortcut({
      target: target as never,
      getContext: () => ({ mode: "edit" }),
      runSave: save,
    });

    const first = vi.fn();
    target.press({ key: "s", ctrlKey: true, preventDefault: first });
    // Held key / impatient second press while the request is open.
    target.press({ key: "s", ctrlKey: true, preventDefault: vi.fn() });
    expect(save).toHaveBeenCalledTimes(1);

    release();
    await Promise.resolve();
    await Promise.resolve();

    // After the save settled a new press saves again — one request per press.
    target.press({ key: "s", ctrlKey: true, preventDefault: vi.fn() });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("leaves plain typing and unrelated keys alone", () => {
    const target = fakeWindow();
    const save = vi.fn();
    attachSaveShortcut({
      target: target as never,
      getContext: () => ({ mode: "edit" }),
      runSave: save,
    });

    const preventDefault = vi.fn();
    target.press({ key: "s", preventDefault });
    target.press({ key: "p", ctrlKey: true, preventDefault });

    expect(save).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("detaches cleanly", () => {
    const target = fakeWindow();
    const save = vi.fn();
    const detach = attachSaveShortcut({
      target: target as never,
      getContext: () => ({ mode: "edit" }),
      runSave: save,
    });
    expect(target.count).toBe(1);
    detach();
    expect(target.count).toBe(0);
    target.press({ key: "s", ctrlKey: true, preventDefault: vi.fn() });
    expect(save).not.toHaveBeenCalled();
  });
});
