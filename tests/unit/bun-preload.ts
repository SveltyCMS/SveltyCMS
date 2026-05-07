/**
 * @file tests/unit/bun-preload.ts
 * @description Global preload script for Bun unit tests (Svelte 5 + SvelteKit).
 * Minimal version: only handles Svelte compiler plugin and essential shims.
 * Most logic and mocks are moved to setup.ts.
 */

import { mock } from "bun:test";

// --- SVELTE COMPILER PLUGIN ---
import { plugin } from "bun";
import { compile, compileModule } from "svelte/compiler";
const transpiler = new Bun.Transpiler({ loader: "ts" });

plugin({
  name: "svelte-loader",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      try {
        const { js } = compile(source, { filename: path, generate: "server", dev: false });
        let contents = js.code;
        if (!contents.includes("export default")) {
          const match = contents.match(/function\s+([A-Za-z0-9_$]+)/);
          if (match?.[1]) contents += `\nexport default ${match[1]};`;
        }
        return { contents, loader: "js" };
      } catch {
        return { contents: `export default {};`, loader: "js" };
      }
    });
    build.onLoad({ filter: /\.svelte\.(ts|js)$/ }, async ({ path }) => {
      let source = await Bun.file(path).text();
      if (path.endsWith(".ts")) source = await transpiler.transform(source);
      try {
        const { js } = compileModule(source, { filename: path, dev: false });
        return { contents: js.code, loader: "js" };
      } catch {
        return { contents: `export const env = {}; export default {};`, loader: "js" };
      }
    });
  },
});

// --- DOM SHIMS ---
if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = globalThis;
  (globalThis as any).self = globalThis;
  (globalThis as any).matchMedia = () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  (globalThis as any).document = {
    createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).navigator = { userAgent: "Bun" };

  const storageMock = () => {
    let storage: Record<string, string> = {};
    return {
      getItem: (key: string) => storage[key] || null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        storage = {};
      },
      key: (i: number) => Object.keys(storage)[i] || null,
      get length() {
        return Object.keys(storage).length;
      },
    };
  };
  (globalThis as any).localStorage = storageMock();
  (globalThis as any).sessionStorage = storageMock();
}

// --- ESSENTIAL KIT MOCKS (STILL NEEDED EARLY) ---
mock.module("$app/environment", () => ({
  browser: false,
  dev: true,
  building: false,
  version: "test",
}));
mock.module("$env/dynamic/private", () => ({ env: process.env }));
mock.module("$app/navigation", () => ({
  goto: () => {},
  pushState: () => {},
  replaceState: () => {},
  invalidate: () => {},
  invalidateAll: () => {},
  beforeNavigate: () => {},
  afterNavigate: () => {},
  onNavigate: () => {},
  preloadData: () => {},
  preloadCode: () => {},
}));

// --- API HANDLER MOCK ---
mock.module("@utils/api-handler", () => ({
  apiHandler: (fn: any) => async (event: any) => {
    try {
      return await fn(event);
    } catch (err: any) {
      if (err.status) {
        return new Response(JSON.stringify({ message: err.message, code: err.code }), {
          status: err.status,
        });
      }
      return new Response(err.message || "Internal Error", { status: 500 });
    }
  },
}));
