/**
 * @file vitest.config.ts
 * @description Vitest configuration. Path aliases from path-aliases.ts.
 *
 * CI output: compact `dot` + GitHub annotations; hide console spam from passed tests.
 * Local: default reporter with full logs for debugging.
 */

import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathAliases } from "./path-aliases.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isCI = process.env.CI === "true" || process.env.CI === "1";

const resolvedAliases = Object.fromEntries(
  Object.entries(pathAliases).map(([key, value]) => [key, path.resolve(__dirname, value)]),
);

/** Local runs: cap forks to reduce Windows thrash. CI keeps Vitest defaults. */
const localMaxWorkers = Math.min(4, Math.max(1, os.cpus().length - 1));

export default defineConfig({
  plugins: [svelte({ configFile: false } as any)],
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
      "$env/dynamic/private": path.resolve(__dirname, "tests/unit/mocks/$env/dynamic/private.ts"),
      "bun:sqlite": path.resolve(__dirname, "tests/unit/mocks/bun-sqlite.ts"),
    },
  },
  define: { "import.meta.env.SSR": "true" },
  test: {
    globals: true,
    fsModuleCache: true,
    passWithNoTests: true,
    slowTestThreshold: 1000,
    // API dispatcher / GraphQL / media security tests load large modules; under full-suite
    // fork contention on Windows they routinely need >15s even when ~5s alone.
    testTimeout: 30000,
    setupFiles: [path.resolve(__dirname, "tests/unit/setup.ts")],
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["**/*.bun.ts", "**/*.bun.test.ts", "node_modules", ".svelte-kit"],
    // CI: dots + annotations; silence console from passing tests (failures still print logs)
    reporters: isCI ? ["dot", "github-actions"] : ["default"],
    silent: isCI ? "passed-only" : false,
    coverage: {
      provider: "v8",
      reportsDirectory: "./.vitest/coverage",
      reporter: isCI ? ["text-summary", "json"] : ["text", "json", "html"],
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
        lines: 48,
        functions: 47,
        branches: 40,
        statements: 47,
      },
    },
    pool: "forks",
    // Cap fork parallelism to reduce Windows I/O thrash during heavy API unit suites.
    ...(isCI ? {} : { maxWorkers: localMaxWorkers }),
    forks: {
      execArgv: ["--enable-source-maps"],
    },
    env: {
      TEST_MODE: "true",
      QUIET: "true",
    },
    diff: {
      truncateThreshold: 80,
    },
    server: {
      deps: {
        inline: [
          /@sveltejs\/kit/,
          // Single graphql realm under forks: graphql ships CJS+ESM builds (no
          // "exports" map), so schema types built by @graphql-tools/schema can
          // end up in a different realm than rules/predicates from the ESM
          // build (e.g. NoSchemaIntrospectionCustomRule → isNonNullType crash).
          // Inlining the Yoga chain forces one vite-processed instance.
          /^graphql$/,
          /graphql-yoga/,
          /@graphql-tools\//,
          /@envelop\//,
          /graphql-jit/,
        ],
      },
    },
  },
});
