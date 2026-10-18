/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/collection-builder-fields-interaction.test.ts
 * @description Real DOM interaction tests for the Collection Builder field editor.
 *
 * Covers the authoring surface that previously only had CI Playwright coverage:
 * widget discovery, the field configuration form (create + edit), database-name
 * generation, behaviour switches, widget-specific GuiSchema settings, delete /
 * duplicate signals, reorder persistence, and the final GuiFields serialization.
 *
 * The widget registry is seeded with synthetic factories (the real widgets are
 * network/file-heavy to import), and `@thisux/sveltednd` + `@utils/modal.svelte`
 * are mocked at the boundary — the components, their bindings, and the real
 * collection/widget stores run for real.
 *
 * ### Features:
 * - picker disabled until a collection is chosen; options come from its fields
 * - widget modal lists/filters core + custom widgets and returns the selection
 * - db_fieldName auto-generates from the label and keeps a manual override
 * - save stays disabled until label + db_fieldName exist
 * - required / translated toggles reach the saved payload
 * - Settings tab binds number, textarea, select, and nested-group controls
 * - delete removes + reindexes; duplicate appends with a unique column name
 * - drag-drop handler reorders the array and persists to the collection store
 * - Save rebuilds `widget.GuiFields` from the GuiSchema + primitives
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Component } from "svelte";
import type { Schema } from "@src/content/types";
import FieldPicker from "@src/components/system/builder/field-picker.svelte";
import CollectionFields from "@src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/widget.svelte";
import ModalSelectWidget from "@src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/modal-select-widget.svelte";
import ModalWidgetForm from "@src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/modal-widget-form.svelte";
import { collections } from "@src/stores/collection-store.svelte";
import { click, renderComponent, select, settle, typeText } from "./render";

/** Both components expose `any`/quoted props; widen the helper's inference to match. */
type LooseComponent = Component<Record<string, unknown>>;
const Form = ModalWidgetForm as unknown as LooseComponent;
const Fields = CollectionFields as unknown as LooseComponent;

const widgetStore = vi.hoisted(() => ({
  state: {
    widgetFunctions: {} as Record<string, unknown>,
    coreWidgets: [] as string[],
    customWidgets: [] as string[],
    marketplaceWidgets: [] as string[],
    isLoaded: true,
    initialize: vi.fn(async () => {}),
  },
}));

function widgetStoreMock() {
  return {
    widgets: widgetStore.state,
    getWidgetFunction: (name: string) => widgetStore.state.widgetFunctions[name],
    getWidget: () => undefined,
    isWidgetActive: () => true,
    isWidgetCore: () => true,
    canDisableWidget: () => true,
  };
}

vi.mock("@src/stores/widget-store.svelte", widgetStoreMock);
vi.mock("@src/stores/widget-store.svelte.ts", widgetStoreMock);

const dnd = vi.hoisted(() => ({
  draggable: vi.fn((_node: unknown, _params?: unknown) => ({ destroy() {} })),
  droppable: vi.fn((_node: unknown, _params?: unknown) => ({ destroy() {} })),
}));

vi.mock("@thisux/sveltednd", () => dnd);

const modal = vi.hoisted(() => ({
  trigger: vi.fn(),
  close: vi.fn(),
  clear: vi.fn(),
  showConfirm: vi.fn(),
  active: null as unknown,
}));

vi.mock("@utils/modal.svelte", () => ({
  modalState: modal,
  showConfirm: modal.showConfirm,
}));

interface FieldLike {
  id: number;
  label: string;
  db_fieldName?: string;
  icon?: string;
  required?: boolean;
  translated?: boolean;
  permissions?: Record<string, Record<string, boolean>>;
  widget: { Name: string; key?: string; GuiFields?: Record<string, unknown> };
  [key: string]: unknown;
}

interface DropState {
  draggedItem?: { id: number; label: string };
  targetElement?: Element | null;
  dropPosition?: "before" | "after";
}

const GUI_SCHEMA = {
  label: { widget: "Input" },
  db_fieldName: { widget: "Input" },
  required: { widget: "Toggles" },
  translated: { widget: "Toggles" },
  placeholder: { widget: "Input" },
  maxLength: { widget: "Input", type: "number" },
  help: { widget: "Textarea" },
  options: {
    widget: "Select",
    options: [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ],
  },
  group: {
    widget: "group",
    label: "Advanced",
    fields: {
      hint: { widget: "Input", label: "Hint" },
      secret: { widget: "Toggles", label: "Secret" },
    },
  },
};

function widgetRegistry() {
  return {
    Input: {
      Name: "Input",
      Icon: "mdi:form-textbox",
      Description: "Text input",
      GuiSchema: GUI_SCHEMA,
    },
    Relation: {
      Name: "Relation",
      Icon: "mdi:relation-one-to-one",
      Description: "Related entry",
      GuiSchema: {
        ...GUI_SCHEMA,
        collection: {
          widget: "Select",
          options: [{ value: "posts", label: "Posts" }],
        },
      },
    },
    "Seo Meta": {
      Name: "Seo Meta",
      Icon: "mdi:seo",
      Description: "Search metadata",
      GuiSchema: GUI_SCHEMA,
    },
  };
}

function makeField(overrides: Partial<FieldLike> = {}): FieldLike {
  return {
    id: 1,
    label: "Title",
    db_fieldName: "title",
    icon: "mdi:form-textbox",
    required: false,
    translated: false,
    permissions: {},
    widget: { Name: "Input", key: "Input", GuiFields: { label: "Title" } },
    ...overrides,
  };
}

function seedWidgets(): void {
  widgetStore.state.widgetFunctions = widgetRegistry();
  widgetStore.state.coreWidgets = ["Input", "Relation"];
  widgetStore.state.customWidgets = ["Seo Meta"];
  widgetStore.state.marketplaceWidgets = [];
  widgetStore.state.isLoaded = true;
}

beforeEach(() => {
  seedWidgets();
  collections.active = null;
  collections.activeValue = {};
  collections.all = {};
  modal.trigger.mockReset();
  modal.close.mockReset();
  modal.active = { component: (() => {}) as never, props: {} };
  dnd.draggable.mockClear();
  dnd.droppable.mockClear();
});

afterEach(() => {
  widgetStore.state.widgetFunctions = {};
  widgetStore.state.coreWidgets = [];
  widgetStore.state.customWidgets = [];
  widgetStore.state.marketplaceWidgets = [];
  collections.activeValue = {};
  collections.all = {};
  modal.active = null;
});

describe("FieldPicker", () => {
  it("is disabled without a collection and lists the selected collection's fields", async () => {
    collections.all = {
      c1: {
        name: "posts",
        fields: [{ db_fieldName: "title" }, { db_fieldName: "body" }],
      } as unknown as Schema,
    };

    const empty = renderComponent(FieldPicker, { collection: "", value: "" });
    try {
      expect(empty.target.querySelector("select")).toBeDisabled();
    } finally {
      empty.cleanup();
    }

    const rendered = renderComponent(FieldPicker, { collection: "posts", value: "" });
    try {
      const selectEl = rendered.target.querySelector<HTMLSelectElement>(
        'select[aria-label="Display Field"]',
      );
      expect(selectEl).not.toBeNull();
      expect(selectEl).not.toBeDisabled();
      expect([...selectEl!.options].map((option) => option.value)).toEqual(
        expect.arrayContaining(["title", "body"]),
      );

      await select(selectEl, "body");
      expect(selectEl!.value).toBe("body");
    } finally {
      rendered.cleanup();
    }
  });

  it("stays empty for an unknown collection", () => {
    collections.all = {
      c1: {
        name: "posts",
        fields: [{ db_fieldName: "title" }],
      } as unknown as Schema,
    };

    const { target, cleanup } = renderComponent(FieldPicker, {
      collection: "missing",
      value: "",
    });
    try {
      const selectEl = target.querySelector<HTMLSelectElement>("select");
      // `disabled` depends on whether a collection was passed, not on whether it
      // resolves — an unknown name renders an enabled, empty picker.
      expect(selectEl).not.toBeDisabled();
      expect([...selectEl!.options].filter((option) => option.value)).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});

describe("widget discovery modal", () => {
  it("lists core + custom widgets, filters by search, and returns the selection", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(ModalSelectWidget, { close });

    try {
      expect(target.querySelector('[data-testid="select-widget-input"]')).toBeInTheDocument();
      expect(target.querySelector('[data-testid="select-widget-relation"]')).toBeInTheDocument();
      expect(target.querySelector('[data-testid="select-widget-seo meta"]')).toBeInTheDocument();

      const search = target.querySelector<HTMLInputElement>('[data-testid="select-widget-search"]');
      expect(search).not.toBeNull();
      await typeText(search, "rel");
      expect(search!.value).toBe("rel");

      expect(target.querySelector('[data-testid="select-widget-input"]')).not.toBeInTheDocument();
      expect(target.querySelector('[data-testid="select-widget-relation"]')).toBeInTheDocument();

      await click(target.querySelector('[data-testid="select-widget-relation"]'));
      expect(close).toHaveBeenCalledWith({ selectedWidget: "Relation" });
    } finally {
      cleanup();
    }
  });

  it("does not offer a widget that has no GuiSchema", () => {
    widgetStore.state.widgetFunctions = {
      ...widgetRegistry(),
      Broken: { Name: "Broken", Description: "No schema" },
    };
    widgetStore.state.coreWidgets = ["Broken", "Input"];

    const { target, cleanup } = renderComponent(ModalSelectWidget, { close: vi.fn() });
    try {
      expect(target.querySelector('[data-testid="select-widget-input"]')).toBeInTheDocument();
      expect(target.querySelector('[data-testid="select-widget-broken"]')).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});

describe("field configuration form", () => {
  it("auto-generates db_fieldName from the label and preserves a manual override", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(Form, {
      value: {
        widget: { key: "Input", Name: "Input" },
        label: "",
        db_fieldName: "",
        required: false,
        translated: false,
      },
      close,
    });

    try {
      const label = target.querySelector<HTMLInputElement>("#field-label");
      const dbName = target.querySelector<HTMLInputElement>("#field-dbname");
      expect(label).not.toBeNull();
      expect(dbName).not.toBeNull();
      expect(dbName!.value).toBe("");

      await typeText(label, "Blog Title");
      expect(dbName!.value).toBe("blog_title");

      await typeText(dbName, "custom_column");
      await typeText(label, "Another Title");
      expect(dbName!.value).toBe("custom_column");

      await click(target.querySelector('[data-testid="widget-field-apply"]'));
      expect(close).toHaveBeenCalledTimes(1);
      expect(close.mock.calls[0][0]).toMatchObject({
        label: "Another Title",
        db_fieldName: "custom_column",
        required: false,
        translated: false,
        widget: { key: "Input", Name: "Input" },
      });
    } finally {
      cleanup();
    }
  });

  it("keeps Save disabled until label and database name exist", async () => {
    const { target, cleanup } = renderComponent(Form, {
      value: { widget: { key: "Input" }, label: "", db_fieldName: "" },
      close: vi.fn(),
    });

    try {
      const apply = target.querySelector<HTMLButtonElement>('[data-testid="widget-field-apply"]');
      expect(apply).toBeDisabled();

      await typeText(target.querySelector("#field-label"), "Name");
      await settle();
      expect(apply).not.toBeDisabled();
    } finally {
      cleanup();
    }
  });

  it("carries required and translated switches into the saved field", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(Form, {
      value: {
        id: 4,
        widget: { key: "Input", Name: "Input" },
        label: "Title",
        db_fieldName: "title",
        required: false,
        translated: false,
      },
      close,
    });

    try {
      const required = target.querySelector<HTMLButtonElement>(
        '[data-testid="widget-field-required"] button[role="switch"]',
      );
      const translated = target.querySelector<HTMLButtonElement>(
        '[data-testid="widget-field-translated"] button[role="switch"]',
      );
      expect(required).not.toBeNull();
      expect(translated).not.toBeNull();

      await click(required);
      await click(translated);
      expect(required).toHaveAttribute("aria-checked", "true");
      expect(translated).toHaveAttribute("aria-checked", "true");

      await click(target.querySelector('[data-testid="widget-field-apply"]'));
      expect(close.mock.calls[0][0]).toMatchObject({
        id: 4,
        required: true,
        translated: true,
      });
    } finally {
      cleanup();
    }
  });

  it("renders widget-specific GuiSchema settings and merges them into the payload", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(Form, {
      value: { widget: { key: "Input", Name: "Input" }, label: "Title", db_fieldName: "title" },
      close,
    });

    try {
      await click(target.querySelector('[data-testid="tab-settings"]'));

      await typeText(
        target.querySelector<HTMLInputElement>('input[aria-label="Max Length"]'),
        "120",
      );
      await typeText(
        target.querySelector<HTMLTextAreaElement>('textarea[aria-label="Help"]'),
        "Shown below the field",
      );
      await select(target.querySelector<HTMLSelectElement>('select[aria-label="Options"]'), "b");
      await typeText(
        target.querySelector<HTMLInputElement>('input[aria-label="Hint"]'),
        "Grouped hint",
      );
      await click(target.querySelector('button[role="switch"][aria-label="Secret"]'));

      await click(target.querySelector('[data-testid="widget-field-apply"]'));
      expect(close.mock.calls[0][0]).toMatchObject({
        maxLength: 120,
        help: "Shown below the field",
        options: "b",
        group: { hint: "Grouped hint", secret: true },
      });
    } finally {
      cleanup();
    }
  });

  it("emits delete, duplicate, and cancel signals", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const close = vi.fn();
    const { target, cleanup } = renderComponent(Form, {
      value: { id: 7, widget: { key: "Input" }, label: "Title", db_fieldName: "title" },
      close,
    });

    try {
      await click(target.querySelector('[data-testid="widget-field-delete"]'));
      expect(close).toHaveBeenLastCalledWith(expect.objectContaining({ __delete: true, id: 7 }));

      await click(target.querySelector('[data-testid="widget-field-duplicate"]'));
      expect(close).toHaveBeenLastCalledWith(expect.objectContaining({ __duplicate: true, id: 7 }));

      await click(target.querySelector('[data-testid="widget-field-cancel"]'));
      expect(close).toHaveBeenLastCalledWith(undefined);
    } finally {
      confirmSpy.mockRestore();
      cleanup();
    }
  });
});

describe("collection field list", () => {
  function mountList(onSave = vi.fn()) {
    collections.activeValue = {
      fields: [
        makeField({ id: 1 }),
        makeField({
          id: 2,
          label: "Body",
          db_fieldName: "body",
          widget: { Name: "Input", key: "Input", GuiFields: { label: "Body" } },
        }),
      ],
    };
    return { onSave, ...renderComponent(Fields, { "on:save": onSave }) };
  }

  it("renders the configured fields with their identity columns", () => {
    const { target, cleanup } = mountList();
    try {
      const titleRow = target.querySelector('[data-field-label="Title"]');
      const bodyRow = target.querySelector('[data-field-label="Body"]');
      expect(titleRow).toBeInTheDocument();
      expect(bodyRow).toBeInTheDocument();
      expect(titleRow).toHaveTextContent("title");
      expect(titleRow).toHaveTextContent("Input");
      expect(target.querySelector('[data-testid="collection-field-edit-1"]')).toBeInTheDocument();
      expect(target.querySelector('[data-testid="collection-field-edit-2"]')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it("reorders fields through the drag-drop handler and persists the new order", async () => {
    const { target, cleanup } = mountList();
    try {
      const rows = [...target.querySelectorAll<HTMLElement>("[data-field-label]")];
      const titleRow = rows.find((row) => row.dataset.fieldLabel === "Title");
      const bodyRow = rows.find((row) => row.dataset.fieldLabel === "Body");
      expect(titleRow).toBeDefined();
      expect(bodyRow).toBeDefined();

      const dropParams = dnd.droppable.mock.calls[0]?.[1] as
        | { callbacks: { onDrop: (state: DropState) => void } }
        | undefined;
      expect(dropParams).toBeDefined();

      dropParams!.callbacks.onDrop({
        draggedItem: { id: 1, label: "Title" },
        targetElement: bodyRow,
        dropPosition: "after",
      });
      await settle();

      expect((collections.activeValue.fields as FieldLike[]).map((field) => field.label)).toEqual([
        "Body",
        "Title",
      ]);
    } finally {
      cleanup();
    }
  });

  it("opens the widget picker, then the form, and appends the configured field", async () => {
    const { target, cleanup } = mountList();
    try {
      await click(target.querySelector('[data-testid="collection-field-add"]'));

      expect(modal.trigger).toHaveBeenCalledTimes(1);
      const [pickerComponent, pickerProps, pickerResponse] = modal.trigger.mock.calls[0];
      expect(pickerComponent).toBe(ModalSelectWidget);
      expect(pickerProps.title).toBe("Select a Widget");

      pickerResponse({ selectedWidget: "Input" });
      await settle();

      expect(modal.trigger).toHaveBeenCalledTimes(2);
      const [formComponent, formProps, formResponse] = modal.trigger.mock.calls[1];
      expect(formComponent).toBe(ModalWidgetForm);
      expect(formProps.value.widget).toMatchObject({ key: "Input", Name: "Input" });

      formResponse({
        label: "Summary",
        db_fieldName: "summary",
        widget: { key: "Input", Name: "Input", GuiFields: {} },
      });
      await settle();

      const fields = collections.activeValue.fields as FieldLike[];
      expect(fields.map((field) => field.label)).toEqual(["Title", "Body", "Summary"]);
      expect(fields[2].id).toBe(3);
    } finally {
      cleanup();
    }
  });

  it("persists an edited field in place", async () => {
    const { target, cleanup } = mountList();
    try {
      await click(target.querySelector('[data-testid="collection-field-edit-1"]'));

      expect(modal.trigger).toHaveBeenCalledTimes(1);
      const [formComponent, formProps, formResponse] = modal.trigger.mock.calls[0];
      expect(formComponent).toBe(ModalWidgetForm);
      expect(formProps.value.label).toBe("Title");

      formResponse({
        ...formProps.value,
        label: "Headline",
        db_fieldName: "headline",
        required: true,
      });
      await settle();

      const fields = collections.activeValue.fields as FieldLike[];
      expect(fields).toHaveLength(2);
      expect(fields[0]).toMatchObject({
        label: "Headline",
        db_fieldName: "headline",
        required: true,
      });
    } finally {
      cleanup();
    }
  });

  it("removes a deleted field and reindexes the remaining ids", async () => {
    const { target, cleanup } = mountList();
    try {
      await click(target.querySelector('[data-testid="collection-field-edit-1"]'));
      const [, formProps, formResponse] = modal.trigger.mock.calls[0];

      formResponse({ ...formProps.value, __delete: true });
      await settle();

      const fields = collections.activeValue.fields as FieldLike[];
      expect(fields.map((field) => field.label)).toEqual(["Body"]);
      expect(fields.map((field) => field.id)).toEqual([1]);
    } finally {
      cleanup();
    }
  });

  it("duplicates a field with a unique label and database column", async () => {
    const { target, cleanup } = mountList();
    try {
      await click(target.querySelector('[data-testid="collection-field-edit-1"]'));
      const [, formProps, formResponse] = modal.trigger.mock.calls[0];

      formResponse({ ...formProps.value, __duplicate: true });
      await settle();
      formResponse({ ...formProps.value, __duplicate: true });
      await settle();

      const fields = collections.activeValue.fields as FieldLike[];
      expect(fields.map((field) => field.label)).toEqual([
        "Title",
        "Body",
        "Title (copy)",
        "Title (copy)",
      ]);
      expect(fields.map((field) => field.db_fieldName)).toEqual([
        "title",
        "body",
        "title_copy",
        "title_copy_2",
      ]);
      expect(fields.map((field) => field.id)).toEqual([1, 2, 3, 4]);
    } finally {
      cleanup();
    }
  });

  it("rebuilds widget.GuiFields from the GuiSchema and primitive field properties on save", async () => {
    const { target, cleanup, onSave } = mountList();
    try {
      await click(target.querySelector('[data-testid="collection-field-save"]'));

      expect(onSave).toHaveBeenCalledTimes(1);
      const fields = collections.activeValue.fields as FieldLike[];
      expect(fields[0].widget.GuiFields).toMatchObject({
        label: "Title",
        db_fieldName: "title",
        required: false,
        translated: false,
      });
    } finally {
      cleanup();
    }
  });
});
