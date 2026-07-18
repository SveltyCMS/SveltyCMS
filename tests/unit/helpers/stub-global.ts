/**
 * @file tests/unit/helpers/stub-global.ts
 * @description Bun-safe global stubs (Bun's built-in vitest.vi lacks stubGlobal).
 *
 * Prefer this over `vi.stubGlobal` so unit tests pass under both Vitest and `bun test`.
 */

type AnyGlobal = typeof globalThis & Record<string, unknown>;

const originals = new Map<string, unknown>();

/** Assign a global, remembering the previous value for restore. */
export function stubGlobal(name: string, value: unknown): void {
  const g = globalThis as AnyGlobal;
  if (!originals.has(name)) {
    originals.set(name, g[name]);
  }
  try {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    g[name] = value;
  }
}

/** Restore all globals stubbed via this helper (call in afterEach). */
export function unstubAllGlobals(): void {
  const g = globalThis as AnyGlobal;
  for (const [name, value] of originals.entries()) {
    if (typeof value === "undefined") {
      try {
        delete g[name];
      } catch {
        g[name] = undefined;
      }
    } else {
      try {
        Object.defineProperty(globalThis, name, {
          value,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        g[name] = value;
      }
    }
  }
  originals.clear();
}

/** Stub document.cookie for client CSRF tests. */
export function stubDocumentCookie(getCookie: () => string, setCookie?: (v: string) => void): void {
  stubGlobal("document", {
    get cookie() {
      return getCookie();
    },
    set cookie(v: string) {
      setCookie?.(v);
    },
  });
}
