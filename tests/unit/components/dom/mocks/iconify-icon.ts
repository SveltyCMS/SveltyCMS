/**
 * @file tests/unit/components/dom/mocks/iconify-icon.ts
 * @description Inert stand-in for `iconify-icon` in jsdom.
 *
 * The real module registers a custom element that fetches icon data and renders
 * it on a timer. That timer outlives the test file's jsdom environment and then
 * throws `ReferenceError: document is not defined` — 4 unhandled errors on CI
 * even though every test passed. The DOM suite never asserts icon SVG, so the
 * custom-element registration is unnecessary here.
 *
 * Aliased in `vitest.dom.config.ts`; production code keeps the real package.
 */

/** No-op: the picker calls this to prefetch icon sets. */
export function loadIcons(..._args: unknown[]): void {
  // intentionally empty
}

export function addIcon(): void {
  // intentionally empty
}

export function addCollection(): void {
  // intentionally empty
}

export default {};
