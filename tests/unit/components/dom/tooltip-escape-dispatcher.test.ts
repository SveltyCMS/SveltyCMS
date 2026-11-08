/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/tooltip-escape-dispatcher.test.ts
 * @description Tooltip Escape handling shares one lazily attached window listener.
 *
 * Every `Tooltip` used to render its own `<svelte:window onkeydown>`, so an
 * admin table with hundreds of tooltips carried hundreds of idle global
 * listeners. The dispatcher attaches a single listener only while at least one
 * tooltip is open and removes it with the last subscriber.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerTooltipEscape,
  tooltipEscapeHandlerCount,
  tooltipEscapeListenerCount,
} from "@utils/tooltip-escape";

const cleanups: Array<() => void> = [];

function register(handler: () => void): () => void {
  const unsubscribe = registerTooltipEscape(handler);
  cleanups.push(unsubscribe);
  return unsubscribe;
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  expect(tooltipEscapeListenerCount()).toBe(0);
  expect(tooltipEscapeHandlerCount()).toBe(0);
});

describe("tooltip Escape dispatcher", () => {
  it("attaches no listener while no tooltip is open", () => {
    expect(tooltipEscapeListenerCount()).toBe(0);
    expect(tooltipEscapeHandlerCount()).toBe(0);
  });

  it("shares one window listener across registrations", () => {
    const first = vi.fn();
    const second = vi.fn();
    register(first);
    register(second);

    expect(tooltipEscapeListenerCount()).toBe(1);
    expect(tooltipEscapeHandlerCount()).toBe(2);

    press("Escape");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("runs handlers only for Escape", () => {
    const handler = vi.fn();
    register(handler);

    for (const key of ["Enter", "Tab", "Backspace", "esc"]) press(key);
    expect(handler).not.toHaveBeenCalled();

    press("Escape");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps the shared listener until the last handler unsubscribes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = register(first);
    const offSecond = register(second);

    offFirst();
    expect(tooltipEscapeListenerCount()).toBe(1);
    expect(tooltipEscapeHandlerCount()).toBe(1);

    press("Escape");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    offSecond();
    expect(tooltipEscapeListenerCount()).toBe(0);
    expect(tooltipEscapeHandlerCount()).toBe(0);

    press("Escape");
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("treats duplicate registration and repeated unsubscribe as idempotent", () => {
    const handler = vi.fn();
    const off = register(handler);
    register(handler);

    expect(tooltipEscapeHandlerCount()).toBe(1);
    press("Escape");
    expect(handler).toHaveBeenCalledTimes(1);

    off();
    off();
    expect(tooltipEscapeListenerCount()).toBe(0);
    expect(tooltipEscapeHandlerCount()).toBe(0);
  });
});
