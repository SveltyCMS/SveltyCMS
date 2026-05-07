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

import {
  mock,
  spyOn as bunSpyOn,
  describe as bunDescribe,
  it as bunIt,
  test as bunTest,
  expect as bunExpect,
  beforeEach as bunBeforeEach,
  afterEach as bunAfterEach,
  beforeAll as bunBeforeAll,
  afterAll as bunAfterAll,
} from "bun:test";

// --- VITEST COMPATIBILITY SHIM (EARLY) ---
const viShim = {
  fn: (impl?: any) => {
    const f = mock(impl || (() => {}));
    const augment = (prop: string, val: any) => {
      try {
        Object.defineProperty(f, prop, {
          value: val,
          writable: true,
          configurable: true,
        });
      } catch {
        (f as any)[prop] = val;
      }
    };
    augment("mockResolvedValue", (val: any) => {
      f.mockImplementation(() => Promise.resolve(val));
      return f;
    });
    augment("mockResolvedValueOnce", (val: any) => {
      f.mockImplementationOnce(() => Promise.resolve(val));
      return f;
    });
    augment("mockReturnValue", (val: any) => {
      f.mockImplementation(() => val);
      return f;
    });
    augment("mockReturnValueOnce", (val: any) => {
      f.mockImplementationOnce(() => val);
      return f;
    });
    augment("mockClear", () => {
      f.mockClear();
      return f;
    });
    augment("mockReset", () => {
      f.mockReset();
      return f;
    });
    augment("mockRestore", () => {
      f.mockRestore();
      return f;
    });
    return f;
  },
  mock: (path: string, factory?: any) => {
    if (factory) {
      const importOriginal = () => import(`${path}?bun-unmock=${Date.now()}`);
      mock.module(path, () => factory(importOriginal));
    } else {
      mock.module(path, () => ({}));
    }
  },
  mocked: (v: any) => v,
  hoisted: (fn: any) => fn(),
  stubGlobal: (name: string, value: any) => {
    (globalThis as any)[name] = value;
  },
  unstubAllGlobals: () => {},
  resetAllMocks: () => {},
  clearAllMocks: () => {},
  restoreAllMocks: () => {},
  importActual: (path: string) => import(`${path}?bun-unmock=${Date.now()}`),
  spyOn: (obj: any, method: string) => bunSpyOn(obj, method),
  unmock: (path: string) => {
    try {
      const resolved = import.meta.resolve(path);
      (mock as any).unmock(resolved);
    } catch {
      (mock as any).unmock(path);
    }
  },
};

// @ts-ignore
globalThis.vi = viShim;
// @ts-ignore
globalThis.vitest = viShim;

if (typeof Bun !== "undefined") {
  mock.module("vitest", () => ({
    ...viShim,
    describe: bunDescribe,
    it: bunIt,
    test: bunTest,
    expect: bunExpect,
    beforeEach: bunBeforeEach,
    afterEach: bunAfterEach,
    beforeAll: bunBeforeAll,
    afterAll: bunAfterAll,
    vi: viShim,
    vitest: viShim,
  }));
}

console.log("✅ Svelte 5 Runes and Reactivity Mocked Globally for Bun");
