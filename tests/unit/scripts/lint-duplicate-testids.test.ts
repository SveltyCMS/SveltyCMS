/**
 * @file tests/unit/scripts/lint-duplicate-testids.test.ts
 * @description Fixtures for the duplicate `data-testid` gate.
 *
 * Pins the exact shape that broke the Media & Dashboard E2E shard: a route
 * passing `data-testid="media-grid"` to a wrapper component around
 * `media-grid.svelte`, which already renders that id — Playwright strict mode
 * then resolved `getByTestId("media-grid")` to two elements.
 */

import { describe, expect, it } from "vitest";
import {
  findDuplicateTestIds,
  type SvelteSource,
} from "../../../scripts/lint/lint-duplicate-testids";

const component = (path: string, source: string): SvelteSource => ({ path, source });

describe("findDuplicateTestIds", () => {
  it("flags a wrapper component reusing a child's testid", () => {
    const offenses = findDuplicateTestIds([
      component(
        "src/components/media/media-grid.svelte",
        `<div role="grid" data-testid="media-grid">{#each files as file}<span /></div>`,
      ),
      component(
        "src/routes/(app)/mediagallery/+page.svelte",
        `<script>import MediaGrid from "@components/media/media-grid.svelte";</script>
<AdminCard data-testid="media-grid"><MediaGrid /></AdminCard>`,
      ),
    ]);

    expect(offenses).toHaveLength(1);
    expect(offenses[0]).toMatchObject({
      file: "src/routes/(app)/mediagallery/+page.svelte",
      tag: "AdminCard",
      testId: "media-grid",
      declaredIn: "src/components/media/media-grid.svelte",
      line: 2,
    });
  });

  it("ignores native elements that wrap a component", () => {
    const offenses = findDuplicateTestIds([
      component("src/components/media/media-grid.svelte", `<div data-testid="media-grid" />`),
      component(
        "src/routes/(app)/mediagallery/+page.svelte",
        `<div data-testid="media-grid"><MediaGrid /></div>`,
      ),
    ]);

    expect(offenses).toEqual([]);
  });

  it("keeps scanning past arrow functions in props", () => {
    const offenses = findDuplicateTestIds([
      component("src/components/x/thing.svelte", `<p data-testid="thing" />`),
      component(
        "src/routes/(app)/x/+page.svelte",
        `<Thing onclick={() => go()} data-testid="thing" />`,
      ),
    ]);

    expect(offenses).toHaveLength(1);
    expect(offenses[0]?.tag).toBe("Thing");
  });

  it("honours the testid-allow escape hatch", () => {
    const files = [
      component("src/components/x/thing.svelte", `<p data-testid="thing" />`),
      component(
        "src/routes/(app)/x/+page.svelte",
        `<!-- testid-allow: the tile id is intentional -->
<Thing data-testid="thing" />`,
      ),
    ];

    expect(findDuplicateTestIds(files)).toEqual([]);
  });

  it("only inspects routes, never component-to-component reuse", () => {
    const offenses = findDuplicateTestIds([
      component("src/components/a/one.svelte", `<p data-testid="shared" />`),
      component("src/components/b/two.svelte", `<One data-testid="shared" />`),
    ]);

    expect(offenses).toEqual([]);
  });

  it("flags the same testid on two component tags in one file (duplicated paste)", () => {
    const offenses = findDuplicateTestIds([
      component(
        "src/routes/(app)/config/redirects/+page.svelte",
        `<AdminCard data-testid="redirects-modal">a</AdminCard>
<AdminCard data-testid="redirects-modal">b</AdminCard>`,
      ),
    ]);

    expect(offenses).toHaveLength(1);
    expect(offenses[0]).toMatchObject({
      kind: "within-file",
      file: "src/routes/(app)/config/redirects/+page.svelte",
      line: 2,
      tag: "AdminCard",
      testId: "redirects-modal",
    });
  });

  it("ignores the same id on different components in exclusive branches", () => {
    const offenses = findDuplicateTestIds([
      component(
        "src/widgets/core/input/input.svelte",
        `{#if big}<Textarea data-testid="text-input" />{:else}<Input data-testid="text-input" />{/if}`,
      ),
    ]);

    expect(offenses).toEqual([]);
  });

  it("ignores repeated native ids (list pattern)", () => {
    const offenses = findDuplicateTestIds([
      component(
        "src/routes/(app)/x/+page.svelte",
        `<div data-testid="row" /><div data-testid="row" />`,
      ),
    ]);

    expect(offenses).toEqual([]);
  });

  it("ignores dynamic testids, which are not statically decidable", () => {
    const offenses = findDuplicateTestIds([
      component(
        "src/routes/(app)/x/+page.svelte",
        `<Button data-testid="row-{id}" /><Button data-testid="row-{id}" />`,
      ),
    ]);

    expect(offenses).toEqual([]);
  });
});
