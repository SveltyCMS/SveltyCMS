/**
 * @file tests/unit/components/dom/render.ts
 * @description Client-side render helper for Svelte 5 component interaction tests.
 *
 * These tests run under `vitest.dom.config.ts` (jsdom + browser condition), so
 * `mount()` resolves to the client runtime. The default `vitest.config.ts` forces
 * SSR resolution and cannot mount components.
 *
 * ### Features:
 * - mount into a detached container appended to `<body>`
 * - synchronous flush so queries see the post-mount DOM
 * - deterministic cleanup of the component and its container
 * - small interaction helpers (click, type, select, press)
 */

import { flushSync, mount, tick, unmount } from "svelte";
import type { Component, ComponentProps } from "svelte";
import { hydration } from "@src/stores/hydration.svelte";

export interface RenderedComponent {
  /** Container element the component was mounted into. */
  target: HTMLElement;
  /** Unmount the component and remove its container. */
  cleanup: () => void;
}

/**
 * Mount a component and flush pending effects (including `onMount`).
 * The caller owns the returned cleanup; call it in `afterEach` or a `finally`.
 */
export function renderComponent<C extends Component<any, any, any>>(
  component: C,
  props: ComponentProps<C> = {} as ComponentProps<C>,
): RenderedComponent {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const instance = mount(component, { target, props });
  // In the browser `+layout.svelte` calls this once the client runtime is attached.
  // These tests mount a single page in isolation, so the layout never runs and every
  // control gated on hydration would stay disabled forever — the click would be a
  // silent no-op. Marking it here reproduces the state the component expects.
  hydration.markHydrated();
  flushSync();

  return {
    target,
    cleanup: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/**
 * Mount an `(app)` page with a partial `data` payload.
 *
 * Page components type `data` as the merged layout + page shape, but these tests
 * only exercise page-level keys; the layout half (user, theme, sidebar, …) is
 * intentionally omitted.
 */
export function renderPage<C extends Component<any, any, any>>(
  component: C,
  data: Record<string, unknown>,
): RenderedComponent {
  return renderComponent(component, { data } as unknown as ComponentProps<C>);
}

/** Flush Svelte effects and one microtask tick (for async component updates). */
export async function settle(): Promise<void> {
  flushSync();
  await tick();
  flushSync();
}

/** Activate an element and settle the resulting DOM updates. */
export async function click(element: Element | null | undefined): Promise<void> {
  if (!element) throw new Error("click(): element not found");
  (element as HTMLElement).click();
  await settle();
}

/** Set an input/textarea value through the native setter, then fire `input`. */
export async function typeText(
  element: HTMLInputElement | HTMLTextAreaElement | null | undefined,
  value: string,
): Promise<void> {
  if (!element) throw new Error("typeText(): element not found");
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
}

/** Change a native `<select>` value and fire `change`. */
export async function select(
  element: HTMLSelectElement | null | undefined,
  value: string,
): Promise<void> {
  if (!element) throw new Error("select(): element not found");
  element.value = value;
  element.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
}

/** Dispatch a keyboard event on an element (bubbles by default). */
export async function press(
  element: Element | null | undefined,
  key: string,
  init: KeyboardEventInit = {},
): Promise<void> {
  if (!element) throw new Error("press(): element not found");
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  await settle();
}
