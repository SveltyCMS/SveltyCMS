/**
 * @file tests/mutation/seam-mutation.test.ts
 * @description Self-contained mutation harness for the three "seam" modules that
 * caused recent regressions. It replaces StrykerJS (whose vitest-runner forces
 * `pool: "threads"`, incompatible with this project's `pool: "forks"` tests that
 * call `process.chdir()` — see docs/tests/mutation-testing.mdx).
 *
 * For each seam it reads the real source, extracts the pure logic, applies a small
 * fixed set of *semantic* mutations (flip a `=== 404`, drop the `expires` allowlist
 * key, flip the `deletedCount === 0` honest-404 guard, drop/swap `raise` arguments),
 * loads the mutant through a temp file + dynamic import, and asserts the existing
 * invariant now FAILS (i.e. the mutant is killed).
 *
 * The harness has zero external dependencies and runs in well under a second.
 * Run with: `bun run test:mutation`
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// ─── Types ─────────────────────────────────────────────────────────────────

type RaiseFn = (status: number, message: string, code?: string) => never;
type PickTokenUpdateFieldsFn = (data: unknown, admin: boolean) => Record<string, unknown>;
type ResolveErrorDisplayFn = (
  status: number,
  errorMessage?: string,
) => {
  title: string;
  summary: string;
  showPageMoved: boolean;
};
type DeleteTokenRowFn = (result: {
  success?: boolean;
  data?: { deletedCount?: number };
}) => unknown;
type UpdateTokenRowFn = (result: unknown) => unknown;

interface TextMutation {
  id: string;
  find: string;
  replace: string;
}

interface SeamSpec {
  name: string;
  /** Self-contained, LF-normalized module source. */
  source: string;
  mutations: TextMutation[];
  /** Throws when the protected invariant is violated. */
  assertInvariant: (mod: unknown) => void;
}

interface MutationResult {
  seam: string;
  mutant: string;
  killed: boolean;
}

// ─── Source + mutation helpers ─────────────────────────────────────────────

const PROJECT_ROOT = process.cwd();
const MUTANT_DIR = join(PROJECT_ROOT, ".vitest", "mutation");

function readSource(relativePath: string): string {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf8").replace(/\r\n/g, "\n");
}

/** Extracts the text between two unique markers (start inclusive, end exclusive). */
function extractBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`seam drift: start marker not found — ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`seam drift: end marker not found — ${endMarker}`);
  return source.slice(start, end);
}

/** Extracts a `export function` / `export class` statement via brace matching. */
function extractStatement(source: string, signature: string): string {
  const signatureIndex = source.indexOf(signature);
  if (signatureIndex === -1) throw new Error(`seam drift: signature not found — ${signature}`);
  const openBrace = source.indexOf("{", signatureIndex);
  if (openBrace === -1) throw new Error(`seam drift: no opening brace — ${signature}`);

  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(signatureIndex, i + 1);
    }
  }
  throw new Error(`seam drift: unbalanced braces — ${signature}`);
}

function applyMutation(source: string, mutation: TextMutation): string {
  const occurrences = source.split(mutation.find).length - 1;
  if (occurrences === 0) {
    throw new Error(`seam drift: mutation "${mutation.id}" find string not found`);
  }
  if (occurrences !== 1) {
    throw new Error(
      `seam drift: mutation "${mutation.id}" find string is ambiguous (${occurrences} matches)`,
    );
  }
  return source.replace(mutation.find, mutation.replace);
}

function expectExport<T>(mod: unknown, name: string): T {
  const value = (mod as Record<string, unknown> | null | undefined)?.[name];
  if (typeof value !== "function") {
    throw new Error(`mutant module does not export function "${name}"`);
  }
  return value as T;
}

/** Runs `fn` and returns the thrown value, or `null` when it returns normally. */
function captureThrown(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

let mutantSequence = 0;

async function loadModule(source: string): Promise<unknown> {
  mkdirSync(MUTANT_DIR, { recursive: true });
  const file = join(MUTANT_DIR, `mutant-${process.pid}-${mutantSequence}.ts`);
  mutantSequence += 1;
  writeFileSync(file, source, "utf8");
  // Cache-busting query keeps each mutant (and the original) as a distinct module.
  return import(`${pathToFileURL(file).href}?m=${mutantSequence}`);
}

// ─── Seam 1 — resolveErrorDisplay (src/utils/error-display.ts) ─────────────

const errorDisplaySource = readSource("src/utils/error-display.ts");

function assertErrorDisplayInvariant(mod: unknown): void {
  const resolveErrorDisplay = expectExport<ResolveErrorDisplayFn>(mod, "resolveErrorDisplay");

  // The regression: a 500 ("System Error") must never claim the page moved.
  if (resolveErrorDisplay(500, "Internal Error").showPageMoved !== false) {
    throw new Error("500 incorrectly shows the page-moved helper");
  }
  if (resolveErrorDisplay(404, "Not Found").showPageMoved !== true) {
    throw new Error("404 fails to show the page-moved helper");
  }
  for (const status of [400, 401, 403, 429, 500, 502, 503]) {
    if (resolveErrorDisplay(status, "x").showPageMoved !== false) {
      throw new Error(`status ${status} incorrectly shows the page-moved helper`);
    }
  }

  // Status ladder: 404 is never the generic system error; 403/401/429 keep copy.
  if (resolveErrorDisplay(404, "Not Found").title === "System Error") {
    throw new Error("404 title fell through to the generic system error");
  }
  if (resolveErrorDisplay(403, "Forbidden").title !== "Access Denied") {
    throw new Error("403 title is not 'Access Denied'");
  }
  if (resolveErrorDisplay(401, "").title !== "Unauthorized") {
    throw new Error("401 title is not 'Unauthorized'");
  }
  if (resolveErrorDisplay(429, "").title !== "Too Many Requests") {
    throw new Error("429 title is not 'Too Many Requests'");
  }
}

// ─── Seam 2 — pickTokenUpdateFields (src/routes/api/[...path]/handlers/tokens.ts)

const tokensSource = readSource("src/routes/api/[...path]/handlers/tokens.ts");

const pickTokenUpdateFieldsSource = extractBetween(
  tokensSource,
  "const TOKEN_UPDATE_LIFECYCLE_FIELDS",
  "function scrubApiKey(key: any) {",
);

function assertPickTokenUpdateFieldsInvariant(mod: unknown): void {
  const pick = expectExport<PickTokenUpdateFieldsFn>(mod, "pickTokenUpdateFields");

  // Admin keeps the lifecycle + identity columns.
  const admin = pick(
    { email: "a@b.co", role: "editor", expires: "2030-01-01T00:00:00.000Z", blocked: true },
    true,
  );
  if (
    admin.email !== "a@b.co" ||
    admin.role !== "editor" ||
    admin.expires !== "2030-01-01T00:00:00.000Z" ||
    admin.blocked !== true
  ) {
    throw new Error("admin update dropped an allowlisted field");
  }

  // Non-admin keeps only `expires` (identity + non-columns are dropped).
  const nonAdmin = pick(
    {
      email: "a@b.co",
      role: "admin",
      expires: "2030-01-01T00:00:00.000Z",
      expiresInHours: 48,
      token: "raw-or-hashed",
      user_id: "u2",
      type: "password_reset",
      tenantId: "other-tenant",
      _id: "t9",
    },
    false,
  );
  if (JSON.stringify(nonAdmin) !== JSON.stringify({ expires: "2030-01-01T00:00:00.000Z" })) {
    throw new Error("non-admin update leaked an identity / non-column field");
  }

  // Identity fields are never writable, even for admins.
  if (
    Object.keys(pick({ user_id: "victim", type: "password_reset", tenantId: "t2" }, true))
      .length !== 0
  ) {
    throw new Error("caller could re-point user_id / type / tenantId through the body");
  }
}

// ─── Seam 3 — token update/delete identity logic (honest 404s) ─────────────

function buildTokenGuardSource(source: string): string {
  const deletedCountLine =
    "const deletedCount = (result as { data?: { deletedCount?: number } })?.data?.deletedCount;";
  const deleteGuardLine =
    'if (result?.success && deletedCount === 0) raise(404, "Token not found", "NOT_FOUND");';
  const updateGuardLine = 'if (!result) raise(404, "Token not found");';

  for (const line of [deletedCountLine, deleteGuardLine, updateGuardLine]) {
    if (!source.includes(line)) {
      throw new Error(`seam drift: honest-404 guard line missing from tokens.ts — ${line}`);
    }
  }

  return `import { raise } from "@utils/error-handling";

export interface TokenDeleteResult { success?: boolean; data?: { deletedCount?: number } }

export function deleteTokenRow(result: TokenDeleteResult): TokenDeleteResult {
  ${deletedCountLine}
  ${deleteGuardLine}
  return result;
}

export function updateTokenRow(result: unknown): unknown {
  ${updateGuardLine}
  return result;
}
`;
}

function assertTokenGuardInvariant(mod: unknown): void {
  const deleteTokenRow = expectExport<DeleteTokenRowFn>(mod, "deleteTokenRow");
  const updateTokenRow = expectExport<UpdateTokenRowFn>(mod, "updateTokenRow");

  // DELETE: an unresolvable row (deletedCount === 0) must 404, never silent 200.
  const deleteMiss = captureThrown(() =>
    deleteTokenRow({ success: true, data: { deletedCount: 0 } }),
  );
  if (deleteMiss === null) throw new Error("deleteTokenRow(deletedCount=0) answered success");
  if ((deleteMiss as { status?: number }).status !== 404) {
    throw new Error("deleteTokenRow(deletedCount=0) did not raise 404");
  }

  // DELETE: a real deletion must not throw.
  if (captureThrown(() => deleteTokenRow({ success: true, data: { deletedCount: 1 } })) !== null) {
    throw new Error("deleteTokenRow(deletedCount=1) threw unexpectedly");
  }

  // DELETE: a failed namespace call (success false) is not an "empty delete".
  if (captureThrown(() => deleteTokenRow({ success: false, data: { deletedCount: 0 } })) !== null) {
    throw new Error("deleteTokenRow(success=false) threw unexpectedly");
  }

  // PUT: an id the namespace cannot resolve must 404.
  const updateMiss = captureThrown(() => updateTokenRow(undefined));
  if (updateMiss === null) throw new Error("updateTokenRow(undefined) answered success");
  if ((updateMiss as { status?: number }).status !== 404) {
    throw new Error("updateTokenRow(undefined) did not raise 404");
  }

  // PUT: a resolvable row must not throw.
  if (captureThrown(() => updateTokenRow({ _id: "abc" })) !== null) {
    throw new Error("updateTokenRow(resolved) threw unexpectedly");
  }
}

// ─── Seam 4 — raise / AppError (src/utils/error-handling.ts) ───────────────

const errorHandlingSource = readSource("src/utils/error-handling.ts");

const raiseSource = [
  "export type AppErrorCode = string;",
  "",
  extractStatement(errorHandlingSource, "export class AppError extends Error {"),
  "",
  extractStatement(errorHandlingSource, "export function raise("),
].join("\n");

function assertRaiseInvariant(mod: unknown): void {
  const raise = expectExport<RaiseFn>(mod, "raise");

  const notFound = captureThrown(() => raise(404, "Token not found", "NOT_FOUND"));
  if (notFound === null) throw new Error("raise(404) did not throw");
  const notFoundError = notFound as {
    name?: string;
    status?: number;
    message?: string;
    code?: string;
  };
  if (notFoundError.name !== "AppError") throw new Error("raise() did not throw an AppError");
  if (notFoundError.status !== 404) throw new Error(`raise(404) status is ${notFoundError.status}`);
  if (notFoundError.message !== "Token not found") throw new Error("raise() message was corrupted");
  if (notFoundError.code !== "NOT_FOUND") throw new Error("raise() code was dropped or corrupted");

  const badRequest = captureThrown(() => raise(400, "Bad request"));
  if (badRequest === null) throw new Error("raise(400) did not throw");
  const badRequestError = badRequest as { status?: number; code?: string };
  if (badRequestError.status !== 400)
    throw new Error(`raise(400) status is ${badRequestError.status}`);
  // A missing code must fall back to the canonical internal-error code.
  if (badRequestError.code !== "INTERNAL_ERROR") {
    throw new Error("raise() did not default the code to INTERNAL_ERROR");
  }
}

// ─── Specs ─────────────────────────────────────────────────────────────────

const seams: SeamSpec[] = [
  {
    name: "resolveErrorDisplay",
    source: errorDisplaySource,
    mutations: [
      {
        id: "flip-showPageMoved-404",
        find: "showPageMoved: status === 404",
        replace: "showPageMoved: status !== 404",
      },
      {
        id: "flip-title-404",
        find: "db_error_title()\n    : status === 404",
        replace: "db_error_title()\n    : status !== 404",
      },
      {
        id: "flip-title-403",
        find: 'status === 403\n        ? "Access Denied"',
        replace: 'status !== 403\n        ? "Access Denied"',
      },
    ],
    assertInvariant: assertErrorDisplayInvariant,
  },
  {
    name: "pickTokenUpdateFields",
    source: pickTokenUpdateFieldsSource,
    mutations: [
      {
        id: "drop-expires-allowlist",
        find: '["expires", "blocked", "consumed"]',
        replace: '["blocked", "consumed"]',
      },
      { id: "bypass-admin-gate", find: "const allowed = admin", replace: "const allowed = true" },
    ],
    assertInvariant: assertPickTokenUpdateFieldsInvariant,
  },
  {
    name: "token-update-delete-guards",
    source: buildTokenGuardSource(tokensSource),
    mutations: [
      { id: "flip-deletedCount-guard", find: "deletedCount === 0", replace: "deletedCount !== 0" },
      {
        id: "flip-update-notfound-guard",
        find: 'if (!result) raise(404, "Token not found");',
        replace: 'if (result) raise(404, "Token not found");',
      },
    ],
    assertInvariant: assertTokenGuardInvariant,
  },
  {
    name: "raise-AppError",
    source: raiseSource,
    mutations: [
      {
        id: "drop-code-argument",
        find: "throw new AppError(message, status, code, details);",
        replace: "throw new AppError(message, status);",
      },
      {
        id: "swap-status-and-code",
        find: "throw new AppError(message, status, code, details);",
        replace: "throw new AppError(message, code, status, details);",
      },
    ],
    assertInvariant: assertRaiseInvariant,
  },
];

// ─── Runner ────────────────────────────────────────────────────────────────

const results: MutationResult[] = [];

function runSeam(spec: SeamSpec): void {
  describe(`mutation: ${spec.name}`, () => {
    it("original source passes the invariant (sanity)", async () => {
      const mod = await loadModule(spec.source);
      expect(() => spec.assertInvariant(mod)).not.toThrow();
    });

    for (const mutation of spec.mutations) {
      it(`kills mutant ${mutation.id}`, async () => {
        const mod = await loadModule(applyMutation(spec.source, mutation));

        let killed = false;
        try {
          spec.assertInvariant(mod);
        } catch {
          killed = true;
        }
        results.push({ seam: spec.name, mutant: mutation.id, killed });

        expect(killed, `mutant "${mutation.id}" survived — the invariant still holds`).toBe(true);
      });
    }
  });
}

for (const seam of seams) {
  runSeam(seam);
}

afterAll(() => {
  const total = results.length;
  const killed = results.filter((result) => result.killed).length;
  const survived = total - killed;
  const score = total === 0 ? 100 : (killed / total) * 100;

  // `process.stdout.write` (rather than `console.log`) so the summary survives
  // the project's `silent: "passed-only"` reporter setting.
  process.stdout.write(
    `[mutation] seam harness: ${total} mutant(s), ${killed} killed, ${survived} survived ` +
      `(${score.toFixed(1)}% mutation score)\n`,
  );
  for (const result of results) {
    if (!result.killed)
      process.stdout.write(`[mutation] SURVIVED: ${result.seam} :: ${result.mutant}\n`);
  }

  rmSync(MUTANT_DIR, { recursive: true, force: true });
});
