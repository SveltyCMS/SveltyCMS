/**
 * @file tests/unit/utils/mock-core.ts
 * @description Core mock function declarations and shim layers for SveltyCMS.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const isBun = typeof Bun !== "undefined";

/**
 * Global variable setter with fallback
 */
export const setGlobal = (name: string, value: any) => {
  try {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    (globalThis as any)[name] = value;
  }
};

/**
 * Vitest/Bun Shim Layer
 */
export function createViShim() {
  if (!isBun) return (globalThis as any).vi;

  const bunTest = require("bun:test");
  const spies: any[] = [];
  const originalGlobals = new Map<string, any>();

  const shim = {
    fn: (impl?: any) => {
      const m = bunTest.mock(impl || (() => {}));
      spies.push(m);
      const augment = (prop: string, val: any) => {
        try {
          Object.defineProperty(m, prop, {
            value: val,
            writable: true,
            configurable: true,
          });
        } catch {
          (m as any)[prop] = val;
        }
      };
      augment("mockResolvedValue", (val: any) => {
        (m as any).mockImplementation(() => Promise.resolve(val));
        return m;
      });
      augment("mockResolvedValueOnce", (val: any) => {
        (m as any).mockImplementationOnce(() => Promise.resolve(val));
        return m;
      });
      augment("mockReturnValue", (val: any) => {
        (m as any).mockImplementation(() => val);
        return m;
      });
      augment("mockReturnValueOnce", (val: any) => {
        (m as any).mockImplementationOnce(() => val);
        return m;
      });
      return m;
    },
    spyOn: (obj: any, method: string) => {
      if (!obj) throw new Error(`spyOn: target object is undefined for method "${method}"`);
      const spy = bunTest.spyOn(obj, method);
      spies.push(spy);
      return spy;
    },
    mock: (path: string, factory?: (importOriginal: () => Promise<any>) => any) => {
      const importOriginal = () => import(`${path}?bun-unmock=${Date.now()}`);
      if (factory) {
        bunTest.mock.module(path, () => factory(importOriginal));
      } else {
        bunTest.mock.module(path, () => ({}));
      }
    },
    unmock: (_path: string) => {},
    stubGlobal: (name: string, value: any) => {
      if (!originalGlobals.has(name)) {
        originalGlobals.set(name, (globalThis as any)[name]);
      }
      setGlobal(name, value);
    },
    unstubAllGlobals: () => {
      for (const [name, value] of originalGlobals.entries()) {
        setGlobal(name, value);
      }
      originalGlobals.clear();
    },
    clearAllMocks: () => {
      for (const spy of spies) if (spy && spy.mockClear) spy.mockClear();
    },
    restoreAllMocks: () => {
      for (const spy of spies) if (spy && spy.mockRestore) spy.mockRestore();
      spies.length = 0;
    },
    resetAllMocks: () => {
      for (const spy of spies) if (spy && spy.mockReset) spy.mockReset();
    },
    mocked: (v: any) => v,
    hoisted: (factory: () => any) => factory(),
    importActual: (path: string) => import(`${path}?bun-unmock=${Date.now()}`),
  };

  return shim;
}

/**
 * Svelte 5 Rune Emulation for testing environments
 */
export function emulateSvelteRunes() {
  if (typeof (globalThis as any).$state !== "undefined") return;

  const rune = (v: any) => v;
  setGlobal("$state", rune);
  (globalThis as any).$state.raw = rune;
  (globalThis as any).$state.snapshot = rune;
  setGlobal("$derived", rune);
  (globalThis as any).$derived.by = rune;
  setGlobal("$effect", () => {});
  (globalThis as any).$effect.pre = () => {};
  (globalThis as any).$effect.tracking = () => false;
  setGlobal("$props", rune);
  setGlobal("$bindable", rune);
  setGlobal("$inspect", rune);
}
