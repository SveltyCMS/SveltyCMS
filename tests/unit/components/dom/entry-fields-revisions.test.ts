/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/entry-fields-revisions.test.ts
 * @description Revision history tab renders the persisted revision shape.
 *
 * Regression: the option label read `revision.revision_by` / `revision.revision_at`,
 * but the store returns `authorId` / `createdAt`. Every entry with revision history
 * threw `Cannot read properties of undefined (reading 'substring')` as soon as the
 * Version tab rendered. The component must read the real fields and keep the legacy
 * names as a fallback for cached payloads.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Component } from "svelte";
import Fields from "@src/components/collection-display/fields.svelte";
import MockWidgetInput from "./mocks/mock-widget-input.svelte";
import { collections } from "@src/stores/collection-store.svelte";
import { validationStore } from "@src/stores/validation-store.svelte";
import type { Schema } from "@src/content/types";
import { click, renderComponent, settle, type RenderedComponent } from "./render";

vi.mock("$app/state", () => ({
  page: {
    data: {
      user: { _id: "u1", role: "viewer", username: "viewer" },
      tenantId: "test-tenant",
    },
  },
}));

vi.mock("$app/env", () => import("./mocks/app-env"));

vi.mock("@widgets/widget-loader-registry", () => ({
  getCachedWidgetInputLoader: () => () => Promise.resolve({ default: MockWidgetInput }),
  prefetchWidgetLoaders: vi.fn(),
  resolveWidgetInputLoader: () => () => Promise.resolve({ default: MockWidgetInput }),
}));

vi.mock("@src/stores/widget-store.svelte", () => ({
  widgets: {
    widgetFunctions: {
      Input: { Name: "Input", Icon: "mdi:form-textbox" },
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
  revision: true,
  fields: [{ db_fieldName: "title", label: "Title", widget: { Name: "Input" } }],
} as unknown as Schema;

const persistedRevision = {
  _id: "rev-2",
  contentId: "entry-1",
  version: 2,
  authorId: "abcdef1234567890",
  createdAt: "2026-01-02T10:00:00.000Z",
  updatedAt: "2026-01-02T10:00:00.000Z",
  data: { title: "Second" },
};

describe("entry fields revision history", () => {
  let rendered: RenderedComponent | null = null;

  beforeEach(() => {
    validationStore.clearAllErrors();
    collections.setCollection(schema);
    collections.setMode("edit");
    collections.setCollectionValue({ _id: "entry-1", title: "Second" });
  });

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
    validationStore.clearAllErrors();
  });

  async function openRevisionTab(rows: unknown[]): Promise<HTMLSelectElement> {
    expect(() => {
      rendered = renderComponent(FieldsComponent, {
        collection: schema,
        fields: schema.fields,
        revisions: rows,
      });
    }).not.toThrow();
    await settle();

    const tab = rendered!.target.querySelector('[role="tab"][data-value="1"]');
    expect(tab, "revision tab must be rendered for a revision-enabled collection").not.toBeNull();
    await click(tab);

    const select = rendered!.target.querySelector<HTMLSelectElement>("select");
    expect(select, "revision select must render").not.toBeNull();
    return select!;
  }

  it("renders options from authorId/createdAt without throwing", async () => {
    const select = await openRevisionTab([persistedRevision]);
    const labels = Array.from(select.options, (option) => option.textContent ?? "");

    expect(labels.some((label) => label.includes("by abcdef12"))).toBe(true);
  });

  it("keeps the legacy revision_by/revision_at payload working", async () => {
    const select = await openRevisionTab([
      {
        _id: "rev-legacy",
        revision_by: "deadbeefcafebabe",
        revision_at: "2026-01-01T10:00:00.000Z",
        data: { title: "First" },
      },
    ]);
    const labels = Array.from(select.options, (option) => option.textContent ?? "");

    expect(labels.some((label) => label.includes("by deadbeef"))).toBe(true);
  });
});
