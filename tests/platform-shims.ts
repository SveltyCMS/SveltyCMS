/**
 * @file tests/platform-shims.ts
 * @description
 * Ultra-early platform shims for Bun/Node test environments.
 * Provides fallbacks for Vite/Browser features like import.meta.glob and basic DOM.
 */

const isBun = typeof Bun !== "undefined";

// 1. Vite Shims (Alternative approach for Bun)
// Since import.meta is per-module, we handle it via localized guards in source code
// or via Vitest config when using that runner.

// 2. DOM Shims (Simplified version for platform stability)
if (isBun) {
  const setGlobal = (name: string, value: any) => {
    if ((globalThis as any)[name] !== undefined) return;
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

  // Basic Node/HTMLElement for svelte compile components in ssr mode
  class NodeMock {
    nodeType = 1;
    ownerDocument: any;
    appendChild() {
      return this;
    }
    removeChild() {
      return this;
    }
    addEventListener() {}
    removeEventListener() {}
  }
  class HTMLElementMock extends NodeMock {
    style = {};
    classList = { add: () => {}, remove: () => {}, contains: () => false, toggle: () => false };
    setAttribute() {}
    getAttribute() {
      return null;
    }
  }

  setGlobal("Node", NodeMock);
  setGlobal("HTMLElement", HTMLElementMock);
  setGlobal("window", {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: { userAgent: "bun" },
    document: {},
    localStorage: {},
    sessionStorage: {},
    matchMedia: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
    requestAnimationFrame: (cb: any) => setTimeout(cb, 0),
    cancelAnimationFrame: (id: any) => clearTimeout(id),
  });
  setGlobal("document", {
    createElement: () => new HTMLElementMock(),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  setGlobal("navigator", { userAgent: "bun" });
  setGlobal("requestAnimationFrame", (cb: any) => setTimeout(cb, 0));
  setGlobal("cancelAnimationFrame", (id: any) => clearTimeout(id));

  // 3. Storage Mock (for logger.ts and other browser-aware utils)
  class StorageMock {
    private store: Record<string, string> = {};
    getItem(key: string) {
      return this.store[key] || null;
    }
    setItem(key: string, val: string) {
      this.store[key] = String(val);
    }
    removeItem(key: string) {
      delete this.store[key];
    }
    clear() {
      this.store = {};
    }
    get length() {
      return Object.keys(this.store).length;
    }
    key(i: number) {
      return Object.keys(this.store)[i] || null;
    }
  }
  setGlobal("localStorage", new StorageMock());
  setGlobal("sessionStorage", new StorageMock());
}

// 3. Environment Globals
process.env.TEST_MODE = "true";
process.env.BROWSER = "false";
process.env.NODE_ENV = "test";
process.env.SSR = "true";
