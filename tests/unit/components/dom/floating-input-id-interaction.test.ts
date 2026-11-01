/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/floating-input-id-interaction.test.ts
 * @description Regression: a label-derived input id must stay addressable by `#<id>`.
 *
 * `label` is display copy, not data. It used to be lower-cased into the element id
 * verbatim, so the collection table's search field (`label="Search..."`, see
 * `src/components/system/table/table-filter.svelte`) shipped `id="search..."`.
 * The root layout remembered the focused element as the string `#${id}` and handed
 * it to `document.querySelector` inside a `setTimeout`, which threw
 *   SyntaxError: Failed to execute 'querySelector' on 'Document':
 *   '#search...' is not a valid selector.
 * uncaught — 15 pageerrors in one E2E shard, and the search test
 * (`tests/e2e/routes/collection-builder/content-entries.spec.ts:292`) failed on the
 * page-error guard instead of on its own assertions.
 *
 * ### Features:
 * - the reported label (`Search...`) yields an id a plain `#id` selector resolves
 * - hostile labels (digit-leading, colons, quotes, spaces) do the same
 * - an explicitly passed `id` is never rewritten
 */

import { describe, expect, it } from "vitest";
import FloatingInput from "@src/components/ui/floating-input.svelte";
import { renderComponent } from "./render";

/** Labels that are legal display copy but not legal inside a `#id` selector. */
const HOSTILE_LABELS = ["Search...", "1. Title", "e-mail: address", 'quote "x"', "two words"];

describe("FloatingInput — label-derived id stays selector-safe", () => {
  it("addresses the search field by #id (the '#search...' pageerror)", () => {
    const { target, cleanup } = renderComponent(FloatingInput, { label: "Search..." });

    try {
      const input = target.querySelector("input");
      expect(input).toBeTruthy();
      expect(input!.id).not.toBe("");

      // Parsing the selector is what threw in production; resolution is what the
      // layout needed. Both are asserted because either one can regress.
      expect(() => document.querySelector(`#${input!.id}`)).not.toThrow();
      expect(target.querySelector(`#${input!.id}`)).toBe(input);
    } finally {
      cleanup();
    }
  });

  it.each(HOSTILE_LABELS)("keeps the id addressable for label %s", (label) => {
    const { target, cleanup } = renderComponent(FloatingInput, { label });

    try {
      const input = target.querySelector("input");
      expect(input).toBeTruthy();
      expect(() => target.querySelector(`#${input!.id}`)).not.toThrow();
      expect(target.querySelector(`#${input!.id}`)).toBe(input);
    } finally {
      cleanup();
    }
  });

  it("never rewrites an explicitly passed id", () => {
    const { target, cleanup } = renderComponent(FloatingInput, {
      label: "Search...",
      id: "media-gallery-search",
    });

    try {
      expect(target.querySelector("input")?.id).toBe("media-gallery-search");
    } finally {
      cleanup();
    }
  });
});
