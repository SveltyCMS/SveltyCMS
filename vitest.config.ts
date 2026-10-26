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
/**
 * Full-source mode (manual, not the gate): widens the report to every src file so
 * it can be unioned with the component/DOM report. Thresholds are P0-only and
 * are disabled in this mode.
 */
const coverageAll = process.env.COVERAGE_ALL === "1";
const p0CoverageInclude = [
  "src/hooks/**/*.ts",
  "src/databases/auth/**/*.ts",
  "src/utils/test-bypass.server.ts",
  "src/utils/error-handling.ts",
  "src/utils/security/**/*.ts",
  "src/routes/api/[...path]/+server.ts",
];

/**
 * Write-path coverage profile (`COVERAGE_WRITE_PATH=1`).
 *
 * The P0 gate above only instruments the security/core set, so per-path floors
 * for the write path would match zero files there — istanbul reports an empty
 * coverage map as 100%, i.e. the floor would pass vacuously. This profile adds
 * the three write-path areas to the report and enforces the floors below.
 *
 * Measured 2026-10-23 on the full unit suite with this profile enabled
 * (`COVERAGE_WRITE_PATH=1 bun run test:coverage`):
 *
 * | Glob                             | Lines | Functions | Branches | Statements |
 * | :------------------------------- | ----: | --------: | -------: | ---------: |
 * | `src/databases/core/**`          | 54.58 |     44.34 |    50.47 |      53.38 |
 * | `src/databases/mariadb/**`       | 20.00 |     21.29 |    10.63 |      19.50 |
 * | `src/services/sdk/namespaces/**` | 63.15 |     54.55 |    51.29 |      60.34 |
 *
 * Floors sit ~2 points below the measurement (same margin as the P0 gate) so an
 * ordinary refactor does not red the profile while a real regression does. The
 * global thresholds are intentionally omitted in this mode: the adapters are
 * exercised by the integration suites, so widening the include set to the write
 * path drops the union to 63.01/56.12/54.71/61.19 — below the P0 floors. Same
 * rationale as `COVERAGE_ALL`; the P0 gate itself is unchanged.
 */
const coverageWritePath = process.env.COVERAGE_WRITE_PATH === "1";
const writePathCoverageInclude = [
  "src/databases/core/**",
  "src/databases/mariadb/**",
  "src/services/sdk/namespaces/**",
];

/**
 * Vitest resolves these keys against the `pathe`-normalized relative path of every
 * covered file, i.e. forward slashes on all platforms (Windows included). Keep the
 * keys slash-separated: a `[\\/]` separator class also matches flat files, but the
 * `**` that follows it stops at the next separator, so a nested subdirectory
 * (`namespaces/collections/**`) silently drops out of the floor.
 */
const writePathThresholds = {
  "src/databases/core/**": {
    lines: 52,
    functions: 42,
    branches: 48,
    statements: 51,
  },
  "src/databases/mariadb/**": {
    lines: 18,
    functions: 19,
    branches: 8,
    statements: 17,
  },
  "src/services/sdk/namespaces/**": {
    lines: 61,
    functions: 52,
    branches: 49,
    statements: 58,
  },
};

/**
 * Local HTML coverage is opt-in: the v8 HTML reporter intermittently aborts on
 * Windows after writing the tables (exit 1 with no diagnostic), which made the
 * local coverage gate unusable. `text-summary` + `json` are stable and carry
 * every metric the threshold check needs; set `COVERAGE_HTML=1` for the
 * browsable report. The per-file `text` table is also avoided for the same
 * reason (very wide lines abort the reporter on some terminals).
 */
const coverageReporters = isCI
  ? ["text-summary", "json"]
  : process.env.COVERAGE_HTML === "1"
    ? ["text-summary", "json", "html"]
    : ["text-summary", "json"];

const resolvedAliases = Object.fromEntries(
  Object.entries(pathAliases).map(([key, value]) => [key, path.resolve(__dirname, value)]),
);

/**
 * Local runs: dynamically scale worker pool to available CPU cores with environment override.
 * Leaves headroom for OS/UI responsive operations while utilizing multi-core silicon.
 */
const cpuCount = os.cpus().length;
const defaultWorkers = cpuCount >= 16 ? Math.min(16, cpuCount - 4) : Math.max(1, cpuCount - 1);
const localMaxWorkers = process.env.VITEST_MAX_WORKERS
  ? parseInt(process.env.VITEST_MAX_WORKERS, 10)
  : defaultWorkers;

/**
 * v8 coverage is memory-heavy: on a high-core Windows box, a 4-fork coverage
 * run still hit an intermittent STATUS_STACK_BUFFER_OVERRUN (0xC0000409)
 * under the pre-push gate even though the same run passed standalone. A gate
 * must not depend on that race, so local coverage runs use two workers. CI
 * runners are 4 vCPU and keep Vitest's own pool.
 */
const isCoverageRun = process.argv.includes("--coverage");
const coverageMaxWorkers = Math.min(localMaxWorkers, 2);

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
    // Same reason: those suites import the whole `+server` dispatcher inside
    // `beforeAll`, so the 10s default hookTimeout failed entire files with no
    // test name under fork contention (saml, export-import-security).
    hookTimeout: 30000,
    setupFiles: [path.resolve(__dirname, "tests/unit/setup.ts")],
    // Widget-local suites live beside their widget (custom widgets are glob-loaded,
    // so the tests ship with the widget rather than in tests/unit).
    include: ["tests/unit/**/*.test.ts", "src/widgets/custom/**/tests/**/*.test.ts"],
    // DOM-interaction suites mount real Svelte components (client runtime). They
    // run via `vitest.dom.config.ts` (`bun run test:unit:components`) because this
    // config forces SSR resolution (`import.meta.env.SSR: "true"`).
    exclude: [
      "**/*.bun.ts",
      "**/*.bun.test.ts",
      "tests/unit/components/dom/**",
      "node_modules",
      ".svelte-kit",
    ],
    // CI: dots + annotations; local: full reporter.
    reporters: isCI ? ["dot", "github-actions"] : ["default"],
    // Only failing tests print their captured console/stdout — locally too. Passing
    // tests that log (config-cli dumps JSON, dispatcher suites log requests) otherwise
    // flood the terminal and cost real I/O time on Windows. Debug with `--silent=false`.
    silent: "passed-only",
    coverage: {
      provider: "v8",
      reportsDirectory: "./.vitest/coverage",
      reporter: coverageReporters,
      // P0 packages only — enterprise A++ gate focuses on security/core, not vanity % of all src.
      // COVERAGE_ALL=1 widens the scope for the unit ∪ DOM union report.
      include: coverageAll
        ? ["src/**/*.{ts,svelte}"]
        : coverageWritePath
          ? [...p0CoverageInclude, ...writePathCoverageInclude]
          : p0CoverageInclude,
      exclude: ["src/paraglide/**", "src/**/*.d.ts", "src/**/*.test.ts"],
      // Applied when running `bun run test:unit:coverage` — keeps P0 floors
      // honest without blocking full-suite unit runs that omit --coverage.
      // Measured 2026-10-18 after the security-core suites (71+ files): lines
      // 74.01, functions 74.84, branches 62.82, statements 72.14. Floors sit
      // ~2 points below so ordinary refactors do not red the gate while a real
      // coverage regression does.
      thresholds: coverageAll
        ? {}
        : coverageWritePath
          ? writePathThresholds
          : {
              lines: 72,
              functions: 72,
              branches: 60,
              statements: 70,
            },
    },
    pool: "forks",
    isolate: true,
    // NOTE: `isolate: false` is NOT viable here (measured 2026-09-18: 37 files /
    // 147 tests fail — setup.ts global mocks and module-level singletons leak
    // across files). Keep per-file isolation; reduce import cost instead.
    // Worker args are top-level in Vitest 5 (`poolOptions.forks` is gone).
    execArgv: ["--enable-source-maps"],
    // Cap fork parallelism to reduce Windows I/O thrash during heavy API unit suites.
    // Coverage runs get a smaller pool: v8 instrumentation + 16 forks crashed a worker.
    ...(isCI ? {} : { maxWorkers: isCoverageRun ? coverageMaxWorkers : localMaxWorkers }),
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
