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

const { ALL_WIDGET_NAMES: widgetNames } = require("./widget-constants.ts");

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
mock.module("$app/navigation", () => ({
  goto: mockFn(),
  pushState: mockFn(),
  replaceState: mockFn(),
  invalidate: mockFn(),
  invalidateAll: mockFn(),
  beforeNavigate: mockFn(),
  afterNavigate: mockFn(),
  onNavigate: mockFn(),
  preloadData: mockFn(),
  preloadCode: mockFn(),
}));

// --- HELPERS ---
const isTestTarget = (target: string) => {
  const currentTest = process.argv.find((arg) => arg.endsWith(".test.ts"));
  return currentTest && currentTest.includes(target);
};

// 🚀 PRECISE MOCK FOR widgetRegistryService
if (!isTestTarget("widget-registry-service")) {
  mock.module("@src/services/core/widget-registry-service", () => {
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
}

const mockMetrics = {
  recordMetric: mockFn(),
  incrementApiRequests: mockFn(),
  incrementApiErrors: mockFn(),
  recordResponseTime: mockFn(),
  recordHookExecutionTime: mockFn(),
  getReport: mockFn(() => ({})),
};

(globalThis as any).metricsService = mockMetrics;

// --- CORE SERVICE MOCKS ---
if (!isTestTarget("settings-service")) {
  mock.module("@src/services/core/settings-service", () => {
    const mockSettings = {
      getPrivateSettingSync: vi.fn().mockReturnValue(false),
      getPublicSettingSync: vi.fn().mockReturnValue(undefined),
      getPrivateSetting: vi.fn().mockResolvedValue(false),
      getPublicSetting: vi.fn().mockResolvedValue(undefined),
      getUntypedSetting: vi.fn().mockResolvedValue(undefined),
      invalidateSettingsCache: vi.fn(),
      loadSettingsCache: vi.fn().mockResolvedValue({ loaded: true, private: {}, public: {} }),
      setSettingsCache: vi.fn(),
      isCacheLoaded: vi.fn().mockReturnValue(true),
      getAllSettings: vi.fn().mockResolvedValue({ public: {}, private: {} }),
    };
    return {
      ...mockSettings,
      settingsService: mockSettings,
    };
  });
}

if (!isTestTarget("automation-service")) {
  mock.module("@src/services/background/automation/automation-service", () => {
    const mockAutomation = {
      getFlows: vi.fn().mockResolvedValue([]),
      getFlow: vi.fn().mockResolvedValue(null),
      saveFlow: vi.fn().mockResolvedValue({ id: "flow-1", name: "Test" }),
      deleteFlow: vi.fn().mockResolvedValue(undefined),
      init: vi.fn(),
      invalidateCache: vi.fn(),
      executeFlow: vi.fn().mockResolvedValue({ status: "success", operationResults: [] }),
      getLogs: vi.fn().mockReturnValue([]),
    };
    return {
      ...mockAutomation,
      automationService: mockAutomation,
    };
  });
}

mock.module("@src/databases/auth/saml-auth", () => {
  return {
    handleSAMLResponse: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }))),
    generateSAMLAuthUrl: async () => "http://idp.com/auth",
    createSAMLConnection: vi.fn().mockResolvedValue({ success: true }),
    getJackson: vi.fn().mockResolvedValue({}),
  };
});

const isBenchmark = process.env.BENCHMARK_MODE === "true" || process.env.BENCHMARK_STABLE === "true";

if (!isBenchmark) {
  mock.module("@src/databases/db", () => ({
    dbAdapter: {
      auth: { getUserById: vi.fn(), getUserByEmail: vi.fn() },
      collection: {
        getModel: vi.fn().mockResolvedValue({}),
        listSchemas: vi.fn().mockResolvedValue({ success: true, data: [] }),
      },
      crud: { find: vi.fn().mockResolvedValue([]) },
    },
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    getDb: vi.fn().mockReturnValue({
      auth: { getUserById: vi.fn(), getUserByEmail: vi.fn() },
      collection: { getModel: vi.fn().mockResolvedValue({}) },
    }),
  }));
}

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

mock.module("@utils/logger", () => ({
  logger: {
    info: mockFn(),
    error: mockFn(),
    warn: mockFn(),
    debug: mockFn(),
  },
}));
