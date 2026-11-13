/**
 * @file tests/unit/scripts/lint-click-away.test.ts
 * @description Fixtures for the click-away scanner: a document-level `click`
 * listener must guard containment and must not key on `data-testid`.
 */

import { describe, expect, it } from "vitest";
import {
  ALLOWED_FILES,
  findUnguardedClickAway,
  resolveHandlerBody,
} from "../../../scripts/lint/lint-click-away";

const file = (path: string, source: string) => ({ path, source });
const SVELTE = "src/components/demo.svelte";

describe("resolveHandlerBody", () => {
  it("resolves a function declaration", () => {
    const body = resolveHandlerBody(
      "function onAway(event: MouseEvent): void {\n  if (event) close();\n}",
      "onAway",
    );

    expect(body).toContain("close();");
  });

  it("resolves a const arrow with a block body", () => {
    const body = resolveHandlerBody(
      "const onAway = (event: MouseEvent) => {\n  close();\n};",
      "onAway",
    );

    expect(body).toContain("close();");
  });

  it("returns null for a handler defined in another module", () => {
    expect(resolveHandlerBody("const unrelated = 1;", "onAway")).toBeNull();
  });
});

describe("findUnguardedClickAway", () => {
  it("flags a handler that never tests containment", () => {
    const offenses = findUnguardedClickAway([
      file(
        SVELTE,
        "const onAway = (e: MouseEvent) => {\n  open = false;\n};\ndocument.addEventListener('click', onAway);",
      ),
    ]);

    expect(offenses).toHaveLength(1);
    expect(offenses[0].reason).toContain("never calls closest()/contains()");
  });

  it("flags a deny-list built from data-testid", () => {
    const offenses = findUnguardedClickAway([
      file(
        SVELTE,
        "function onAway(e: MouseEvent) {\n  if (e.target.closest('[data-testid=\"toolbar-btn\"]')) return;\n  open = false;\n}\ndocument.addEventListener('click', onAway);",
      ),
    ]);

    expect(offenses).toHaveLength(1);
    expect(offenses[0].reason).toContain("guards on a data-testid");
  });

  it("accepts a semantic guard", () => {
    const offenses = findUnguardedClickAway([
      file(
        SVELTE,
        "function onAway(e: MouseEvent) {\n  if ((e.target as HTMLElement).closest('[aria-haspopup], [role=\"menu\"]')) return;\n  open = false;\n}\ndocument.addEventListener('click', onAway);",
      ),
    ]);

    expect(offenses).toEqual([]);
  });

  it("flags an inline arrow with no guard", () => {
    const offenses = findUnguardedClickAway([
      file(SVELTE, "document.addEventListener('click', () => { open = false; });"),
    ]);

    expect(offenses).toHaveLength(1);
  });

  it("flags a handler it cannot resolve", () => {
    const offenses = findUnguardedClickAway([
      file(SVELTE, "document.addEventListener('click', onAway);"),
    ]);

    expect(offenses[0].reason).toContain("not declared in this file");
  });

  it("allows the shared primitive and reviewed suppressions", () => {
    const primitive = [...ALLOWED_FILES][0];
    const offenses = findUnguardedClickAway([
      file(primitive, "document.addEventListener('click', onAway);"),
      file(
        SVELTE,
        "function onAway(e: MouseEvent) { open = false; }\n// lint-click-away: allow <reason> menu is rendered in a portal\ndocument.addEventListener('click', onAway);",
      ),
    ]);

    expect(offenses).toEqual([]);
  });

  it("ignores TypeScript modules", () => {
    const offenses = findUnguardedClickAway([
      file("src/services/x.ts", "document.addEventListener('click', onAway);"),
    ]);

    expect(offenses).toEqual([]);
  });
});
