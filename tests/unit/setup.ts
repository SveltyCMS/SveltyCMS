/**
 * @file tests\unit\setup.ts
 * @description
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { CORE_WIDGETS, CUSTOM_WIDGETS } from "./widgets/widget-constants";
import { widgetNameToFolder } from "@src/widgets/widget-naming";
const isBun = typeof Bun !== "undefined";

// 🚀 CRITICAL: Detect benchmark mode early
const currentTest = process.argv.find(
  (arg) => arg.includes("benchmark") || arg.endsWith(".test.ts"),
);
const isBenchmark =
  process.env.BENCHMARK === "true" ||
  process.env.BENCHMARK === "1" ||
  currentTest?.includes("benchmark");

// Quiet progress loggers (compile, etc.) for all unit runs — not just benchmarks.
// QUIET silences the real logger so suites need not re-mock @utils/logger.
(globalThis as any).__SVELTY_QUIET__ = true;
process.env.QUIET = process.env.QUIET || "true";
process.env.TEST_MODE = process.env.TEST_MODE || "true";
if (isBenchmark) {
  process.env.BENCHMARK = process.env.BENCHMARK || "true";
}

import { argvIncludesRealDbTest } from "../helpers/real-db-test-markers";

/** DB roundtrip tests need the real adapter stack — disable global mocks when detected on CLI. */
if (argvIncludesRealDbTest()) {
  process.env.BUN_TEST_MOCKS = "false";
}

const ENABLE_MOCKS = process.env.BUN_TEST_MOCKS !== "false";

const setGlobal = (name: string, value: any) => {
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

// detect environment
let mock: any;
let vitest: any;

// 🚀 CRITICAL: Mock 'vitest' IMMEDIATELY for Bun to prevent real vitest from loading
if (isBun) {
  const bunTest = require("bun:test");
  mock = bunTest.mock;
  const spies: any[] = [];
  const originalGlobals = new Map<string, any>();

  const viShim = {
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

  // Bun 1.3+ ships a partial built-in `vitest.vi` (timers/fn) that lacks stubGlobal.
  // Prefer merging our shim onto any existing Bun vi so `import { vi } from "vitest"` works.
  const mergeVi = (target: Record<string, any> | null | undefined) => {
    if (!target || typeof target !== "object") return viShim;
    for (const [k, v] of Object.entries(viShim)) {
      if (typeof target[k] === "undefined") {
        try {
          Object.defineProperty(target, k, {
            value: v,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch {
          target[k] = v;
        }
      }
    }
    return target;
  };

  // Patch global early
  mergeVi((globalThis as any).vi);
  setGlobal("vi", mergeVi((globalThis as any).vi) || viShim);
  setGlobal("vitest", (globalThis as any).vi);

  const vitestMock = {
    ...bunTest,
    ...viShim,
    vi: (globalThis as any).vi || viShim,
    vitest: (globalThis as any).vi || viShim,
    describe: bunTest.describe,
    it: bunTest.it,
    test: bunTest.test,
    expect: bunTest.expect,
    beforeEach: bunTest.beforeEach,
    afterEach: bunTest.afterEach,
    beforeAll: bunTest.beforeAll,
    afterAll: bunTest.afterAll,
    default: { ...bunTest, vi: (globalThis as any).vi || viShim },
  };

  bunTest.mock.module("vitest", () => {
    // Re-merge every resolution in case Bun recreated its partial vi
    if (vitestMock.vi) mergeVi(vitestMock.vi as Record<string, any>);
    return vitestMock;
  });
  try {
    const vitestPath = import.meta.resolve("vitest");
    bunTest.mock.module(vitestPath, () => {
      if (vitestMock.vi) mergeVi(vitestMock.vi as Record<string, any>);
      return vitestMock;
    });
  } catch {}

  // Best-effort: patch the already-resolved package export object
  try {
    const resolved = require("vitest") as { vi?: Record<string, any> };
    if (resolved?.vi) mergeVi(resolved.vi);
  } catch {
    /* ignore */
  }

  (globalThis as any).mock = bunTest.mock;
  if (!globalThis.describe) setGlobal("describe", bunTest.describe);
  if (!globalThis.test) setGlobal("test", bunTest.test);
  if (!globalThis.it) setGlobal("it", bunTest.it);
  if (!globalThis.expect) setGlobal("expect", bunTest.expect);
  if (!globalThis.beforeEach) setGlobal("beforeEach", bunTest.beforeEach);
  if (!globalThis.afterEach) setGlobal("afterEach", bunTest.afterEach);
  if (!globalThis.beforeAll) setGlobal("beforeAll", bunTest.beforeAll);
  if (!globalThis.afterAll) setGlobal("afterAll", bunTest.afterAll);

  bunTest.beforeEach(() => {
    (globalThis as any).__svelte_context_map__ = new Map();
  });
}

// All test files on the CLI — not only the first match (multi-file `bun test` runs)
const testFileArgs = process.argv.filter(
  (arg) => arg.endsWith(".test.ts") || arg.endsWith(".bun.test.ts"),
);

// Normalized backslashes for Windows
const isTestTarget = (path: string) => {
  const normalizedPath = path.replace(/\\/g, "/");
  const targetPart = path.split("/").pop()?.replace(".ts", "") || "___NON_EXISTENT___";

  const matchesTestFile = (normalizedTestPath: string) => {
    if (
      normalizedTestPath.includes("security-response-service") &&
      normalizedPath.includes("security-response-service")
    ) {
      return true;
    }
    return normalizedTestPath.includes(targetPart);
  };

  for (const testArg of testFileArgs) {
    if (matchesTestFile(testArg.replace(/\\/g, "/"))) return true;
  }

  if (!isBun && vitest?.expect) {
    try {
      const { testPath } = (vitest.expect as any).getState();
      if (testPath && matchesTestFile(testPath.replace(/\\/g, "/"))) return true;
    } catch {}
  }

  const normalizedCurrentTest = currentTest ? currentTest.replace(/\\/g, "/") : "";
  return normalizedCurrentTest ? matchesTestFile(normalizedCurrentTest) : false;
};

// --- TOP LEVEL MOCKS (Hoisted — reliable under Vitest; doMock alone is not) ---
// Factories MUST be defined inside vi.hoisted (cannot use outer ESM imports — TDZ).
// Keep helpers/default-module-mocks.ts as the documented copy for per-file reuse.
const { mockLogger, settingsExports, globalSettingsExports, kitMock } = (vi as any).hoisted(() => {
  const makeFn = (impl?: (...args: any[]) => any) => {
    const viRef = (globalThis as any).vi;
    if (viRef?.fn) return viRef.fn(impl);
    const f: any = (...args: any[]) => (impl ? impl(...args) : undefined);
    f.mockClear = () => f;
    f.mockReset = () => f;
    f.mockImplementation = (next: any) => {
      impl = next;
      return f;
    };
    f.mockReturnValue = (val: any) => {
      impl = () => val;
      return f;
    };
    f.mockResolvedValue = (val: any) => {
      impl = () => Promise.resolve(val);
      return f;
    };
    return f;
  };

  const mockLogger: Record<string, any> = {
    level: "info",
    isEnabled: makeFn((level: string) => {
      const order = ["none", "fatal", "error", "warn", "info", "debug", "trace"];
      return order.indexOf(level) <= order.indexOf("info") && order.indexOf(level) > 0;
    }),
    once: makeFn(() => {}),
    fatal: makeFn((msg: any) => {
      if (process.env.VERBOSE_TESTS) console.error(`[FATAL] ${msg}`);
    }),
    error: makeFn((msg: any, details?: any) => {
      if (process.env.VERBOSE_TESTS) console.error(`[ERROR] ${msg}`, details || "");
    }),
    warn: makeFn((msg: any) => {
      if (process.env.VERBOSE_TESTS) console.warn(`[WARN] ${msg}`);
    }),
    info: makeFn(() => {}),
    debug: makeFn(() => {}),
    trace: makeFn(() => {}),
    dump: makeFn(() => {}),
  };
  mockLogger.isLevel = makeFn((level: string) => mockLogger.isEnabled(level));
  mockLogger.channel = makeFn(() => ({ ...mockLogger, once: mockLogger.once }));

  const settingsMock = {
    getPrivateSettingSync: makeFn((key: string) => {
      const env = (globalThis as any).privateEnv || (globalThis as any).__privateEnv;
      if (env && key in env) return env[key];
      const defaults: Record<string, any> = {
        DB_TYPE: "mongodb",
        MULTI_TENANT: false,
        FIREWALL_ENABLED: true,
        USE_REDIS: false,
      };
      return defaults[key];
    }),
    getPublicSettingSync: makeFn((key: string) =>
      key === "SITE_NAME" ? "SveltyCMS Test" : undefined,
    ),
    getPrivateSetting: makeFn(async (key: string) => {
      const env = (globalThis as any).privateEnv || (globalThis as any).__privateEnv;
      if (env && key in env) return env[key];
      return "mongodb";
    }),
    getPublicSetting: makeFn(async () => "test"),
    loadSettingsCache: makeFn(async () => ({ loaded: true, private: {}, public: {} })),
    setSettingsCache: makeFn(async () => {}),
    invalidateSettingsCache: makeFn(async () => {}),
    isCacheLoaded: makeFn(() => true),
    getAllSettings: makeFn(async () => ({ public: {}, private: {} })),
    updateSettingsFromSnapshot: makeFn(async () => ({ updated: 0 })),
    getUntypedSetting: makeFn(async () => undefined),
  };

  const settingsExports = {
    settingsService: settingsMock,
    loadSettingsCache: settingsMock.loadSettingsCache,
    invalidateSettingsCache: settingsMock.invalidateSettingsCache,
    getPrivateSetting: settingsMock.getPrivateSetting,
    getPublicSetting: settingsMock.getPublicSetting,
    getUntypedSetting: settingsMock.getUntypedSetting,
    getPublicSettingSync: settingsMock.getPublicSettingSync,
    getPrivateSettingSync: settingsMock.getPrivateSettingSync,
    getAllSettings: settingsMock.getAllSettings,
    setPrivateSetting: settingsMock.setSettingsCache,
    updateSettingsFromSnapshot: settingsMock.updateSettingsFromSnapshot,
    default: settingsMock,
    __settingsMock: settingsMock,
  };

  const publicEnvState: Record<string, any> = {
    DEFAULT_CONTENT_LANGUAGE: "en",
    SITE_NAME: "SveltyCMS Test",
  };
  const globalSettingsExports = {
    publicEnv: publicEnvState,
    isPublicEnvReady: () => true,
    initPublicEnv: (env: Record<string, any>) => {
      Object.assign(publicEnvState, env);
    },
    updatePublicEnv: (key: string, value: any) => {
      publicEnvState[key] = value;
    },
    getPublicSetting: (key: string) => publicEnvState[key],
    getPublicEnv: () => publicEnvState,
  };

  const kitMock = {
    json: makeFn((data: any, init?: any) => {
      const res = new Response(JSON.stringify(data), {
        status: init?.status || 200,
        headers: { "Content-Type": "application/json", ...init?.headers },
      });
      (res as any)._data = data;
      return res;
    }),
    error: makeFn((status: number, message: string | { message: string }) => {
      const msg = typeof message === "string" ? message : message.message;
      const err = new Error(msg) as any;
      err.status = status;
      err.statusCode = status;
      err.body = { message: msg };
      err.__is_http_error = true;
      throw err;
    }),
    redirect: makeFn((status: number, location: string) => {
      const err = new Error("Redirect") as any;
      err.status = status;
      err.location = location;
      err.__isRedirect = true;
      throw err;
    }),
    isRedirect: (err: any) => !!(err && err.__isRedirect === true),
    isHttpError: (err: any) =>
      !!(err && (err.__is_http_error === true || typeof err?.status === "number")),
    fail: makeFn((status: number, data?: any) => ({ type: "failure", status, data })),
  };

  return { mockLogger, settingsExports, globalSettingsExports, kitMock };
});

vi.mock("$app/navigation", () => ({
  goto: vi.fn(),
  preloadData: vi.fn(),
  invalidateAll: vi.fn(),
  refreshAll: vi.fn(),
}));
vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "1.0.0",
}));
// 🚀 SK3: $app/environment was renamed to $app/env — same factory.
vi.mock("$app/env", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "1.0.0",
}));
vi.mock("$app/state", () => ({
  page: { subscribe: vi.fn() },
}));
vi.mock("$app/server", () => ({
  command: vi.fn((_policy: string, handler: any) => handler),
  query: vi.fn((_policy: string, handler: any) => handler),
  getRequestEvent: vi.fn(() => ({
    locals: {
      cms: {},
      user: { _id: "test-user-id", role: "admin", username: "admin" },
      tenantId: "test-tenant-id",
    },
    cookies: {
      get: vi.fn(() => undefined),
      set: vi.fn(() => {}),
      delete: vi.fn(() => {}),
    },
  })),
}));

// Logger — prefer real QUIET logger when possible; mock keeps spies stable across files.
vi.mock("@utils/logger", () => ({ logger: mockLogger, default: mockLogger }));
vi.mock("@src/utils/logger", () => ({ logger: mockLogger, default: mockLogger }));
vi.mock("@src/utils/logger.server", () => ({ logger: mockLogger, default: mockLogger }));

// Settings service defaults — use real module when testing settings-service itself.
// Factories cast to `as any`: the global `vi` here is a shared Bun/Vitest shim whose
// factory type is `() => any`, while vitest's real signature passes `importOriginal`.
vi.mock("@src/services/core/settings-service", (async (importOriginal: any) => {
  const testingSelf = process.argv.some((a) => a.replace(/\\/g, "/").includes("settings-service"));
  if (testingSelf || process.env.BUN_TEST_MOCKS === "false") {
    return await importOriginal();
  }
  return settingsExports;
}) as any);
vi.mock("@services/core/settings-service", (async (importOriginal: any) => {
  const testingSelf = process.argv.some((a) => a.replace(/\\/g, "/").includes("settings-service"));
  if (testingSelf || process.env.BUN_TEST_MOCKS === "false") {
    return await importOriginal();
  }
  return settingsExports;
}) as any);

// Browser API clients read publicEnv.DEFAULT_CONTENT_LANGUAGE.
vi.mock("@src/stores/global-settings.svelte.ts", () => globalSettingsExports);
vi.mock("@src/stores/global-settings.svelte", () => globalSettingsExports);

// Real page-guards use redirect()/error() — keep kit surface complete enough for them.
vi.mock("@sveltejs/kit", () => kitMock);

// 1. EARLY DOM SHIMS (Critical for Bun; Vitest uses native jsdom)

// Shimming import.meta.glob specifically for Bun/Node
if (typeof (import.meta as any).glob !== "function") {
  (import.meta as any).glob = (pattern: string, options?: any) => {
    const currentTest = process.argv.find(
      (arg) => arg.includes("benchmark") || arg.endsWith(".test.ts"),
    );
    const isBenchmark = currentTest?.includes("benchmark");
    // For benchmarks, we need real widgets.
    if (process.env.BUN_TEST_MOCKS === "false" || isBenchmark) {
      const fs = require("node:fs");
      const path = require("node:path");

      // Basic support for "./core/*/index.ts" and "./custom/*/index.ts"
      const baseDir = path.resolve(process.cwd(), "src/widgets");
      const isCustom = pattern.includes("custom");
      const subDir = isCustom ? "custom" : "core";
      const scanDir = path.join(baseDir, subDir);

      if (!fs.existsSync(scanDir)) {
        console.warn(`[setup.ts] scanDir not found: ${scanDir}`);
        return {};
      }

      const modules: Record<string, any> = {};
      const entries = fs.readdirSync(scanDir, { withFileTypes: true });
      if (process.env.VERBOSE_TESTS === "true") {
        console.log(`[setup.ts] Scanning ${scanDir}, found ${entries.length} entries`);
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const indexPath = path.join(scanDir, entry.name, "index.ts");
          if (fs.existsSync(indexPath)) {
            const key = `./${subDir}/${entry.name}/index.ts`;
            if (options?.eager) {
              modules[key] = require(indexPath);
            } else {
              modules[key] = () => import(indexPath);
            }
          }
        }
      }
      return modules;
    }
    return {};
  };
}

class Node {
  nodeType = 1;
  ownerDocument: any;
  appendChild(el: any) {
    return el;
  }
  removeChild(el: any) {
    return el;
  }
  addEventListener() {}
  removeEventListener() {}
}

class HTMLElement extends Node {
  style = {};
  classList = {
    add: () => {},
    remove: () => {},
    contains: () => false,
    toggle: () => false,
  };
  setAttribute() {}
  getAttribute() {
    return null;
  }
  get nodeName() {
    return (this as any)._nodeName || "DIV";
  }
  set nodeName(v: string) {
    (this as any)._nodeName = v;
  }
}

const windowMock: any = {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  innerWidth: 1024,
  innerHeight: 768,
  location: new URL("http://localhost"),
  matchMedia: () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
  Node,
  HTMLElement,
  addEventListener: () => {},
  removeEventListener: () => {},
};

const documentMock: any = {
  nodeType: 9,
  cookie: "",
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  querySelector: () => null,
  createElement: (tag: string) => {
    const el = new HTMLElement();
    el.nodeName = tag.toUpperCase();
    el.ownerDocument = documentMock;
    return el;
  },
};

windowMock.document = documentMock;
documentMock.defaultView = windowMock;

class EventSourceMock {
  onmessage: any;
  onerror: any;
  onopen: any;
  constructor(public url: string) {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

if (isBun) {
  setGlobal("Node", Node);
  setGlobal("HTMLElement", HTMLElement);
  setGlobal("window", windowMock);
  setGlobal("document", documentMock);
  setGlobal("navigator", { userAgent: "bun" });
  setGlobal("EventSource", EventSourceMock);

  const documentBodyMock = new HTMLElement();
  documentBodyMock.ownerDocument = documentMock;
  documentBodyMock.nodeName = "BODY";
  documentMock.body = documentBodyMock;
} else if (typeof window !== "undefined") {
  // Vitest / JSDOM environment
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {}, // Deprecated
        removeListener: () => {}, // Deprecated
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }),
    });
  }
}

// 2. TESTING LIBRARIES (Dynamic import to avoid hoisting before shims)
await import("@testing-library/jest-dom/vitest");

if (!isBun) {
  // Node/Vitest environment - Vitest handles globals via config
  const vitestModule = await import("vitest");
  vitest = vitestModule;
  mock = vitestModule.vi.fn;
  if (!globalThis.mock) setGlobal("mock", vitestModule.vi.fn);
}

// 2. COMMON MOCKS
// Master switch for benchmarking - allows running 'bun test' with ZERO mocks

const moduleMock = (path: string, factory: () => any) => {
  if (isBenchmark) {
    // ⚡ BENCHMARK MODE: Only mock virtual SvelteKit modules ($app/*, $env/*)
    if (!path.startsWith("$")) return;
  } else if (!ENABLE_MOCKS) {
    if (!path.startsWith("$") && !path.includes("svelte") && !path.includes("scanner")) return;
  }

  if (isBun) {
    mock.module(path, factory);
  } else if (vitest?.vi) {
    vitest.vi.doMock(path, factory);
  }
};

const CacheCategory = {
  SCHEMA: "schema",
  WIDGET: "widget",
  THEME: "theme",
  CONTENT: "content",
  AUTH: "auth",
  SYSTEM: "system",
};
setGlobal("CacheCategory", CacheCategory);
moduleMock("@src/databases/cache/types", () => ({
  CacheCategory,
  default: CacheCategory,
}));

// Logger / kit / settings / global-settings: registered via top-level vi.mock above.
// Keep Bun moduleMock mirrors so bun:test runners still resolve the same factories.
moduleMock("@utils/logger", () => ({ logger: mockLogger, default: mockLogger }));
moduleMock("@src/utils/logger", () => ({ logger: mockLogger, default: mockLogger }));
moduleMock("@src/utils/logger.server", () => ({ logger: mockLogger, default: mockLogger }));
moduleMock("@sveltejs/kit", () => kitMock);

moduleMock("$app/environment", () => ({
  browser: false,
  dev: true,
  building: false,
  version: "1.0.0",
  __esModule: true,
  default: { browser: false, dev: true, building: false, version: "1.0.0" },
}));

// 🚀 SK3: $app/env (renamed from $app/environment) — same factory.
moduleMock("$app/env", () => ({
  browser: false,
  dev: true,
  building: false,
  version: "1.0.0",
  __esModule: true,
  default: { browser: false, dev: true, building: false, version: "1.0.0" },
}));

moduleMock("$env/dynamic/private", () => ({
  env: process.env,
  __esModule: true,
  default: process.env,
}));

moduleMock("$app/navigation", () => ({
  goto: mock(() => Promise.resolve()),
  invalidate: mock(() => Promise.resolve()),
  invalidateAll: mock(() => Promise.resolve()),
  refreshAll: mock(() => Promise.resolve()),
  beforeNavigate: mock(() => {}),
  afterNavigate: mock(() => {}),
  preloadData: mock(() => Promise.resolve()),
  preloadCode: mock(() => Promise.resolve()),
  pushState: mock(() => {}),
  replaceState: mock(() => {}),
}));

moduleMock("svelte/reactivity", () => ({
  SvelteMap: Map,
  SvelteSet: Set,
}));

// Redundant mock removed

moduleMock("$app/forms", () => ({
  applyAction: mock(() => Promise.resolve()),
  enhance: mock(() => {}),
  deserialize: mock((v: any) => {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }),
}));

moduleMock("$app/server", () => ({
  command: mock((_policy: string, handler: any) => handler),
  query: mock((_policy: string, handler: any) => handler),
  getRequestEvent: mock(() => ({
    locals: {
      cms: {},
      user: { _id: "test-user-id", role: "admin", username: "admin" },
      tenantId: "test-tenant-id",
    },
    cookies: {
      get: mock(() => undefined),
      set: mock(() => {}),
      delete: mock(() => {}),
    },
  })),
}));

moduleMock("$app/paths", () => ({ base: "", assets: "" }));

moduleMock("$app/state", () => ({
  page: {
    url: new URL("http://localhost"),
  },
}));

// 2. ENVIRONMENT GLOBALS
setGlobal("browser", false);
setGlobal("dev", true);
setGlobal("building", false);
setGlobal("logger", mockLogger);

process.env.BROWSER = "false";
process.env.NODE_ENV = "test";
process.env.TEST_MODE = "true";
process.env.SSR = process.env.SSR || "true";
process.env.SUPPRESS_JEST_WARNINGS = "true"; // Silences Mongoose environment warnings in Bun/Node
process.env.VERBOSE_STDOUT = "false";

// 3. SVELTE 5 RUNES
// For unit tests without a compiler, $state should be transparent for primitives
// to avoid Proxy-to-boolean identity check failures (e.g. expect(val).toBe(true)).
const $state = Object.assign(
  (v: any) => {
    // Only use Proxy for objects/arrays to allow deep reactivity simulation
    if (typeof v === "object" && v !== null) {
      if (v instanceof Map || v instanceof Set || v instanceof Date || v instanceof RegExp) {
        return v;
      }
      return new Proxy(v, {
        get(target, prop) {
          const val = target[prop];
          return typeof val === "function" ? val.bind(target) : val;
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        },
      });
    }
    // Return primitives directly
    return v;
  },
  {
    raw: (v: any) => v,
    snapshot: (v: any) => {
      if (typeof v !== "object" || v === null) return v;
      try {
        return JSON.parse(JSON.stringify(v));
      } catch {
        return v;
      }
    },
  },
);

// $derived should also be transparent if possible, or a reactive-like object
const $derived = Object.assign(
  (fn: any) => {
    const getter = typeof fn === "function" ? fn : () => fn;
    // In tests without a compiler, a class property assigned $derived(fn)
    // will be set once. To support dynamic updates, we'd need a real getter.
    // For now, we return a Proxy that traps common coercion.
    return new Proxy(
      {},
      {
        get(_, prop) {
          const val = getter();
          if (prop === Symbol.toPrimitive)
            return (hint: string) => (hint === "string" ? String(val) : val);
          if (prop === "valueOf") return () => val;
          if (prop === "toString") return () => String(val);
          if (val !== null && typeof val === "object") {
            const subVal = val[prop];
            return typeof subVal === "function" ? subVal.bind(val) : subVal;
          }
          return val;
        },
      },
    );
  },
  {
    by: (fn: any) => {
      const getter = typeof fn === "function" ? fn : () => fn;
      return new Proxy(
        {},
        {
          get(_, prop) {
            const val = getter();
            if (prop === Symbol.toPrimitive)
              return (hint: string) => (hint === "string" ? String(val) : val);
            if (prop === "valueOf") return () => val;
            if (prop === "toString") return () => String(val);
            if (val !== null && typeof val === "object") {
              const subVal = val[prop];
              return typeof subVal === "function" ? subVal.bind(val) : subVal;
            }
            return val;
          },
        },
      );
    },
  },
);

const $effect = Object.assign(
  (fn: any) => {
    if (typeof fn === "function") fn();
  },
  {
    root: (fn: any) => {
      if (typeof fn === "function") fn();
      return () => {};
    },
    pre: (fn: any) => {
      if (typeof fn === "function") fn();
    },
  },
);

setGlobal("$state", $state);
setGlobal("$derived", $derived);
setGlobal("$effect", $effect);
setGlobal("$props", () => ({}));
setGlobal("$bindable", (v: any) => v);
setGlobal("$inspect", () => ({ with: () => {} }));

// 4. SVELTE COMMON MODULES
const svelteCommon = {
  untrack: mock((fn: any) => fn()),
  onMount: (fn: any) => fn?.(),
  onDestroy: (fn: any) => fn?.(),
  beforeUpdate: (fn: any) => fn?.(),
  afterUpdate: (fn: any) => fn?.(),
  tick: () => Promise.resolve(),
  getAllContexts: () => (globalThis as any).__svelte_context_map__ || new Map(),
  getContext: (key: any) => ((globalThis as any).__svelte_context_map__ || new Map()).get(key),
  setContext: (key: any, v: any) => {
    if (!(globalThis as any).__svelte_context_map__) {
      (globalThis as any).__svelte_context_map__ = new Map();
    }
    (globalThis as any).__svelte_context_map__.set(key, v);
    return v;
  },
  hasContext: (key: any) => ((globalThis as any).__svelte_context_map__ || new Map()).has(key),
  mount: (component: any, options: any) => ({
    component,
    options,
    unmount: () => {},
  }),
  hydrate: (component: any, options: any) => ({
    component,
    options,
    unmount: () => {},
  }),
  unmount: () => {},
  flushSync: (cb?: any) => cb?.(),
  createContext: () => [() => {}, () => {}],
};

const svelteServerMock = {
  ...svelteCommon,
  render: mock((component: any, options: any) => {
    let html = "";
    const renderer = {
      push: (s: string) => {
        html += s;
      },
      component: (fn: any) => {
        fn(renderer);
      },
    };

    try {
      // Svelte 5 SSR component call signature: (renderer, props)
      component(renderer, options.props || {});
      return {
        body: html,
        head: "",
        html: html,
      };
    } catch (e) {
      console.error("Error in SSR render mock:", e);
      return { body: "", head: "", html: "" };
    }
  }),
};

if (isBun) {
  moduleMock("svelte", () => svelteCommon);
  moduleMock("svelte/server", () => svelteServerMock);
  moduleMock("svelte/internal", () => ({
    noop: () => {},
    safe_not_equal: () => true,
    subscribe: () => () => {},
    run_all: () => {},
    is_function: (v: any) => typeof v === "function",
  }));
}

// 5. STORAGE MOCK
class StorageMock implements Storage {
  private store: Record<string, string> = {};
  get length() {
    return Object.keys(this.store).length;
  }
  clear() {
    this.store = {};
  }
  getItem(key: string) {
    return this.store[key] || null;
  }
  key(index: number) {
    return Object.keys(this.store)[index] || null;
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
}

const localStorage = new StorageMock();
const sessionStorage = new StorageMock();

setGlobal("localStorage", localStorage);
setGlobal("sessionStorage", sessionStorage);

// 7. navigator
setGlobal("requestAnimationFrame", (cb: any) => setTimeout(cb, 0));
setGlobal("cancelAnimationFrame", (id: any) => clearTimeout(id));

// 7. APPLICATION SERVICE MOCKS
class AppError extends Error {
  status: number;
  code: string;
  details: any;
  originalError: any;
  constructor(message: string, status = 500, code: string | any = "INTERNAL_ERROR", details?: any) {
    super(message);
    this.status = status;
    this.name = "AppError";
    if (typeof code === "string") {
      this.code = code;
      if (details instanceof Error) {
        this.originalError = details;
      }
      this.details = details;
    } else {
      this.code = "INTERNAL_ERROR";
      this.originalError = code;
      this.details = details;
    }
  }
}
setGlobal("AppError", AppError);

// error-handling: use real CMS core (raise, AppError, rethrow). Kit is mocked above
// so isRedirect/isHttpError from production code resolve against kitMock.

// ============================================================================
// WIDGET INFRASTRUCTURE MOCKS
// ============================================================================
function createWidgetFactory(name: string, type: "core" | "custom" = "core") {
  const fn = (config: any) => ({
    ...config,
    db_fieldName: config?.db_fieldName || config?.label?.toLowerCase() || "field",
    widget: { Name: name },
  });
  return Object.assign(fn, {
    Name: name,
    Icon: "mdi:widgets",
    Description: `${name} widget`,
    __widgetType: type,
    __inputComponentPath: `/${name.toLowerCase()}/input.svelte`,
    __displayComponentPath: `/${name.toLowerCase()}/display.svelte`,
  });
}

const widgetMap = new Map<string, any>();
const coreModules: Record<string, any> = {};
const customModules: Record<string, any> = {};

for (const name of CORE_WIDGETS) {
  const factory = createWidgetFactory(name, "core");
  widgetMap.set(name, factory);
  coreModules[`./core/${name.toLowerCase()}/index.ts`] = { default: factory };
}

for (const name of CUSTOM_WIDGETS) {
  const factory = createWidgetFactory(name, "custom");
  widgetMap.set(name, factory);
  customModules[`./custom/${name.toLowerCase()}/index.ts`] = {
    default: factory,
  };
}

const allWidgetModules = { ...coreModules, ...customModules };
if (process.env.VERBOSE_TESTS === "true") {
  console.log(
    `[setup.ts] scannerModules populated with ${Object.keys(allWidgetModules).length} entries`,
  );
}

// Direct mock.module â€” bypasses moduleMock's benchmark skip logic
if (isBun && !isBenchmark && ENABLE_MOCKS) {
  const scannerMock = () => {
    return {
      coreModules,
      customModules,
      marketplaceModules: {},
      widgetComponents: {},
      allWidgetModules,
      getComponentLoader: () => null,
      getWidgetNameFromPath: (p: string) => p.split("/").at(-2) || null,
      widgetNameToFolder,
      getCustomWidgetNames: () =>
        Object.keys(customModules)
          .map((p) => p.split("/").at(-2) || "")
          .filter(Boolean),
    };
  };

  try {
    const scannerPath = import.meta.resolve("@src/widgets/scanner");
    mock.module(scannerPath, scannerMock);
    mock.module("@src/widgets/scanner", scannerMock);
  } catch (e) {
    console.error(`[setup.ts] Resolve failed: ${e}`);
    mock.module("@src/widgets/scanner", scannerMock);
  }

  try {
    const setupPath = import.meta.resolve("@src/utils/is-setup-complete");
    const setupMock = () => ({ isSetupComplete: () => true });
    mock.module(setupPath, setupMock);
    mock.module("@src/utils/is-setup-complete", setupMock);
  } catch {
    mock.module("@src/utils/is-setup-complete", () => ({
      isSetupComplete: () => true,
    }));
  }
  mock.module("@src/services/core/widget-registry-service", () => ({
    widgetRegistryService: {
      getAllWidgets: async () => widgetMap,
      getWidget: async (name: string) => widgetMap.get(name),
      getWidgetSync: (name: string) => widgetMap.get(name),
      initialize: async () => {},
      isInitializedState: () => true,
    },
  }));
}

// Also set globalThis.widgets for direct eval() access in safelyParseSchema
if (!(globalThis as any).widgets || Object.keys((globalThis as any).widgets).length === 0) {
  const widgetsObj: Record<string, any> = {
    initialize: async () => {},
    getWidget: (name: string) => widgetMap.get(name),
    getAllWidgets: () => widgetMap,
    isLoaded: true,
  };
  for (const [name, factory] of widgetMap) {
    widgetsObj[name] = factory;
  }
  Object.defineProperty(globalThis, "widgets", {
    value: widgetsObj,
    writable: true,
    configurable: true,
  });
}

// ============================================================================
// CORE SERVICE MOCKS
// ============================================================================

const mockMetricsService = {
  incrementRequests: mock(() => {}),
  incrementErrors: mock(() => {}),
  recordResponseTime: mock(() => {}),
  incrementAuthValidations: mock(() => {}),
  incrementAuthFailures: mock(() => {}),
  recordAuthCacheHit: mock(() => {}),
  recordAuthCacheMiss: mock(() => {}),
  incrementApiRequests: mock(() => {}),
  incrementApiErrors: mock(() => {}),
  recordApiCacheHit: mock(() => {}),
  recordApiCacheMiss: mock(() => {}),
  incrementRateLimitViolations: mock(() => {}),
  incrementCSPViolations: mock(() => {}),
  incrementSecurityViolations: mock(() => {}),
  recordHookExecutionTime: mock(() => {}),
  recordGraphqlSchemaHit: mock(() => {}),
  recordGraphqlSchemaMiss: mock(() => {}),
  recordGraphqlResponseHit: mock(() => {}),
  recordGraphqlResponseMiss: mock(() => {}),
  getReport: mock(() => ({
    timestamp: Date.now(),
    uptime: 0,
    requests: { total: 0, errors: 0, errorRate: 0, avgResponseTime: 0 },
    authentication: {
      validations: 0,
      failures: 0,
      successRate: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
    },
    api: {
      requests: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
    },
    graphql: {
      schemaHits: 0,
      schemaMisses: 0,
      schemaRebuildMs: 0,
      responseHits: 0,
      responseMisses: 0,
      schemaHitRate: 0,
      responseHitRate: 0,
    },
    security: { rateLimitViolations: 0, cspViolations: 0, authFailures: 0 },
    performance: { slowRequests: 0, avgHookExecutionTime: 0, bottlenecks: [] },
  })),
  reset: mock(() => {}),
  exportPrometheus: mock(() => ""),
  destroy: mock(() => {}),
};

const mockSecurityResponseService = {
  analyzeRequest: mock(() => Promise.resolve({ level: "none", action: "allow" })),
  checkRateLimit: mock(() => ({ allowed: true, limit: 100, count: 0 })),
  blockIp: mock(() => Promise.resolve()),
  reportSecurityEvent: mock(() => {}),
  isBlocked: mock(() => false),
  getThrottleStatus: mock(() => ({ throttled: false, factor: 1 })),
  getActiveIncidents: mock(() => []),
  getSecurityStats: mock(() => ({
    activeIncidents: 0,
    blockedIPs: 0,
    throttledIPs: 0,
    totalIncidents: 0,
    rateLimitEntries: 0,
    threatLevelDistribution: {
      none: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
  })),
  resolveIncident: mock(() => true),
  unblockIP: mock(() => true),
};

// Replace legacy metricsMock with consolidated mockMetricsService
setGlobal("metricsService", mockMetricsService);

const cacheMock = {
  get: mock(async () => null),
  getSync: mock(() => null),
  getMany: mock(async (keys: string[]) => Array(keys.length).fill(null)),
  set: mock(async () => {}),
  setWithCategory: mock(async () => {}),
  connectL2ForTest: mock(async () => {}),
  delete: mock(async () => {}),
  clearByPattern: mock(async () => true),
  clearByTags: mock(async () => {}),
  invalidateAll: mock(async () => {}),
  invalidateByCategory: mock(async () => {}),
  invalidateCollection: mock(async () => {}),
  reconfigure: mock(async () => true),
  initialize: mock(async () => true),
  cleanup: mock(async () => {}),
  generateKey: mock((key: string, tenantId?: string | null) => {
    const tid =
      tenantId === undefined || tenantId === null || tenantId === "" ? "default" : String(tenantId);
    return `tenant:${tid}:${key}`;
  }),
  isNegativeHit: mock(() => false),
  recordMiss: mock(() => {}),
  setBootstrapping: mock(() => {}),
  isBootstrapping: mock(() => false),
  getRedisClient: mock(() => null),
  getStats: mock(() => ({
    hits: 0,
    misses: 0,
    evictions: 0,
    l1Hits: 0,
    l2Hits: 0,
    l1Size: 0,
    size: 0,
    deletes: 0,
  })),
  computeETag: mock(() => '"mock-etag"'),
  registerPrefetchPattern: mock(() => {}),
  getGlobalVersion: mock(async () => 0),
  incrementGlobalVersion: mock(async () => 1),
  getCollectionEpoch: mock((_collection: string, _tenantId?: string | null) => 0),
  bumpCollectionEpoch: mock((_collection: string, _tenantId?: string | null) => 1),
};
setGlobal("cacheService", cacheMock);
// Whitebox suites that exercise the real CacheService (not cacheMock):
// cache-service.test.ts, credential-auth-cache.test.ts
if (!isTestTarget("cache-service") && !isTestTarget("credential-auth-cache")) {
  moduleMock("@src/databases/cache/cache-service", () => ({
    cacheService: cacheMock,
    default: cacheMock,
    CacheCategory,
    CacheService: class CacheServiceMock {},
    getSessionCacheTTL: mock(() => 3600),
    getUserPermCacheTTL: mock(() => 60),
    getApiCacheTTL: mock(() => 300),
    REDIS_TTL_S: 300,
    USER_COUNT_CACHE_TTL_S: 300,
    SESSION_CACHE_TTL_S: 3600,
    API_CACHE_TTL_S: 300,
    USER_PERM_CACHE_TTL_S: 60,
    USER_COUNT_CACHE_TTL_MS: 300000,
    SESSION_CACHE_TTL_MS: 3600000,
    USER_PERM_CACHE_TTL_MS: 60000,
    API_CACHE_TTL_MS: 300000,
  }));
}

moduleMock("sharp", () => {
  const sharpInstance: any = {
    metadata: mock(() => Promise.resolve({ width: 100, height: 100, format: "jpeg" })),
    resize: mock(() => sharpInstance),
    // Support both Buffer and { data, info } (resolveWithObject) return shapes
    toBuffer: mock((opts?: { resolveWithObject?: boolean }) =>
      opts?.resolveWithObject
        ? Promise.resolve({ data: Buffer.from("mock-buffer"), info: { size: 42 } })
        : Promise.resolve(Buffer.from("mock-buffer")),
    ),
    jpeg: mock(() => sharpInstance),
    webp: mock(() => sharpInstance),
    avif: mock(() => sharpInstance),
    composite: mock(() => sharpInstance),
    rotate: mock(() => sharpInstance),
    flop: mock(() => sharpInstance),
    flip: mock(() => sharpInstance),
    extract: mock(() => sharpInstance),
    modulate: mock(() => sharpInstance),
    png: mock(() => sharpInstance),
    linear: mock(() => sharpInstance),
    grayscale: mock(() => sharpInstance),
    greyscale: mock(() => sharpInstance),
    recomb: mock(() => sharpInstance),
    blur: mock(() => sharpInstance),
    ensureAlpha: mock(() => sharpInstance),
  };
  sharpInstance.clone = mock(() => sharpInstance);
  const sharpMock = mock(() => sharpInstance);
  (sharpMock as any).cache = mock(() => {});
  (sharpMock as any).simd = mock(() => {});
  (sharpMock as any).concurrency = mock(() => {});
  return {
    default: sharpMock,
  };
});

// settingsExports already registered via top-level vi.mock; Bun mirror + global for tests.
const settingsMock = (settingsExports as any).__settingsMock ?? settingsExports;
if (!isTestTarget("settings-service")) {
  const factory = () => settingsExports;
  try {
    if (isBun && mock?.module) {
      const sPath = import.meta.resolve("@src/services/core/settings-service");
      mock.module(sPath, factory);
      mock.module(sPath.replace(".ts", ""), factory);
    }
  } catch {
    /* ignore */
  }
  moduleMock("@src/services/core/settings-service", factory);
  moduleMock("@services/core/settings-service", factory);
}
setGlobal("settingsMock", settingsMock);
setGlobal("mockLogger", mockLogger);

const mockAuditLog = {
  log: mock(() => Promise.resolve()),
  logEvent: mock(() => Promise.resolve()),
  getLogs: mock(() => Promise.resolve([])),
};
const mockDbAdapter = {
  auth: {
    getUserById: mock((id: string) => Promise.resolve({ success: true, data: { _id: id } })),
    getSessionTokenData: mock(() =>
      Promise.resolve({
        success: true,
        data: {
          user_id: "user123",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    ),
    getUserBySamlId: mock(() => Promise.resolve(null)),
    getUserByEmail: mock(() => Promise.resolve(null)),
    createUser: mock(() => Promise.resolve({ success: true, data: { _id: "new-user" } })),
    createSession: mock(() => Promise.resolve({ _id: "session-123" })),
    checkUser: mock(() => Promise.resolve(null)),
    getTokenByValue: mock(() => Promise.resolve(null)),
    updateToken: mock(() => Promise.resolve({ success: true })),
    deleteTokens: mock(() => Promise.resolve(1)),
    getAllTokens: mock(() => Promise.resolve({ success: true, data: [] })),
    createToken: mock(() => Promise.resolve({ success: true, data: "token-123" })),
    getTokenById: mock(() => Promise.resolve({ success: true, data: null })),
    blockTokens: mock(() => Promise.resolve(1)),
    unblockTokens: mock(() => Promise.resolve(1)),
    updateUserAttributes: mock(() => Promise.resolve({ success: true })),
    getAllUsers: mock(() => Promise.resolve({ success: true, data: [] })),
    getUserCount: mock(() => {
      const count = (globalThis as any).__mockUserCount ?? 10;
      return Promise.resolve(count);
    }),
    getAllRoles: mock(() =>
      Promise.resolve(
        (globalThis as any).__mockRoles ?? [{ _id: "admin", isAdmin: true, name: "Admin" }],
      ),
    ),
    ensureAuth: mock(() => Promise.resolve()),
    validateSession: mock((id: string) =>
      Promise.resolve({
        _id: id || "user123",
        email: "test@example.com",
        tenantId: "default",
        role: "admin",
        permissions: [],
      }),
    ),
    createSessionCookie: mock(() => ({
      name: "session",
      value: "secret",
      attributes: {},
    })),
    authInterface: {
      getUserById: mock((id: string) => Promise.resolve({ success: true, data: { _id: id } })),
    },
  },
  system: {
    preferences: {
      get: mock(() => Promise.resolve({ success: true, data: [] })),
      set: mock(() => Promise.resolve({ success: true })),
      getMany: mock(() => Promise.resolve({ success: true, data: {} })),
      setMany: mock(() => Promise.resolve({ success: true })),
      deleteMany: mock(() => Promise.resolve({ success: true })),
    },
    widgets: {
      getActiveWidgets: mock(() => Promise.resolve({ success: true, data: [] })),
    },
  },
  crud: {
    insert: mock(() => Promise.resolve({ success: true, data: { _id: "mock-id" } })),
    insertMany: mock(() => Promise.resolve({ success: true, data: [] })),
    update: mock(() => Promise.resolve({ success: true })),
    updateMany: mock(() => Promise.resolve({ success: true })),
    findOne: mock(() => Promise.resolve({ success: true, data: null })),
    findMany: mock(() => Promise.resolve({ success: true, data: [] })),
    findPage: mock(() =>
      Promise.resolve({
        success: true,
        data: { items: [], hasMore: false, pageSize: 50 },
      }),
    ),
    delete: mock(() => Promise.resolve({ success: true })),
    deleteMany: mock(() => Promise.resolve({ success: true })),
    upsert: mock(() => Promise.resolve({ success: true })),
    upsertMany: mock(() => Promise.resolve({ success: true })),
    count: mock(() => Promise.resolve({ success: true, data: 0 })),
    exists: mock(() => Promise.resolve({ success: true, data: true })),
  },
  media: {
    files: {
      upload: mock(() => Promise.resolve({ success: true, data: "test.jpg" })),
      delete: mock(() => Promise.resolve({ success: true })),
      deleteMany: mock(() => Promise.resolve({ success: true })),
      getByFolder: mock(() => Promise.resolve({ success: true, data: [] })),
      getByHash: mock(() => Promise.resolve({ success: true, data: null })),
    },
  },
  content: {
    nodes: {
      getStructure: mock(() => Promise.resolve({ success: true, data: [] })),
      create: mock(() => Promise.resolve({ success: true })),
      update: mock(() => Promise.resolve({ success: true })),
      delete: mock(() => Promise.resolve({ success: true })),
      deleteMany: mock(() => Promise.resolve({ success: true })),
      bulkUpdate: mock(() => Promise.resolve({ success: true })),
    },
    drafts: {
      getForContent: mock(() => Promise.resolve({ success: true, data: [] })),
    },
  },
  monitoring: {
    cache: {
      invalidateCategory: mock(() => Promise.resolve({ success: true })),
    },
  },
  collection: {
    getModel: mock(() => Promise.resolve({ _id: "mock_col", name: "mock_col", fields: [] })),
    createModel: mock(() => Promise.resolve({ success: true })),
    listSchemas: mock(() => Promise.resolve({ success: true, data: [] })),
  },
  batch: {
    execute: mock(() => Promise.resolve({ success: true, data: [] })),
  },
};
setGlobal("mockAuditLog", mockAuditLog);
setGlobal("mockDbAdapter", mockDbAdapter);

const dbMock = {
  dbAdapter: mockDbAdapter,
  auth: mockDbAdapter.auth,
  getDb: () => {
    if (process.env.VERBOSE_TESTS === "true") console.log("[setup.ts] dbMock.getDb called");
    return mockDbAdapter;
  },
  getAuth: () => mockDbAdapter.auth,
  getPrivateEnv: mock(
    () =>
      (globalThis as any).privateEnv || (globalThis as any).__privateEnv || { DB_TYPE: "mongodb" },
  ),
  setPrivateEnv: mock((env: any) => {
    (globalThis as any).privateEnv = env;
  }),
  loadPrivateConfig: mock(() =>
    Promise.resolve(
      (globalThis as any).privateEnv || (globalThis as any).__privateEnv || { DB_TYPE: "mongodb" },
    ),
  ),
  clearPrivateConfigCache: mock(() => {}),
  initializeWithConfig: mock(() => Promise.resolve({ status: "success" })),
  isDbConnected: mock(() => true),
  reinitializeSystem: mock(() => Promise.resolve({ status: "initialized" })),
  initConnection: mock(() => Promise.resolve()),
  getDbInitPromise: mock(() => Promise.resolve()),
  ensureFullInitialization: mock(() => Promise.resolve()),
  resetDbInitPromise: mock(() => {}),
  dbInitPromise: Promise.resolve(),
  collection: {
    getModel: mock(() =>
      Promise.resolve({
        _id: "mock_collection",
        name: "mock_collection",
        fields: [],
      }),
    ),
    createModel: mock(() => Promise.resolve({ success: true })),
    listSchemas: mock(() => Promise.resolve({ success: true, data: [] })),
  },
  batch: {
    execute: mock(() => Promise.resolve({ success: true, data: [] })),
  },
  crud: mockDbAdapter.crud,
  content: mockDbAdapter.content,
  media: mockDbAdapter.media,
  system: mockDbAdapter.system,
  monitoring: mockDbAdapter.monitoring,
  loadSettingsFromDB: mock(() => Promise.resolve(true)),
  isAuthReady: () => true,
};
const dbFactory = () => ({
  dbAdapter: mockDbAdapter,
  auth: mockDbAdapter.auth,
  getDb: dbMock.getDb,
  getAuth: dbMock.getAuth,
  getDbInitPromise: dbMock.getDbInitPromise,
  ensureFullInitialization: dbMock.ensureFullInitialization,
  getPrivateEnv: dbMock.getPrivateEnv,
  loadPrivateConfig: mock(() => Promise.resolve({})),
  reinitializeSystem: mock(() => Promise.resolve({})),
  resetDbInitPromise: mock(() => {}),
  dbInitPromise: Promise.resolve({}),
  isDbConnected: mock(() => true),
  shutdownSystem: mock(() => Promise.resolve()),
  default: dbMock,
});

if (!isBenchmark && ENABLE_MOCKS) {
  try {
    const dbPath = import.meta.resolve("@src/databases/db");
    mock.module(dbPath, dbFactory);
    mock.module(dbPath.replace(".ts", ""), dbFactory);
  } catch {
    /* ignore */
  }
  moduleMock("@src/databases/db", dbFactory);
  moduleMock("@databases/db", dbFactory);
}
setGlobal("auth", dbMock.auth);

moduleMock("@src/services/security/audit-service", () => {
  const AuditEventType = {
    USER_LOGIN: "user_login",
    USER_LOGOUT: "user_logout",
    USER_LOGIN_FAILED: "user_login_failed",
    PASSWORD_CHANGE: "password_change",
    PASSWORD_RESET: "password_reset",
    PASSWORD_RESET_REQUESTED: "password_reset_requested",
    PASSWORD_RESET_SUCCESS: "password_reset_success",
    TWO_FACTOR_ENABLED: "two_factor_enabled",
    TWO_FACTOR_DISABLED: "two_factor_disabled",
    USER_CREATED: "user_created",
    USER_UPDATED: "user_updated",
    USER_DELETED: "user_deleted",
    USER_ROLE_CHANGED: "user_role_changed",
    USER_STATUS_CHANGED: "user_status_changed",
    TOKEN_CREATED: "token_created",
    TOKEN_UPDATED: "token_updated",
    TOKEN_DELETED: "token_deleted",
    TOKEN_USED: "token_used",
    TOKEN_MISUSE: "token_misuse",
    DATA_EXPORT: "data_export",
    DATA_IMPORT: "data_import",
    DATA_DELETION: "data_deletion",
    UNAUTHORIZED_ACCESS: "unauthorized_access",
    PRIVILEGE_ESCALATION: "privilege_escalation",
    DATA_BREACH_ATTEMPT: "data_breach_attempt",
    SUSPICIOUS_ACTIVITY: "suspicious_activity",
    WEBHOOK_TRIGGERED: "webhook_triggered",
    WORKFLOW_TRANSITION: "workflow_transition",
    ROLE_MUTATED: "role_mutated",
    ROLE_DELETED: "role_deleted",
  };
  return {
    auditLogService: mockAuditLog,
    AuditEventType,
    default: mockAuditLog,
  };
});

const mockEventBus = {
  on: mock(() => {}),
  off: mock(() => {}),
  emit: mock(() => {}),
  once: mock(() => {}),
  removeAllListeners: mock(() => {}),
};
setGlobal("mockEventBus", mockEventBus);
moduleMock("@src/services/background/automation/event-bus", () => ({
  eventBus: mockEventBus,
  default: mockEventBus,
}));

const SetupState = {
  MISSING_CONFIG: "MISSING_CONFIG",
  MISSING_ADMIN: "MISSING_ADMIN",
  COMPLETE: "COMPLETE",
};

let setupStateValue = SetupState.COMPLETE;
const mockSetupCheck = {
  isSetupComplete: mock(() => setupStateValue === SetupState.COMPLETE),
  isSetupFullyComplete: mock(() => setupStateValue === SetupState.COMPLETE),
  isSetupCompleteAsync: mock(async () => setupStateValue === SetupState.COMPLETE),
  getSetupState: mock(async () => setupStateValue),
  peekSetupState: mock(() => null),
  SetupState,
  invalidateSetupCache: mock(() => {}),
  setSetupComplete: mock((val: boolean) => {
    setupStateValue = val ? SetupState.COMPLETE : SetupState.MISSING_CONFIG;
  }),
  setSetupState: mock((state: any) => {
    setupStateValue = state;
  }),
  getTestSecret: mock(() => "SVELTYCMS_TEST_SECRET_2026"),
  isBootstrapRoute: mock((p: string) => {
    const path = p.startsWith("/") ? p.slice(1) : p;
    return (
      path === "" ||
      path === "setup" ||
      path.startsWith("setup/") ||
      path === "login" ||
      path.startsWith("login/") ||
      path.startsWith("api/system/") ||
      path.startsWith("api/dashboard/") ||
      path.startsWith("api/setup/") ||
      path.startsWith("api/auth/") ||
      path.startsWith("api/content/version") ||
      path.startsWith("api/settings/public") ||
      path.startsWith("api/debug/") ||
      path.startsWith("_") ||
      path.startsWith("static") ||
      path.startsWith("assets") ||
      path.startsWith(".well-known") ||
      path === "favicon.ico"
    );
  }),
};
moduleMock("@utils/server/setup-check", () => mockSetupCheck);
moduleMock("@src/utils/server/setup-check", () => mockSetupCheck);
setGlobal("mockSetupCheck", mockSetupCheck);

moduleMock("@src/widgets/scanner", () => ({
  coreModules: {},
  customModules: {},
  marketplaceModules: {},
  widgetComponents: {},
  allWidgetModules: {},
  getComponentLoader: () => null,
  getWidgetNameFromPath: (path: string) => path.split("/").at(-2) || null,
  widgetNameToFolder,
  getCustomWidgetNames: () => [],
}));

moduleMock("@node-saml/node-saml", () => ({
  SAML: mock(function (this: any) {
    this.getAuthorizeUrlAsync = mock(() =>
      Promise.resolve("https://idp.example.com/sso?SAMLRequest=..."),
    );
    this.validatePostResponseAsync = mock(() =>
      Promise.resolve({
        profile: {
          nameID: "user@test.com",
          attributes: {
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": "user@test.com",
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": "Test",
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": "User",
          },
        },
      }),
    );
  }),
}));

// Node built-ins mocks for Bun
const mockSpawn = mock(() => ({
  on: mock((event: string, cb: any) => {
    if (event === "exit") setTimeout(() => (cb as (code: number) => void)(0), 0);
  }),
  stderr: { on: mock(() => {}) },
}));

const mockExec = mock((_cmd: string, cb: any) => {
  if (cb) setTimeout(() => cb(null, { stdout: "ok", stderr: "" }), 0);
  return { on: mock(() => {}) };
});

const mockLookup = mock(async (hostname: string) => {
  let ip = "8.8.8.8";
  if (hostname.includes("loopback") || hostname.includes("localhost")) ip = "127.0.0.1";
  else if (hostname.includes("internal")) ip = "10.0.1.5";
  return { address: ip, family: 4 };
});

// Provide execSync/spawnSync so accidental imports (or suite argv leakage) do not
// throw "Export named 'execSync' not found" under the unit mock layer.
const mockExecSync = mock(() => Buffer.from(""));
const mockSpawnSync = mock(() => ({ status: 0, stdout: Buffer.from(""), stderr: Buffer.from("") }));
moduleMock("node:child_process", () => ({
  spawn: mockSpawn,
  exec: mockExec,
  execSync: mockExecSync,
  spawnSync: mockSpawnSync,
  default: {
    spawn: mockSpawn,
    exec: mockExec,
    execSync: mockExecSync,
    spawnSync: mockSpawnSync,
  },
}));

moduleMock("node:dns/promises", () => ({
  lookup: mockLookup,
  default: { lookup: mockLookup },
}));

if (!isTestTarget("metrics-service")) {
  moduleMock("@src/services/observability/metrics-service", () => ({
    metricsService: mockMetricsService,
    default: { metricsService: mockMetricsService },
  }));
  (globalThis as any).__SVELTY_METRICS_INSTANCE__ = mockMetricsService;
  setGlobal("metricsService", mockMetricsService);
}

const includesSecurityResponseServiceTest = process.argv.some((arg) =>
  arg.replace(/\\/g, "/").includes("security-response-service"),
);

if (!includesSecurityResponseServiceTest && !isTestTarget("security-response-service")) {
  try {
    const rsPath = import.meta.resolve("@src/services/security/response-service");
    mock.module(rsPath, () => ({
      securityResponseService: mockSecurityResponseService,
      default: { securityResponseService: mockSecurityResponseService },
    }));
  } catch {
    /* ignore */
  }
  moduleMock("@src/services/security/response-service", () => ({
    securityResponseService: mockSecurityResponseService,
    default: { securityResponseService: mockSecurityResponseService },
  }));
  (globalThis as any).__SVELTY_SECURITY_INSTANCE__ = mockSecurityResponseService;
  setGlobal("securityResponseService", mockSecurityResponseService);
}
// This ensures that tests don't pollute each other via globalThis or module-level shared state
if (typeof (globalThis as any).beforeEach !== "undefined") {
  try {
    (globalThis as any).beforeEach(async () => {
      // Reset environment overrides
      (globalThis as any).privateEnv = undefined;
      (globalThis as any).__privateEnv = undefined;

      // Reset common internal mock state
      (globalThis as any).__mockUserCount = undefined;
      (globalThis as any).__mockRoles = undefined;

      // Reset metrics and cache mocks if available
      if ((globalThis as any).metricsService && (globalThis as any).metricsService.reset) {
        (globalThis as any).metricsService.reset();
      }
      if ((globalThis as any).cacheService) {
        const cs = (globalThis as any).cacheService;
        if (cs.get && cs.get.mockClear) cs.get.mockClear();
        if (cs.set && cs.set.mockClear) cs.set.mockClear();
        if (cs.delete && cs.delete.mockClear) cs.delete.mockClear();
      }

      // Reset dbAdapter mock state
      if ((globalThis as any).mockDbAdapter) {
        const db = (globalThis as any).mockDbAdapter;
        const resetMocks = (obj: any) => {
          for (const key in obj) {
            if (obj[key] && typeof obj[key] === "function" && obj[key].mockClear) {
              obj[key].mockClear();
            } else if (obj[key] && typeof obj[key] === "object") {
              resetMocks(obj[key]);
            }
          }
        };
        resetMocks(db);
      }

      // Invalidate authorization caches to prevent state leak in hooks
      try {
        const { invalidateUserCountCache, invalidateRolesCache } =
          await import("@src/hooks/handle-authorization");
        await invalidateUserCountCache();
        await invalidateRolesCache();
      } catch {
        // Ignore if not available in current test context
      }

      // Restore all spies/mocks if vishim is active
      /*
      if ((globalThis as any).vi && (globalThis as any).vi.restoreAllMocks) {
        (globalThis as any).vi.restoreAllMocks();
      }
      */
    });
  } catch (e) {
    if (typeof Bun === "undefined") throw e;
  }
}

if (process.env.VERBOSE_TESTS) {
  console.log("âœ… Master Test Setup Loaded - (AGNOSTIC RUNES + AUTO-RESET)");
}
