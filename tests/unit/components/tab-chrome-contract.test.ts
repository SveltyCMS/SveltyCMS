/**
 * @file tests/unit/components/tab-chrome-contract.test.ts
 * @description Every admin tab strip consumes `@components/ui/tabs/chrome`.
 *
 * The strip previously existed in four dialects: no rule (access management, API,
 * account tabs), a rule with a 1 px gap (extensions), a boxed segmented control
 * (sync), and the underline reference (/user). A hand-rolled strip that does not
 * import the shared tokens is how the drift came back — fail here instead.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TAB_ROW,
  TAB_STRIP,
  TAB_STRIP_FLUSH,
  TAB_TRIGGER,
  TAB_TRIGGER_ACTIVE,
  TAB_TRIGGER_INACTIVE,
} from "@components/ui/tabs/chrome";

const root = process.cwd();

function source(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const HAND_ROLLED_STRIPS = [
  "src/routes/(app)/user/components/user-management.svelte",
  "src/routes/(app)/config/extensions/+page.svelte",
  "src/routes/(app)/config/sync/+page.svelte",
  "src/routes/(app)/config/design-system/+page.svelte",
  "src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/+page.svelte",
  "src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/modal-widget-form.svelte",
];

describe("Tab chrome contract", () => {
  it.each(HAND_ROLLED_STRIPS)("%s imports the shared chrome", (file) => {
    expect(source(file)).toMatch(/@components\/ui\/tabs\/chrome/);
  });

  it.each(HAND_ROLLED_STRIPS)("%s does not re-declare underline chrome", (file) => {
    const code = source(file);
    expect(code, "raw accent pair").not.toContain(
      "'border-primary-500 text-primary-600 dark:text-primary-500'",
    );
    expect(code, "outlined segmented control").not.toContain("bg-primary-500! text-white!");
    // `-mb-px` cannot work inside the horizontally scrollable strip.
    expect(code, "negative-margin underline").not.toContain("-mb-px");
  });

  it("keeps the primitives on the same tokens", () => {
    expect(source("src/components/ui/tabs/list.svelte")).toMatch(/TAB_STRIP/);
    expect(source("src/components/ui/tabs/trigger.svelte")).toMatch(/tabTrigger\(/);
    expect(source("src/components/ui/tabs.svelte")).toMatch(/TAB_STRIP/);
    expect(source("src/components/ui/tabs.svelte")).toMatch(/bordered/);
  });

  it("owns one rule token and one accent pair", () => {
    // Rule: an inset shadow, so a scrolling strip cannot clip the underline.
    expect(TAB_STRIP).toContain("shadow-[inset_0_-1px_0_0_var(--admin-border-default)]");
    expect(TAB_ROW).toContain("shadow-[inset_0_-1px_0_0_var(--admin-border-default)]");
    expect(TAB_STRIP_FLUSH).not.toContain("shadow-[inset");

    // Accent: tertiary in light mode, primary in dark mode.
    expect(TAB_TRIGGER_ACTIVE).toContain("border-tertiary-500 text-tertiary-600");
    expect(TAB_TRIGGER_ACTIVE).toContain("dark:border-primary-500 dark:text-primary-500");
    expect(TAB_TRIGGER_INACTIVE).toContain("border-transparent");

    // A negative margin cannot survive `overflow-y-clip`.
    for (const token of [TAB_STRIP, TAB_STRIP_FLUSH, TAB_ROW, TAB_TRIGGER]) {
      expect(token).not.toContain("-mb-px");
    }
  });
});
