/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/api-playground-help-interaction.test.ts
 * @description `/config/api` exposes a per-control `?` help that keyboard users can reach.
 *
 * The builder is the densest form on the page (collection, filters, sort, order,
 * limit, generated queries), so it carries the contract: every control has a
 * `Help: <label>` trigger, the trigger is a real tab stop, and focusing it opens
 * the tooltip and links it through `aria-describedby`.
 */

import { afterEach, describe, expect, it } from "vitest";
import VisualQueryBuilder from "@src/routes/(app)/config/api/visual-query-builder.svelte";
import { renderComponent, settle, type RenderedComponent } from "./render";

const COLLECTIONS = [
  { id: "pages", name: "Pages" },
  { id: "posts", name: "Posts" },
];

const BUILDER_LABELS = [
  "Target Collection",
  "Filter Conditions",
  "Sort Field",
  "Order",
  "Limit (Max rows)",
  "Generated REST Endpoint",
  "Equivalent GraphQL",
  "Execution Response",
];

function helpTrigger(target: HTMLElement, label: string): HTMLButtonElement | null {
  return target.querySelector<HTMLButtonElement>(`button[aria-label="Help: ${label}"]`);
}

describe("API playground help triggers", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
  });

  it("renders a tab-reachable ? for every builder control", async () => {
    rendered = renderComponent(VisualQueryBuilder, { collections: COLLECTIONS });
    await settle();

    for (const label of BUILDER_LABELS) {
      const trigger = helpTrigger(rendered.target, label);
      expect(trigger, `${label} help trigger missing`).toBeTruthy();
      expect(trigger?.getAttribute("tabindex"), `${label} is not a tab stop`).toBe("0");
    }
  });

  it("opens the tooltip from keyboard focus and links it with aria-describedby", async () => {
    rendered = renderComponent(VisualQueryBuilder, { collections: COLLECTIONS });
    await settle();

    const trigger = helpTrigger(rendered.target, "Target Collection");
    if (!trigger) throw new Error("Target Collection help trigger missing");

    trigger.focus();
    await settle();

    // The tooltip portals to <body>; /api/collections/ is locale-independent copy.
    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip?.textContent).toContain("/api/collections/");
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip?.id);
  });
});
