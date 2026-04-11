/**
 * @file tests/unit/global-setup.ts
 * @description
 * Ultra-early global setup for Bun tests.
 * This MUST define Svelte 5 runes before ANY application code is imported.
 */

// --- SVELTE 5 RUNES MOCK (DEFINED GLOBALLY) ---
const mockState = (val: any) => val;
mockState.raw = (val: any) => val;
mockState.snapshot = (val: any) => val;

// @ts-ignore
globalThis.$state = mockState;
// @ts-ignore
globalThis.$derived = (fn: any) => (typeof fn === "function" ? fn() : fn);
// @ts-ignore
globalThis.$effect = (fn: any) => fn;
// @ts-ignore
globalThis.$props = () => ({});
// @ts-ignore
globalThis.$bindable = () => ({});
// @ts-ignore
globalThis.$inspect = () => ({});

// --- SVELTE REACTIVITY MOCKS ---
// Mock common reactivity classes that might be used
// @ts-ignore
globalThis.SvelteMap = Map;
// @ts-ignore
globalThis.SvelteSet = Set;

console.log("✅ Svelte 5 Runes and Reactivity Mocked Globally for Bun");
