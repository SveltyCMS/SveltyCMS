/**
 * @file tests/unit/bun-preload.ts
 * @description Global preload script for Bun unit tests (Svelte 5 + SvelteKit).
 */

import { mock } from "bun:test";

const mockFn = (fn?: any) => {
  if ((globalThis as any).vi) return (globalThis as any).vi.fn(fn);
  return mock(fn || (() => {}));
};

// --- CMS WIDGET MOCK ---
const createMockWidgetInternal = (name: string) => {
  const fn = (config: any) => ({
    ...config,
    db_fieldName: config.db_fieldName || config.label?.toLowerCase() || "field",
    widget: { Name: name },
  });
  return Object.assign(fn, {
    Name: name,
    Icon: "mdi:widgets",
    Description: `Mock ${name} widget`,
    __inputComponentPath: `/${name.toLowerCase()}/input.svelte`,
    __displayComponentPath: `/${name.toLowerCase()}/display.svelte`,
  });
};

const widgetNames = [
  "Input",
  "RichText",
  "Relation",
  "Select",
  "DateTime",
  "Group",
  "Repeater",
  "MediaUpload",
  "MegaMenu",
  "Radio",
  "Checkbox",
  "Date",
  "DateRange",
  "Slug",
  "Seo",
  "Email",
  "Number",
  "PhoneNumber",
  "ColorPicker",
  "Rating",
  "Address",
  "RemoteVideo",
];

const mockWidgets: Record<string, any> = {};
for (const name of widgetNames) {
  mockWidgets[name] = createMockWidgetInternal(name);
}

Object.defineProperty(globalThis, "widgets", {
  value: mockWidgets,
  writable: true,
  configurable: true,
});

// --- SVELTE 5 RUNES MOCK ---
const $state = (v: any) => v;
$state.raw = (v: any) => v;
$state.snapshot = (v: any) => {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
};
const $derived = (fn: any) => (typeof fn === "function" ? fn() : fn);
$derived.by = (fn: any) => (typeof fn === "function" ? fn() : fn);
const $effect = (fn: any) => {
  if (typeof fn === "function") fn();
};
$effect.root = (fn: any) => {
  if (typeof fn === "function") fn();
  return () => {};
};
$effect.pre = (fn: any) => {
  if (typeof fn === "function") fn();
};

(globalThis as any).$state = $state;
(globalThis as any).$derived = $derived;
(globalThis as any).$effect = $effect;
(globalThis as any).$props = () => ({});
(globalThis as any).$bindable = (v: any) => v;
(globalThis as any).$inspect = () => ({ with: () => {} });
(globalThis as any).SvelteMap = Map;
(globalThis as any).SvelteSet = Set;

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

// ─────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────

mock.module("$app/environment", () => ({
  browser: false,
  dev: true,
  building: false,
  version: "test",
}));
mock.module("$env/dynamic/private", () => ({ env: process.env }));

// 🚀 PRECISE MOCK FOR widgetRegistryService
mock.module("@src/services/widget-registry-service", () => {
  const wsMap = new Map();
  for (const name of widgetNames) {
    wsMap.set(name, createMockWidgetInternal(name));
  }
  return {
    widgetRegistryService: {
      getAllWidgets: async () => wsMap,
      initialize: async () => {},
    },
  };
});

const mockMetrics = {
  recordMetric: mockFn(),
  incrementApiRequests: mockFn(),
  incrementApiErrors: mockFn(),
  recordResponseTime: mockFn(),
  recordHookExecutionTime: mockFn(),
  getReport: mockFn(() => ({})),
};

(globalThis as any).metricsService = mockMetrics;
