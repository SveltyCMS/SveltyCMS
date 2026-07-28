/**
 * @file vitest.config.ts
 * @description Vitest configuration. Path aliases from path-aliases.ts.
 */

import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathAliases } from "./path-aliases";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const resolvedAliases = Object.fromEntries(
  Object.entries(pathAliases).map(([key, value]) => [key, path.resolve(__dirname, value)]),
);

/** Local runs: cap forks to reduce Windows thrash. CI keeps Vitest defaults. */
const localMaxWorkers = Math.min(4, Math.max(1, os.cpus().length - 1));

export default defineConfig({
  plugins: [svelte() as any],
  resolve: {
    alias: {
      ...resolvedAliases,
      "$app/environment": path.resolve(__dirname, "tests/unit/mocks/$app/environment.ts"),
      "$app/navigation": path.resolve(__dirname, "tests/unit/mocks/$app/navigation.ts"),
      "$app/state": path.resolve(__dirname, "tests/unit/mocks/$app/state.ts"),
      "$app/paths": path.resolve(__dirname, "tests/unit/mocks/$app/paths.ts"),
      "$app/forms": path.resolve(__dirname, "tests/unit/mocks/$app/forms.ts"),
      "$app/server": path.resolve(__dirname, "tests/unit/mocks/$app/server.ts"),
      "$env/dynamic/private": path.resolve(__dirname, "tests/unit/mocks/$env/dynamic/private.ts"),
      "sveltekit-rate-limiter/server": path.resolve(
        __dirname,
        "node_modules/sveltekit-rate-limiter/dist/server/index.js",
      ),
      "bun:sqlite": path.resolve(__dirname, "tests/unit/mocks/bun-sqlite.ts"),
    },
  },
  define: { "import.meta.env.SSR": "true" },
  test: {
    globals: true,
    // API dispatcher / GraphQL / media security tests load large modules; under full-suite
    // fork contention on Windows they routinely need >15s even when ~5s alone.
    testTimeout: 30000,
    setupFiles: [path.resolve(__dirname, "tests/unit/setup.ts")],
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["**/*.bun.ts", "**/*.bun.test.ts", "node_modules", ".svelte-kit"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // P0 packages only — enterprise A++ gate focuses on security/core, not vanity % of all src
      include: [
        "src/hooks/**/*.ts",
        "src/databases/auth/**/*.ts",
        "src/utils/test-bypass.server.ts",
        "src/utils/error-handling.ts",
        "src/utils/security/**/*.ts",
        "src/routes/api/[...path]/+server.ts",
      ],
      exclude: ["src/paraglide/**", "src/**/*.d.ts", "src/**/*.test.ts"],
      // Applied when running `bun run test:unit:coverage` — keeps P0 floors honest without
      // blocking full-suite unit runs that omit --coverage.
      thresholds: {
        lines: 55,
        functions: 50,
        branches: 45,
        statements: 55,
      },
    },
    pool: "forks",
    // Cap fork parallelism to reduce Windows I/O thrash during heavy API unit suites.
    ...(process.env.CI ? {} : { maxWorkers: localMaxWorkers }),
    server: {
      deps: {
        inline: [/@sveltejs\/kit/, /sveltekit-rate-limiter/],
      },
    },
  },
});
