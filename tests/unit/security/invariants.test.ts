/**
 * @file tests/unit/security/invariants.test.ts
 * @description Executable security invariants over the real source tree. Each
 * rule names the offending file on failure and documents its allowlist inline.
 *
 * Invariants:
 * - `new Date().toISOString()` must not grow outside the canonical date helper /
 *   documented legacy ratchet (AGENTS: use `nowISODateString()`).
 * - `Math.random()` must never appear in security, auth or media utilities.
 * - The `@components/ui` barrel must not be imported anywhere.
 * - Every `+server.ts` / `+page.server.ts` route is owned by a threat-model surface.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANIFEST_PATH,
  evaluateManifest,
  parseManifest,
  resolveSurfaceFiles,
} from "../../../scripts/security/threat-model-lib";

const ROOT = resolve(process.cwd());
const SOURCE_EXTENSIONS = [".ts", ".svelte"];

/**
 * Ratchet for `new Date().toISOString()`. Values are the exact occurrence count
 * allowed in that file today; a new occurrence in an allowlisted file still
 * fails. Entries must be deleted as files migrate to `nowISODateString()`
 * (`src/utils/date.ts`), never added without a security review.
 *
 * - `src/utils/date.ts` is the canonical implementation of `nowISODateString()`
 *   and `toISOString()` — the only sanctioned direct calls.
 * - The remaining entries are pre-gate occurrences. Client-only export/display
 *   timestamps (`.svelte`) never persist an `ISODateString`; server files are
 *   legacy write paths awaiting migration.
 */
const ISO_TO_STRING_ALLOWLIST: ReadonlyMap<string, number> = new Map([
  // Canonical date helper implementation.
  ["src/utils/date.ts", 3],
  // Client-side export / display timestamps.
  ["src/components/collection-display/entry-list.svelte", 1],
  ["src/components/collection-display/entry-list-multi-button.svelte", 1],
  ["src/components/collection-display/schedule-modal.svelte", 1],
  ["src/components/emails/database-failure.svelte", 2],
  ["src/components/media-library-modal.svelte", 2],
  ["src/components/permissions-setting.svelte", 1],
  ["src/components/system/gdpr-settings.svelte", 1],
  ["src/routes/(app)/config/design-system/+page.svelte", 1],
  ["src/routes/(app)/config/system-settings/generic-settings-group.svelte", 1],
  ["src/routes/(app)/dashboard/widgets/calendar-view/index.svelte", 2],
  ["src/routes/(app)/dashboard/widgets/cpu/index.svelte", 1],
  ["src/routes/(app)/user/components/modal-privacy-data.svelte", 1],
  // Legacy server write paths — migrate to `nowISODateString()`.
  ["src/utils/scim-utils.ts", 4],
  ["src/services/core/content-sync-service.ts", 4],
  ["src/routes/login/auth.remote.ts", 4],
  ["src/databases/mongodb/content-module.ts", 4],
  ["src/utils/logger.server.ts", 3],
  ["src/services/background/automation/automation-service.ts", 3],
  ["src/routes/api/[...path]/handlers/dashboard.ts", 3],
  ["src/utils/smart-table-saved-views.ts", 2],
  ["src/utils/offline-draft-sync.ts", 2],
  ["src/services/core/migration-engine.ts", 2],
  ["src/services/core/config-service.ts", 2],
  ["src/routes/api/[...path]/handlers/auth.ts", 2],
  ["src/databases/mongodb/system-module.ts", 2],
  ["src/utils/log-export.ts", 1],
  ["src/utils/cpu-profiler.ts", 1],
  ["src/services/token/helper.ts", 1],
  ["src/services/security/response-service.ts", 1],
  ["src/services/sdk/namespaces/misc-namespaces.ts", 1],
  ["src/services/observability/telemetry-service.ts", 1],
  ["src/services/core/content-package-service.ts", 1],
  ["src/services/content/history-service.ts", 1],
  ["src/services/background/jobs/webhook-jobs.ts", 1],
  ["src/services/background/jobs/media-jobs.ts", 1],
  ["src/routes/login/+page.server.ts", 1],
  ["src/routes/api/graphql/resolvers/users.ts", 1],
  ["src/routes/api/[...path]/handlers/utility.ts", 1],
  ["src/routes/api/[...path]/handlers/testing/testing-users-gdpr.ts", 1],
  ["src/routes/api/[...path]/handlers/system/system-workflows.ts", 1],
  ["src/routes/api/[...path]/handlers/system/system-health.ts", 1],
  ["src/routes/api/[...path]/handlers/config.ts", 1],
  ["src/databases/mongodb/mongo-query-builder.ts", 1],
  ["src/databases/database-resilience.ts", 1],
  ["src/databases/core/system-schema-bootstrap.ts", 1],
  ["src/hooks/handle-authentication.ts", 1],
  ["src/plugins/pagespeed/index.server.ts", 1],
  ["src/plugins/stripe/server/webhooks.ts", 1],
  ["src/plugins/unified-data-hub/hub-page.server.ts", 1],
  ["src/plugins/unified-data-hub/server/cache.ts", 1],
]);

interface Offence {
  path: string;
  count: number;
  lines: number[];
}

/** Counts regex occurrences per file and records the matching line numbers. */
function findOccurrences(files: readonly string[], pattern: RegExp): Offence[] {
  const offences: Offence[] = [];

  for (const file of files) {
    const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
    const matches: number[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const hits = lines[index].match(pattern);
      for (let hit = 0; hit < (hits?.length ?? 0); hit += 1) matches.push(index + 1);
    }
    if (matches.length > 0) offences.push({ path: file, count: matches.length, lines: matches });
  }

  return offences.sort((left, right) => (left.path < right.path ? -1 : 1));
}

function format(offences: readonly Offence[]): string {
  return offences
    .map((offence) => `${offence.path} (${offence.count}x at line ${offence.lines.join(", ")})`)
    .join("\n");
}

/**
 * Finds real barrel imports. The `@components/ui/index.ts` header documents the
 * discouraged form inside a fenced block, so only statements that start a line
 * (after whitespace) or dynamic `import()` calls are counted.
 */
function findBarrelImports(files: readonly string[]): Offence[] {
  const pattern =
    /(?:^|[\r\n]+)[ \t]*import\b[^;]{0,500}?from[ \t]*["']@components\/ui["']|\bimport[ \t]*\([ \t]*["']@components\/ui["'][ \t]*\)/g;
  const offences: Offence[] = [];

  for (const file of files) {
    const content = readFileSync(join(ROOT, file), "utf8");
    const lines: number[] = [];
    for (const match of content.matchAll(pattern)) {
      const before = content.slice(0, match.index ?? 0);
      lines.push((before.match(/\n/g)?.length ?? 0) + 1);
    }
    if (lines.length > 0) offences.push({ path: file, count: lines.length, lines });
  }

  return offences.sort((left, right) => (left.path < right.path ? -1 : 1));
}

function sourceFiles(patterns: readonly string[]): string[] {
  return resolveSurfaceFiles({ paths: [...patterns] }, ROOT).filter((file) =>
    SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)),
  );
}

describe("security invariants", () => {
  it("uses nowISODateString() instead of new Date().toISOString()", () => {
    const files = sourceFiles(["src/**"]).filter((file) => !file.startsWith("src/paraglide/"));
    const offences = findOccurrences(files, /new Date\(\)\.toISOString\(\)/g).filter(
      (offence) => offence.count > (ISO_TO_STRING_ALLOWLIST.get(offence.path) ?? 0),
    );

    expect(
      offences,
      `Use nowISODateString() from src/utils/date.ts (AGENTS §1). New violation(s):\n${format(offences)}`,
    ).toEqual([]);
  });

  it("never calls Math.random() in security, auth or media utilities", () => {
    const files = sourceFiles([
      "src/utils/security/**",
      "src/databases/auth/**",
      "src/utils/media/**",
    ]);
    const offences = findOccurrences(files, /Math\.random\s*\(/g);

    expect(
      offences,
      `Security-sensitive randomness must use crypto.getRandomValues()/randomUUID():\n${format(offences)}`,
    ).toEqual([]);
  });

  it("imports UI primitives by module path, never through the @components/ui barrel", () => {
    const files = sourceFiles(["src/**", "tests/**"]);
    const offences = findBarrelImports(files);

    expect(
      offences,
      `Import from @components/ui/<module> instead of the barrel:\n${format(offences)}`,
    ).toEqual([]);
  });

  it("covers every server route with a threat-model surface", () => {
    const manifest = parseManifest(
      JSON.parse(readFileSync(join(ROOT, MANIFEST_PATH), "utf8")) as unknown,
    );
    const evaluation = evaluateManifest(manifest, ROOT);

    expect(
      evaluation.uncovered,
      `Add these files to a surface in ${MANIFEST_PATH}:\n${evaluation.uncovered.join("\n")}`,
    ).toEqual([]);
    expect(evaluation.coverage.percent).toBe(100);
  }, 30_000);
});
