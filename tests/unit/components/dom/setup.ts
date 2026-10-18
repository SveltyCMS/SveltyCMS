/**
 * @file tests/unit/components/dom/setup.ts
 * @description Minimal setup for client-side component interaction tests.
 *
 * Deliberately does not import `tests/unit/setup.ts`: that file mocks Node
 * services and `$app/*` modules for the server suite and pulls Node built-ins
 * that are irrelevant (and noisy) for a jsdom component run.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// jsdom does not implement the native <dialog> methods used by `useDialog`.
// The polyfill mirrors the browser surface the component relies on (`open`,
// `showModal`, `close`, `close` event) — enough to exercise open/close logic.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

// Some jsdom configurations omit rAF; `useDialog` uses it for focus cleanup.
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    Number(setTimeout(() => cb(performance.now()), 0));
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

// jsdom lacks (or stubs) the Web Animations API that Svelte transitions use.
// Svelte attaches `onfinish` after calling `animate()`, so fire it on a macrotask —
// otherwise outgoing transition nodes (modals, menus) never leave the DOM.
Element.prototype.animate = (() => {
  const animation = {
    finished: Promise.resolve(),
    onfinish: null as null | (() => void),
    oncancel: null as null | (() => void),
    cancel() {
      this.oncancel?.();
    },
    finish() {
      this.onfinish?.();
    },
    play: () => {},
    pause: () => {},
  };
  setTimeout(() => animation.onfinish?.(), 0);
  return animation;
}) as unknown as Element["animate"];

// `useFloating` observes reference/floating boxes; jsdom has no layout engine.
if (typeof globalThis.ResizeObserver !== "function") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
if (typeof globalThis.IntersectionObserver !== "function") {
  class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
  }
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

// jsdom does not implement matchMedia; Checkbox/Toggle and the theme store read it.
// Report reduced motion so `adminFade`/`adminPage` run at 0ms — CSS transition
// timing has no meaning in jsdom and would make unmount assertions racy.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })) as typeof window.matchMedia;
}

// Reactive focus/scroll assertions are meaningless in jsdom; stub the pieces
// that would otherwise print "Not implemented" noise.
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

afterEach(() => {
  // Svelte portals append to <body>; clear anything a test forgot to unmount.
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});
