/**
 * @file vitest.mutation.config.ts
 * @description Vitest config for the mutation harness. Runs ONLY `tests/mutation/**`.
 *
 * Kept separate from `vitest.config.ts` so the harness is not part of `test:unit`
 * or `test:unit:coverage`: its temp-file dynamic `import()` is incompatible with
 * v8 coverage instrumentation (intermittent worker failures). `bun run test:mutation`
 * targets this config explicitly.
 */

import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathAliases } from "./path-aliases.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolvedAliases = Object.fromEntries(
  Object.entries(pathAliases).map(([key, value]) => [key, path.resolve(__dirname, value)]),
);

export default defineConfig({
  resolve: {
    alias: {
      ...resolvedAliases,
      "$app/environment": path.resolve(__dirname, "tests/unit/mocks/$app/environment.ts"),
      "$app/env": path.resolve(__dirname, "tests/unit/mocks/$app/environment.ts"),
      "$app/navigation": path.resolve(__dirname, "tests/unit/mocks/$app/navigation.ts"),
      "$app/state": path.resolve(__dirname, "tests/unit/mocks/$app/state.ts"),
      "$app/paths": path.resolve(__dirname, "tests/unit/mocks/$app/paths.ts"),
      "$app/forms": path.resolve(__dirname, "tests/unit/mocks/$app/forms.ts"),
      "$app/server": path.resolve(__dirname, "tests/unit/mocks/$app/server.ts"),
      "bun:sqlite": path.resolve(__dirname, "tests/unit/mocks/bun-sqlite.ts"),
    },
  },
  define: { "import.meta.env.SSR": "true" },
  test: {
    globals: true,
    passWithNoTests: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: [path.resolve(__dirname, "tests/unit/setup.ts")],
    include: ["tests/mutation/**/*.test.ts"],
    pool: "forks",
    isolate: true,
    silent: "passed-only",
  },
});
