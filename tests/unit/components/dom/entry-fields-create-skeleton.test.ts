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
import { publicEnv } from "@src/stores/global-settings.svelte";
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
    publicEnv.AVAILABLE_CONTENT_LANGUAGES = ["en", "de"] as any;
    collections.setCollectionValue({ title: { en: "", de: "" }, slug: "hello", tags: [] });

    rendered = renderComponent(FieldsComponent, { collection: schema, fields: schema.fields });
    await settle();

    const badge = rendered.target.querySelector<HTMLElement>('[data-testid="field-locale-status"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("EN");
    expect(badge?.textContent).toContain("0%");
    expect(badge?.getAttribute("aria-label")).toContain("missing");

    const input = rendered.target.querySelector<HTMLInputElement>('[data-testid="input-title"]');
    await typeText(input, "Hello");
    await settle();

    expect(badge?.textContent).toContain("50%");
    expect(badge?.getAttribute("aria-label")).toContain("present");
  });

  it("treats empty rich text objects and blank HTML wrappers as untranslated (0%)", async () => {
    publicEnv.AVAILABLE_CONTENT_LANGUAGES = ["en", "de"] as any;
    const richTextSchema = {
      _id: "pages_col",
      name: "pages",
      slug: "pages",
      fields: [
        { db_fieldName: "body", label: "Body", widget: { Name: "RichText" }, translated: true },
      ],
    } as unknown as Schema;

    collections.setCollection(richTextSchema);
    // Seed with empty RichText object structure as generated on initialization
    collections.setCollectionValue({ body: { en: { title: "", content: "" }, de: "" } });

    rendered = renderComponent(FieldsComponent, {
      collection: richTextSchema,
      fields: richTextSchema.fields,
    });
    await settle();

    const badge = rendered.target.querySelector<HTMLElement>('[data-testid="field-locale-status"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("0%");
    expect(badge?.getAttribute("aria-label")).toContain("missing");

    // Also verify HTML-only empty wrappers like <p><br></p> are detected as untranslated
    collections.setCollectionValue({ body: { en: "<p><br></p>", de: "" } });
    await settle();

    expect(badge?.textContent).toContain("0%");
    expect(badge?.getAttribute("aria-label")).toContain("missing");
  });
});
