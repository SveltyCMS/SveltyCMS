/**
 * @file vitest.dom.config.ts
 * @description Client-side component interaction tests (jsdom, real Svelte 5 mount).
 *
 * The default `vitest.config.ts` forces SSR resolution (`import.meta.env.SSR: "true"`)
 * because the unit suite imports server modules. Component tests need the opposite:
 * the browser build of Svelte plus a DOM environment, otherwise `mount()` resolves to
 * `svelte/index-server.js` and throws `lifecycle_function_unavailable`.
 */

import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathAliases } from "./path-aliases.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const resolvedAliases = Object.fromEntries(
  Object.entries(pathAliases).map(([key, value]) => [key, path.resolve(__dirname, value)]),
);

export default defineConfig({
  plugins: [svelte({ configFile: false } as any)],
  resolve: {
    // Browser resolution + client Svelte build. Without these, Vitest's SSR
    // transform imports the server entry and `mount()` is a stub that throws.
    conditions: ["browser"],
    alias: {
      ...resolvedAliases,
      "$app/env": path.resolve(__dirname, "tests/unit/components/dom/mocks/app-env.ts"),
      "$app/environment": path.resolve(__dirname, "tests/unit/components/dom/mocks/app-env.ts"),
      "$app/navigation": path.resolve(__dirname, "tests/unit/mocks/$app/navigation.ts"),
      "$app/state": path.resolve(__dirname, "tests/unit/mocks/$app/state.ts"),
      "$app/paths": path.resolve(__dirname, "tests/unit/mocks/$app/paths.ts"),
      "$app/forms": path.resolve(__dirname, "tests/unit/mocks/$app/forms.ts"),
      "$app/server": path.resolve(__dirname, "tests/unit/mocks/$app/server.ts"),
    },
  },
  define: {
    "import.meta.env.SSR": "false",
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/unit/components/dom/**/*.test.ts"],
    setupFiles: [path.resolve(__dirname, "tests/unit/components/dom/setup.ts")],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Component tests share one jsdom document; parallel forks are safe but add
    // startup cost. Keep the suite fast without masking cross-test DOM leaks.
    pool: "forks",
    isolate: true,
    // Separate report from the unit run: the client build's statement maps are
    // incompatible with the SSR unit maps, so the two are unioned per file by
    // scripts/merge-coverage.ts instead of being merged statement-by-statement.
    coverage: {
      provider: "v8",
      reportsDirectory: "./.vitest/coverage-dom",
      reporter: ["text-summary", "json"],
      include: ["src/**/*.{ts,svelte}"],
      exclude: ["src/paraglide/**", "src/**/*.d.ts", "src/**/*.test.ts", "src/**/tests/**"],
    },
  },
});
