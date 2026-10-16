/**
 * @file tests/route-test-coverage.ts
 * @description Route → test coverage manifest and verification for the admin `(app)` surface.
 *
 * The reported regressions (token edit/delete resolving the wrong identifier, collection
 * edit/delete not persisting, sign-up invite-token recovery, the error boundary showing
 * "page moved" on a 500) all escaped the three test layers because no gate answered the
 * simplest question: **does every admin route have at least one test at some layer?**
 *
 * This module makes that question CI-enforced. It has two directions of parity:
 *
 *  1. **Inventory parity** — every route group discovered on disk (a directory under
 *     `src/routes/(app)` with a `+page.server.ts` load boundary) must appear in
 *     `APP_ROUTE_COVERAGE`. Adding a route without a manifest row fails the gate.
 *  2. **Coverage parity** — every test file listed for a route must exist and contain at
 *     least one `it`/`test`/`setup` case. Deleting/emptying a covering test fails the gate.
 *
 * ### Features:
 * - deterministic route-group enumeration from disk (no hand-maintained route list to drift)
 * - explicit route → test-file manifest (layers are not distinguished; any layer covers)
 * - structured gaps for `missing-test-file`, `untracked-route`, `stale-route`, `empty-file`
 * - vitest-compatible (no `bun:test` imports)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export interface AppRouteCoverageEntry {
  /** Route group path relative to `src/routes/(app)`, using forward slashes. */
  route: string;
  /** Test files (relative to project root) that must cover this route at any layer. */
  testFiles: string[];
}

export type AppRouteCoverageGapType =
  | "untracked-route"
  | "stale-route"
  | "missing-test-file"
  | "empty-test-file";

export interface AppRouteCoverageGap {
  route: string;
  type: AppRouteCoverageGapType;
  filePath?: string;
  message: string;
}

export interface AppRouteCoverageResult {
  gaps: AppRouteCoverageGap[];
  totalRoutes: number;
  passed: boolean;
}

/** Directory components of the admin surface, relative to the project root. */
const APP_ROUTES_DIR = ["src", "routes", "(app)"];

/** A directory is a route group when it owns a server load boundary. */
const ROUTE_BOUNDARY_FILE = "+page.server.ts";

/** Regex matching test-case declarations: it(), test(), or setup() from Playwright. */
const TEST_CASE_RE = /(?:^|\s)(?:it|test|setup)\s*\(["'`]/gm;

/**
 * Route groups that must remain covered. Keep this list in lock-step with
 * `src/routes/(app)` — `verifyAppRouteCoverage` reports drift in both directions.
 *
 * The manifest is intentionally layer-agnostic: a route is "covered" if any of
 * unit / integration / E2E provides a test. Layer-specific depth is enforced by
 * `tests/critical-test-paths.ts` and the P0 lists in `docs/tests/three-layer-completeness.mdx`.
 */
export const APP_ROUTE_COVERAGE: AppRouteCoverageEntry[] = [
  {
    route: "[language]",
    testFiles: [
      "tests/e2e/routes/system/language.spec.ts",
      "tests/unit/setup/language-packs.test.ts",
    ],
  },
  {
    route: "[language]/[...collection]",
    testFiles: [
      "tests/integration/routes/collection-page-load.test.ts",
      "tests/e2e/routes/collection-builder/content-entries.spec.ts",
      "tests/unit/routes/preview-guard.test.ts",
    ],
  },
  {
    route: "config",
    testFiles: [
      "tests/integration/api/config-admin-surface.test.ts",
      "tests/unit/api/config-handler.test.ts",
    ],
  },
  {
    route: "config/access-management",
    testFiles: [
      "tests/unit/routes/access-management-page-server.test.ts",
      "tests/e2e/routes/config/access-management.spec.ts",
    ],
  },
  {
    route: "config/api",
    testFiles: [
      "tests/unit/routes/api-playground-page-server.test.ts",
      "tests/unit/routes/api-keys-handler.test.ts",
    ],
  },
  {
    route: "config/automations",
    testFiles: [
      "tests/unit/routes/automations-page-server.test.ts",
      "tests/unit/config/automations-api.test.ts",
      "tests/integration/api/automations.test.ts",
    ],
  },
  {
    route: "config/collectionbuilder",
    testFiles: [
      "tests/unit/routes/collectionbuilder-page-server.test.ts",
      "tests/integration/collectionbuilder/structure-persistence.test.ts",
      "tests/e2e/routes/collection-builder/builder.spec.ts",
    ],
  },
  {
    route: "config/collectionbuilder/[action]/[...contentPath]",
    testFiles: [
      "tests/unit/routes/collectionbuilder-page-server.test.ts",
      "tests/unit/collectionbuilder/compilation.test.ts",
    ],
  },
  {
    route: "config/design-system",
    testFiles: [
      "tests/e2e/routes/config/design-system.spec.ts",
      "tests/unit/theme-contrast.test.ts",
    ],
  },
  {
    route: "config/extensions",
    testFiles: [
      "tests/unit/routes/extensions-page-server.test.ts",
      "tests/unit/config/plugins-api.test.ts",
      "tests/unit/config/widgets-api.test.ts",
    ],
  },
  {
    route: "config/migration",
    testFiles: [
      "tests/unit/services/migration-rename-exempt.test.ts",
      "tests/e2e/routes/config/data-management.spec.ts",
    ],
  },
  {
    route: "config/monitor",
    testFiles: ["tests/unit/routes/monitor-page-server.test.ts"],
  },
  {
    route: "config/queue",
    testFiles: [
      "tests/unit/routes/queue-page-server.test.ts",
      "tests/unit/routes/queue-actions.server.test.ts",
    ],
  },
  {
    route: "config/redirects",
    testFiles: [
      "tests/unit/routes/redirects-page-server.test.ts",
      "tests/unit/config/redirects-utils.test.ts",
      "tests/e2e/routes/config/redirects.spec.ts",
    ],
  },
  {
    route: "config/sync",
    testFiles: [
      "tests/unit/routes/sync-trash-page-server.test.ts",
      "tests/integration/api/config-sync.test.ts",
    ],
  },
  {
    route: "config/system-settings",
    testFiles: [
      "tests/unit/routes/system-settings-page-server.test.ts",
      "tests/unit/config/settings-utils.test.ts",
      "tests/e2e/routes/config/appearance.spec.ts",
    ],
  },
  {
    route: "config/trash",
    testFiles: [
      "tests/unit/config/trash-api.test.ts",
      "tests/unit/routes/sync-trash-page-server.test.ts",
    ],
  },
  {
    route: "config/webhooks",
    testFiles: [
      "tests/unit/routes/webhooks-page-server.test.ts",
      "tests/unit/config/webhooks-api.test.ts",
      "tests/integration/api/webhooks.test.ts",
    ],
  },
  {
    route: "config/webhooks/logs",
    testFiles: [
      "tests/unit/routes/webhooks-page-server.test.ts",
      "tests/integration/api/webhooks.test.ts",
    ],
  },
  {
    route: "config/workflows",
    testFiles: [
      "tests/unit/routes/workflows-page-server.test.ts",
      "tests/unit/config/workflows-api.test.ts",
    ],
  },
  {
    route: "dashboard",
    testFiles: [
      "tests/unit/routes/dashboard-page-server.test.ts",
      "tests/integration/api/dashboard.test.ts",
      "tests/e2e/routes/dashboard/dashboard.spec.ts",
    ],
  },
  {
    route: "mediagallery",
    testFiles: [
      "tests/unit/routes/mediagallery-page-server.test.ts",
      "tests/integration/api/media.test.ts",
      "tests/e2e/routes/mediagallery/mediagallery.spec.ts",
    ],
  },
  {
    route: "mediagallery/upload-media",
    testFiles: ["tests/unit/media/streaming-upload.test.ts", "tests/integration/api/media.test.ts"],
  },
  {
    route: "plugin",
    testFiles: ["tests/unit/routes/plugin-page-server.test.ts"],
  },
  {
    route: "plugin/[...path]",
    testFiles: ["tests/unit/routes/plugin-page-server.test.ts"],
  },
  {
    route: "user",
    testFiles: [
      "tests/unit/routes/user-page-server.test.ts",
      "tests/integration/api/token.test.ts",
      "tests/e2e/routes/user/token-actions.spec.ts",
    ],
  },
];

/** Normalize an OS-specific path to forward slashes. */
function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/**
 * Recursively enumerate route groups (directories with a `+page.server.ts` boundary)
 * under `src/routes/(app)`, returning paths relative to that directory.
 */
export function enumerateAppRouteGroups(projectRoot: string): string[] {
  const base = join(projectRoot, ...APP_ROUTES_DIR);
  const found: string[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      }
    }
    if (existsSync(join(dir, ROUTE_BOUNDARY_FILE))) {
      found.push(toPosix(relative(base, dir)));
    }
  }

  walk(base);
  return found.sort();
}

/**
 * Count test-case declarations in a file. Returns -1 when the file cannot be read.
 */
function countTestCases(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    const matches = content.match(TEST_CASE_RE);
    return matches ? matches.length : 0;
  } catch {
    return -1;
  }
}

/**
 * Verify bidirectional parity between the route inventory on disk and the
 * `APP_ROUTE_COVERAGE` manifest, then confirm every listed test file exists and is
 * non-empty.
 *
 * @param options.projectRoot Project root (defaults to `process.cwd()`).
 */
export function verifyAppRouteCoverage(
  options: { projectRoot?: string } = {},
): AppRouteCoverageResult {
  const root = options.projectRoot ?? process.cwd();
  const gaps: AppRouteCoverageGap[] = [];

  const diskRoutes = enumerateAppRouteGroups(root);
  const manifestRoutes = new Map(APP_ROUTE_COVERAGE.map((e) => [e.route, e]));

  // Direction 1: disk → manifest (untracked routes).
  for (const route of diskRoutes) {
    if (!manifestRoutes.has(route)) {
      gaps.push({
        route,
        type: "untracked-route",
        message: `Route group "${route}" has no coverage entry in APP_ROUTE_COVERAGE. Add a manifest row with at least one covering test file.`,
      });
    }
  }

  // Direction 2: manifest → disk (stale routes) and test-file presence.
  for (const entry of APP_ROUTE_COVERAGE) {
    if (!diskRoutes.includes(entry.route)) {
      gaps.push({
        route: entry.route,
        type: "stale-route",
        message: `Manifest route "${entry.route}" no longer exists under src/routes/(app). Update or remove the APP_ROUTE_COVERAGE entry.`,
      });
      continue;
    }

    if (entry.testFiles.length === 0) {
      gaps.push({
        route: entry.route,
        type: "missing-test-file",
        message: `Route group "${entry.route}" lists no covering test files.`,
      });
      continue;
    }

    for (const filePath of entry.testFiles) {
      const absolutePath = resolve(root, filePath);
      if (!existsSync(absolutePath)) {
        gaps.push({
          route: entry.route,
          type: "missing-test-file",
          filePath,
          message: `Covering test file missing for route "${entry.route}": ${filePath}`,
        });
        continue;
      }
      if (countTestCases(absolutePath) === 0) {
        gaps.push({
          route: entry.route,
          type: "empty-test-file",
          filePath,
          message: `Covering test file is empty for route "${entry.route}": ${filePath}`,
        });
      }
    }
  }

  return {
    gaps,
    totalRoutes: diskRoutes.length,
    passed: gaps.length === 0,
  };
}
