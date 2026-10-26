/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/tab-chrome.test.ts
 * @description One tab-strip chrome for every admin surface.
 *
 * The strip rule is an inset shadow, not a `border-b`, because the strip scrolls
 * horizontally (`overflow-y-clip` would clip a `-mb-px` underline). Triggers are
 * square (`rounded-none!`) so the `Button` inline `border-radius` cannot round
 * them, and the accent is tertiary in light mode / primary in dark mode.
 */

import { afterEach, describe, expect, it } from "vitest";
import Tabs from "@src/components/ui/tabs.svelte";
import { TAB_STRIP, TAB_STRIP_FLUSH, tabTrigger } from "@components/ui/tabs/chrome";
import { renderComponent, settle, type RenderedComponent } from "./render";

const TABS = [
  { id: "permissions", label: "Permissions", icon: "mdi:shield-lock-outline" },
  { id: "roles", label: "Roles", icon: "mdi:account-group" },
];

describe("Tab chrome", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
  });

  it("paints the strip rule as an inset shadow so the underline is never clipped", async () => {
    rendered = renderComponent(Tabs, { tabs: TABS, activeTab: "permissions" });
    await settle();

    const strip = rendered.target.querySelector<HTMLElement>('[role="tablist"]');
    expect(strip?.className).toBe(TAB_STRIP);
    expect(strip?.className).toContain("shadow-[inset_0_-1px_0_0_var(--admin-border-default)]");
    expect(strip?.className).toContain("overflow-x-auto");
    expect(strip?.className).toContain("scrollbar-hide");
    // A `border-b` + `-mb-px` pair is clipped by the scroller — banned.
    expect(strip?.className).not.toContain("border-b");
    expect(strip?.className).not.toContain("-mb-px");
  });

  it("drops the rule when the parent row already paints it", async () => {
    rendered = renderComponent(Tabs, {
      tabs: TABS,
      activeTab: "permissions",
      bordered: false,
    });
    await settle();

    const strip = rendered.target.querySelector<HTMLElement>('[role="tablist"]');
    expect(strip?.className).toBe(TAB_STRIP_FLUSH);
    expect(strip?.className).not.toContain("shadow-[inset");
  });

  it("uses square triggers with the brand accent", async () => {
    rendered = renderComponent(Tabs, { tabs: TABS, activeTab: "roles" });
    await settle();

    const active = rendered.target.querySelector<HTMLElement>('[data-testid="tab-roles"]');
    const idle = rendered.target.querySelector<HTMLElement>('[data-testid="tab-permissions"]');

    for (const trigger of [active, idle]) {
      // `Button` writes an inline border-radius; only `!` wins over it.
      expect(trigger?.className).toContain("rounded-none!");
      expect(trigger?.className).toContain("border-b-2");
    }

    expect(active?.className).toContain("border-tertiary-500");
    expect(active?.className).toContain("dark:border-primary-500");
    expect(idle?.className).toContain("border-transparent");
    expect(idle?.className).toContain("text-(--admin-text-muted)");
  });

  it("keeps layout tweaks additive (flex-1 / justify-center)", () => {
    expect(tabTrigger(true, "flex-1")).toContain("flex-1");
    expect(tabTrigger(false, "justify-center")).toContain("justify-center");
    // No trailing space when a caller passes no extra classes.
    expect(tabTrigger(true).endsWith("dark:text-primary-500")).toBe(true);
  });
});
