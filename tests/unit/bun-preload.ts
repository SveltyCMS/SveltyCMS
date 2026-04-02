/**
 * @file tests/unit/bun-preload.ts
 * @description Global preload script for Bun unit tests (Svelte 5 + SvelteKit).
 */

// ─────────────────────────────────────────────────────────────
// SVELTE 5 RUNES MOCK (MUST BE DEFINED BEFORE ANY IMPORTS)
// ─────────────────────────────────────────────────────────────
const createRuneMock = (initial?: any) => {
  let value = initial;

  const state = (newVal?: any) => {
    if (newVal !== undefined) value = newVal;
    return value;
  };

  // Basic support for $state.raw and $state.snapshot
  state.raw = (val: any) => val;
  state.snapshot = (val: any) => structuredClone?.(val) ?? val;

  return state;
};

(globalThis as any).$state = createRuneMock;
(globalThis as any).$derived = (fn: any) => (typeof fn === "function" ? fn() : fn);
(globalThis as any).$derived.by = (fn: () => any) => fn(); // for $derived.by(() => ...)

(globalThis as any).$effect = (fn: any) => {
  // In tests we usually don't want real side effects
  const cleanup = fn();
  return typeof cleanup === "function" ? cleanup : undefined;
};

(globalThis as any).$props = () => ({});
(globalThis as any).$bindable = (fallback?: any) => ({ ...fallback });
(globalThis as any).$inspect = () => ({});
(globalThis as any).$effect.root = (fn: any) => fn(); // sometimes used internally

// ─────────────────────────────────────────────────────────────
// SVELTE COMPILER PLUGIN FOR BUN
// ─────────────────────────────────────────────────────────────
import { plugin } from "bun";
import { compile, compileModule } from "svelte/compiler";

const transpiler = new Bun.Transpiler({ loader: "ts" });

plugin({
  name: "svelte-loader",
  setup(build) {
    // 1. .svelte files (components)
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();

      const { js, css } = compile(source, {
        filename: path,
        generate: "server", // Important for most unit tests
        dev: false,
        css: "injected", // or "external" if you handle CSS separately
      });

      let contents = js.code;

      // Ensure it has a default export (some Svelte 5 outputs are named functions)
      if (!contents.includes("export default")) {
        const match = contents.match(/function\s+([A-Za-z0-9_$]+)/);
        if (match?.[1]) {
          contents += `\nexport default ${match[1]};`;
        }
      }

      // Optional: inject CSS if present (helps with tests using <style>)
      if (css?.code) {
        contents = `// Injected CSS from ${path}\n${css.code}\n\n${contents}`;
      }

      return { contents, loader: "js" };
    });

    // 2. .svelte.ts / .svelte.js (Svelte 5 modules / runes modules)
    build.onLoad({ filter: /\.svelte\.(ts|js)$/ }, async ({ path }) => {
      let source = await Bun.file(path).text();

      if (path.endsWith(".ts")) {
        source = await transpiler.transform(source);
      }

      const { js } = compileModule(source, {
        filename: path,
        dev: false,
      });

      return { contents: js.code, loader: "js" };
    });
  },
});

// ─────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────
import { mock } from "bun:test";
import { vi } from "vitest"; // kept for compatibility if you mix styles

// SvelteKit environment
mock.module("$app/environment", () => ({
  browser: false,
  dev: true,
  building: false,
  version: "test",
}));

// Metrics service mock
const mockMetrics = {
  recordMetric: vi.fn(),
  incrementApiRequests: vi.fn(),
  incrementApiErrors: vi.fn(),
  recordResponseTime: vi.fn(),
  recordHookExecutionTime: vi.fn(),
  getReport: vi.fn().mockReturnValue({}),
};

vi.mock("@src/services/metrics-service", () => ({
  metricsService: mockMetrics,
}));

// Also expose globally if any code accesses it directly
(globalThis as any).metricsService = mockMetrics;

// Optional: reset mocks between tests
import { beforeEach } from "bun:test";

beforeEach(() => {
  vi.clearAllMocks();
});
