/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/entry-fields-create-skeleton.test.ts
 * @description Guards the first render of the entry field editor in create mode.
 *
 * Regression: clicking "Create" in the entry list (SPA navigation) mounted
 * `<Fields>` with an empty store. Widgets whose `value` prop declares a
 * fallback (`value = $bindable([])`, e.g. Tags) threw `props_invalid_value`
 * ("Cannot do `bind:value={undefined}` when `value` has a fallback value") and
 * SvelteKit rendered the 500 "System Error" page. The editor must seed every
 * declared field synchronously — the seeding effects run after the first mount.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Component } from "svelte";
import Fields from "@src/components/collection-display/fields.svelte";
import MockArrayWidget from "./mocks/mock-array-widget.svelte";
import MockWidgetInput from "./mocks/mock-widget-input.svelte";
import { collections } from "@src/stores/collection-store.svelte";
import { validationStore } from "@src/stores/validation-store.svelte";
import type { Schema } from "@src/content/types";
import { renderComponent, settle, typeText, type RenderedComponent } from "./render";

vi.mock("$app/state", () => ({
  page: {
    data: {
      user: { _id: "u1", role: "admin", username: "admin" },
      tenantId: "test-tenant",
    },
  },
}));

vi.mock("$app/env", () => import("./mocks/app-env"));

vi.mock("@widgets/widget-loader-registry", () => ({
  getCachedWidgetInputLoader: (_name: string) => () =>
    Promise.resolve({ default: _name === "Tags" ? MockArrayWidget : MockWidgetInput }),
  prefetchWidgetLoaders: vi.fn(),
  resolveWidgetInputLoader: () => () => Promise.resolve({ default: MockWidgetInput }),
}));

vi.mock("@src/stores/widget-store.svelte", () => ({
  widgets: {
    widgetFunctions: {
      Input: { Name: "Input", Icon: "mdi:form-textbox" },
      Tags: { Name: "Tags", Icon: "mdi:tag-multiple" },
    },
    loading: false,
    isLoaded: true,
  },
}));

type LooseComponent = Component<Record<string, unknown>>;
const FieldsComponent = Fields as unknown as LooseComponent;

const schema = {
  _id: "posts_col",
  name: "posts",
  slug: "posts",
  fields: [
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, translated: true },
    { db_fieldName: "slug", label: "Slug", widget: { Name: "Input" } },
    { db_fieldName: "tags", label: "Tags", widget: { Name: "Tags" } },
  ],
} as unknown as Schema;

describe("entry fields create-mode first render", () => {
  let rendered: RenderedComponent | null = null;

  beforeEach(() => {
    validationStore.clearAllErrors();
    collections.setCollection(schema);
    collections.setMode("create");
  });

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
    validationStore.clearAllErrors();
  });

  it("mounts from an empty store without handing widgets an undefined binding", async () => {
    // What a fresh create session looks like before any effect has run.
    collections.setCollectionValue({});

    expect(() => {
      rendered = renderComponent(FieldsComponent, { collection: schema, fields: schema.fields });
    }).not.toThrow();

    await settle();

    // The fallback-declaring widget mounted and received an array.
    expect(rendered?.target.querySelector('[data-testid="array-widget-tags"]')).not.toBeNull();
    expect(rendered?.target.querySelector("#field-container-title")).not.toBeNull();
    expect(rendered?.target.querySelector("#field-container-slug")).not.toBeNull();
  });

  it("keeps the seeded values when the store is populated before mount", async () => {
    collections.setCollectionValue({ title: { en: "Hello" }, slug: "hello", tags: ["a", "b"] });

    rendered = renderComponent(FieldsComponent, { collection: schema, fields: schema.fields });
    await settle();

    const tags = rendered.target.querySelector<HTMLInputElement>(
      '[data-testid="array-widget-tags"]',
    );
    expect(tags?.value).toBe("a,b");
  });

  it("reflects translation status on the locale badge as the field is edited", async () => {
    collections.setCollectionValue({ title: { en: "" }, slug: "hello", tags: [] });

    rendered = renderComponent(FieldsComponent, { collection: schema, fields: schema.fields });
    await settle();

    const badge = rendered.target.querySelector<HTMLButtonElement>(
      'button[aria-label^="Switch locale for Title"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("EN");
    expect(badge?.className).toContain("warning");
    expect(badge?.getAttribute("title")).toContain("missing");

    const input = rendered.target.querySelector<HTMLInputElement>('[data-testid="input-title"]');
    await typeText(input, "Hello");
    await settle();

    expect(badge?.className).toContain("success");
    expect(badge?.getAttribute("title")).toContain("present");
  });
});
