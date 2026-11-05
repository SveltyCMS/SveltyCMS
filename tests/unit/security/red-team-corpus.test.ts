/**
 * @file tests/unit/security/red-team-corpus.test.ts
 * @description Runs the executable red-team corpus against real guards.
 *
 * `tests/security-corpus/cases.json` is the durable regression set: every case
 * is a payload, a target guard, and the verdict the guard must reach. An AI may
 * propose new cases; a human accepts a diff, and from then on the case runs on
 * every PR and can never regress silently.
 *
 * The JSON is validated before any case runs — a typo in `target` must fail the
 * corpus, not silently skip a payload.
 *
 * ### Features:
 * - Valibot shape check (kebab-case id, non-empty note, `reject`/`accept`)
 * - unique-id and target-registry completeness checks
 * - every case executed with the id + payload in the failure message
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { array, check, minLength, object, picklist, pipe, regex, safeParse, string } from "valibot";
import type { InferOutput } from "valibot";
import { TARGETS } from "../../security-corpus/harness";

const CORPUS_PATH = fileURLToPath(new URL("../../security-corpus/cases.json", import.meta.url));

const caseSchema = object({
  id: pipe(string(), regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  target: pipe(string(), minLength(1)),
  payload: string(),
  expected: picklist(["reject", "accept"]),
  note: pipe(string(), minLength(1)),
});

const corpusSchema = pipe(
  array(caseSchema),
  check((cases) => cases.length >= 28, "corpus must contain at least 28 cases"),
);

type CorpusCase = InferOutput<typeof caseSchema>;

function parseCorpus(): { success: true; cases: CorpusCase[] } | { success: false; error: string } {
  const raw: unknown = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
  const result = safeParse(corpusSchema, raw);
  if (!result.success) {
    return {
      success: false,
      error: result.issues
        .map((issue) => `${issue.path?.map((item) => item.key).join(".")}: ${issue.message}`)
        .join("\n"),
    };
  }
  return { success: true, cases: result.output };
}

const parsed = parseCorpus();
const cases: CorpusCase[] = parsed.success ? parsed.cases : [];

describe("red-team corpus — contract", () => {
  it("is a valid corpus document", () => {
    expect(parsed.success, parsed.success ? "" : parsed.error).toBe(true);
  });

  it("has unique kebab-case ids", () => {
    const ids = cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("records a non-empty note for every case", () => {
    for (const entry of cases) {
      expect(entry.note.trim().length, `case ${entry.id} has an empty note`).toBeGreaterThan(0);
    }
  });

  it("references only registered targets, and every target has a case", () => {
    const referenced = new Set(cases.map((entry) => entry.target));
    for (const target of referenced) {
      expect(Object.hasOwn(TARGETS, target), `unknown target "${target}"`).toBe(true);
    }
    for (const target of Object.keys(TARGETS)) {
      expect(referenced.has(target), `target "${target}" has no corpus case`).toBe(true);
    }
  });
});

describe("red-team corpus — verdicts", () => {
  for (const entry of cases) {
    it(`${entry.id} (${entry.target})`, () => {
      const guard = TARGETS[entry.target];
      const rejected = guard(entry.payload);
      expect(
        rejected,
        `case "${entry.id}" expected "${entry.expected}" for payload ${JSON.stringify(entry.payload)} on target "${entry.target}", got "${rejected ? "reject" : "accept"}"`,
      ).toBe(entry.expected === "reject");
    });
  }
});
