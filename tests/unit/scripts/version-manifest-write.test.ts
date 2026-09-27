/**
 * @file tests/unit/scripts/version-manifest-write.test.ts
 * @description Contract tests for the manifest writer in `scripts/version.ts`.
 * The version bump must touch exactly one byte range — the top-level `"version"`
 * value — and nothing else, whatever the manifest's layout. The regression that
 * motivated these tests: the writer was line-anchored, so a minified manifest
 * (`{"name":"x","version":"0.1.0"}`) reported `could not locate the top-level
 * "version" field` although the field was right there — a refusal that would
 * block the pre-push `--release` step with a false reason. Nested keys, the word
 * inside another value, and braces inside strings must all be ignored.
 */

import { describe, it, expect } from "vitest";
import { locateVersionValue, replaceVersionField } from "../../../scripts/version";

/** The shape this repository's package.json actually has. */
const PRETTY = [
  "{",
  '  "name": "create-sveltycms",',
  '  "version": "0.1.2",',
  '  "description": "Scaffold a new project",',
  '  "custom": { "version": "9.9.9" }',
  "}",
  "",
].join("\n");

describe("replaceVersionField — layout independence", () => {
  it("rewrites the value in a pretty-printed manifest, one line changed", () => {
    const updated = replaceVersionField(PRETTY, "0.1.2", "0.2.0");

    expect(updated.split("\n").filter((line) => line.includes('"version"'))).toEqual([
      '  "version": "0.2.0",',
      '  "custom": { "version": "9.9.9" }',
    ]);
    expect(updated.replace("0.2.0", "0.1.2")).toBe(PRETTY);
  });

  it("rewrites a minified single-line manifest (the reported regression)", () => {
    const raw = '{"name":"probe","version":"0.1.0"}';

    expect(replaceVersionField(raw, "0.1.0", "0.2.0")).toBe('{"name":"probe","version":"0.2.0"}');
  });

  it("keeps the parsed JSON valid and at the new version", () => {
    const updated = replaceVersionField(PRETTY, "0.1.2", "1.0.0");

    expect((JSON.parse(updated) as { version: string }).version).toBe("1.0.0");
  });
});

describe("locateVersionValue — depth and string awareness", () => {
  it("ignores a nested `version` key", () => {
    const raw = '{"nested":{"version":"9.9.9"},"version":"0.1.0"}';

    expect(replaceVersionField(raw, "0.1.0", "0.2.0")).toBe(
      '{"nested":{"version":"9.9.9"},"version":"0.2.0"}',
    );
  });

  it("ignores the word inside another value", () => {
    const raw = '{"note":"version: 9.9.9","version":"0.1.0"}';

    expect(replaceVersionField(raw, "0.1.0", "0.2.0")).toBe(
      '{"note":"version: 9.9.9","version":"0.2.0"}',
    );
  });

  it("is not fooled by braces or escaped quotes inside strings", () => {
    const raw = '{"note":"a { brace and a \\" quote","version":"0.1.0"}';

    expect(replaceVersionField(raw, "0.1.0", "0.2.0")).toBe(
      '{"note":"a { brace and a \\" quote","version":"0.2.0"}',
    );
  });

  it("reports the span of the value only, quotes included", () => {
    const raw = '{"version":"0.1.0"}';
    const span = locateVersionValue(raw, "0.1.0");

    expect(raw.slice(span.start, span.end + 1)).toBe('"0.1.0"');
  });
});

describe("locateVersionValue — refusals", () => {
  it("refuses a manifest whose value disagrees with the parsed version", () => {
    expect(() => replaceVersionField(PRETTY, "2.0.0", "2.0.1")).toThrow(/refusing to rewrite/);
  });

  it("refuses a manifest with no top-level version field", () => {
    expect(() => replaceVersionField('{"name":"probe"}', "0.1.0", "0.2.0")).toThrow(
      /could not locate the top-level "version" field/,
    );
  });

  it("refuses a non-string version value", () => {
    expect(() => replaceVersionField('{"version":1}', "1", "2")).toThrow(/is not a string/);
  });
});
