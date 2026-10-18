/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/collection-builder-conditions-interaction.test.ts
 * @description Real DOM interaction tests for Collection Builder Validation, Conditions, and Live Preview.
 *
 * Covers:
 * - Validation Tab: preset selection (email, slug, numeric), custom regex, error messages, and min/max bounds.
 * - Conditions Tab: showIf dynamic visibility and requiredIf conditional requirements across operators.
 * - Permissions Tab: public/private visibility, requireAuth, and role access matrix.
 * - Two-way validation synchronization between canonical validation object and field-level properties.
 * - Live Form Preview: dynamic evaluation of showIf / requiredIf upon user inputs, sample data fill/clear, and responsive viewports.
 *
 * ### Features:
 * - regex preset dropdown populates pattern and error message
 * - custom regex and error message persist to validation schema
 * - min/max length and numeric range bounds coerce to numbers and persist
 * - showIf toggle reveals condition inputs and saves structured rule
 * - requiredIf toggle configures conditional requirement with operator support
 * - permissions tab updates visibility, requireAuth, and role matrix
 * - form-preview reacts to checkbox and text changes to show/hide conditional fields
 * - form-preview toggles responsive viewports and populates sample data
 */

import { describe, expect, it, vi } from "vitest";
import type { Component } from "svelte";
import ModalWidgetForm from "@src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/modal-widget-form.svelte";
import FormPreview from "@src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/form-preview.svelte";
import type { Role } from "@src/databases/auth/types";
import type { DatabaseId } from "@src/databases/db-interface";
import type { ISODateString } from "@src/content/types";
import {
  preview_desktop_aria,
  preview_mobile_aria,
  preview_required_if_badge,
  preview_tablet_aria,
  widget_conditions_requirement_aria,
  widget_conditions_visibility_aria,
  widget_form_require_auth_aria,
  widget_form_role_edit_aria,
  widget_form_role_view_aria,
} from "@src/paraglide/messages";
import { click, renderComponent, select, settle, typeText } from "./render";

type LooseComponent = Component<Record<string, unknown>>;
const Form = ModalWidgetForm as unknown as LooseComponent;
const Preview = FormPreview as unknown as LooseComponent;

const widgetStore = vi.hoisted(() => ({
  state: {
    widgetFunctions: {
      input: {
        Name: "Input",
        GuiSchema: {},
      },
      checkbox: {
        Name: "Checkbox",
        GuiSchema: {},
      },
    } as Record<string, unknown>,
    coreWidgets: ["input", "checkbox"],
    customWidgets: [],
    marketplaceWidgets: [],
    isLoaded: true,
    initialize: vi.fn(async () => {}),
  },
}));

function widgetStoreMock() {
  return {
    widgets: widgetStore.state,
    getWidgetFunction: (name: string) => widgetStore.state.widgetFunctions[name.toLowerCase()],
    getWidget: () => undefined,
    isWidgetActive: () => true,
    isWidgetCore: () => true,
    canDisableWidget: () => true,
  };
}

vi.mock("@src/stores/widget-store.svelte", widgetStoreMock);
vi.mock("@src/stores/widget-store.svelte.ts", widgetStoreMock);

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

const SAMPLE_ROLES: Role[] = [
  {
    _id: "role_editor" as DatabaseId,
    name: "Editor",
    description: "Can edit content",
    permissions: [],
    isAdmin: false,
    createdAt: "2026-01-01T00:00:00.000Z" as ISODateString,
    updatedAt: "2026-01-01T00:00:00.000Z" as ISODateString,
  },
  {
    _id: "role_viewer" as DatabaseId,
    name: "Viewer",
    description: "Read only",
    permissions: [],
    isAdmin: false,
    createdAt: "2026-01-01T00:00:00.000Z" as ISODateString,
    updatedAt: "2026-01-01T00:00:00.000Z" as ISODateString,
  },
];

describe("Collection Builder — Validation Tab", () => {
  it("populates pattern and message when selecting a preset", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(Form, {
      value: {
        widget: { key: "Input", Name: "Input" },
        label: "Contact Email",
        db_fieldName: "contact_email",
      },
      close,
    });

    try {
      await click(target.querySelector('[data-testid="tab-validation"]'));

      const presetSelect = target.querySelector<HTMLSelectElement>("#validation-preset");
      expect(presetSelect).not.toBeNull();

      await select(presetSelect, "email");

      const patternInput = target.querySelector<HTMLInputElement>("#validation-pattern");
      const messageInput = target.querySelector<HTMLInputElement>("#validation-message");

      expect(patternInput?.value).toBe("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$");
      expect(messageInput?.value).toBe("Must be a valid email address");

      await click(target.querySelector('[data-testid="widget-field-apply"]'));
      expect(close).toHaveBeenCalledTimes(1);
      const saved = close.mock.calls[0][0];
      expect(saved.pattern).toBe("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$");
      expect(saved.patternMessage).toBe("Must be a valid email address");
      expect(saved.validation).toMatchObject({
        pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
        patternMessage: "Must be a valid email address",
      });
    } finally {
      cleanup();
    }
  });

  it("persists custom pattern, custom error message, and numeric constraints", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(Form, {
      value: {
        widget: { key: "Input", Name: "Input" },
        label: "Product SKU",
        db_fieldName: "product_sku",
      },
      close,
    });

    try {
      await click(target.querySelector('[data-testid="tab-validation"]'));

      await typeText(
        target.querySelector<HTMLInputElement>("#validation-pattern"),
        "^[A-Z]{3}-\\d{4}$",
      );
      await typeText(
        target.querySelector<HTMLInputElement>("#validation-message"),
        "SKU format must be ABC-1234",
      );
      await typeText(target.querySelector<HTMLInputElement>("#val-min-len"), "8");
      await typeText(target.querySelector<HTMLInputElement>("#val-max-len"), "8");
      await typeText(target.querySelector<HTMLInputElement>("#val-min-val"), "10");
      await typeText(target.querySelector<HTMLInputElement>("#val-max-val"), "999");

      await click(target.querySelector('[data-testid="widget-field-apply"]'));
      expect(close).toHaveBeenCalledTimes(1);
      const saved = close.mock.calls[0][0];

      expect(saved.pattern).toBe("^[A-Z]{3}-\\d{4}$");
      expect(saved.patternMessage).toBe("SKU format must be ABC-1234");
      expect(saved.minLength).toBe(8);
      expect(saved.maxLength).toBe(8);
      expect(saved.min).toBe(10);
      expect(saved.max).toBe(999);

      expect(saved.validation).toEqual({
        pattern: "^[A-Z]{3}-\\d{4}$",
        patternMessage: "SKU format must be ABC-1234",
        minLength: 8,
        maxLength: 8,
        min: 10,
        max: 999,
      });
    } finally {
      cleanup();
    }
  });

  it("hydrates from pre-existing canonical validation object and detects preset", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(Form, {
      value: {
        widget: { key: "Input", Name: "Input" },
        label: "Postal Code",
        db_fieldName: "postal_code",
        validation: {
          pattern: "^\\d+$",
          patternMessage: "Only digits (0-9) allowed",
          minLength: 5,
          maxLength: 5,
        },
      },
      close,
    });

    try {
      await click(target.querySelector('[data-testid="tab-validation"]'));

      const presetSelect = target.querySelector<HTMLSelectElement>("#validation-preset");
      const patternInput = target.querySelector<HTMLInputElement>("#validation-pattern");
      const minLenInput = target.querySelector<HTMLInputElement>("#val-min-len");
      const maxLenInput = target.querySelector<HTMLInputElement>("#val-max-len");

      expect(presetSelect?.value).toBe("numeric");
      expect(patternInput?.value).toBe("^\\d+$");
      expect(minLenInput?.value).toBe("5");
      expect(maxLenInput?.value).toBe("5");

      // Save without modifications to ensure idempotency
      await click(target.querySelector('[data-testid="widget-field-apply"]'));
      expect(close.mock.calls[0][0].validation).toMatchObject({
        pattern: "^\\d+$",
        patternMessage: "Only digits (0-9) allowed",
        minLength: 5,
        maxLength: 5,
      });
    } finally {
      cleanup();
    }
  });
});

describe("Collection Builder — Conditions Tab", () => {
  it("configures showIf condition with target field, operator, and value", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(Form, {
      value: {
        widget: { key: "Input", Name: "Input" },
        label: "Discount Code",
        db_fieldName: "discount_code",
      },
      close,
    });

    try {
      await click(target.querySelector('[data-testid="tab-conditions"]'));

      // Initially disabled: input fields should not be present
      expect(target.querySelector("#cond-show-field")).toBeNull();

      // Enable showIf toggle
      const showToggle = target.querySelector(
        `button[aria-label="${widget_conditions_visibility_aria()}"]`,
      );
      expect(showToggle).not.toBeNull();
      await click(showToggle);

      const fieldInput = target.querySelector<HTMLInputElement>("#cond-show-field");
      const opSelect = target.querySelector<HTMLSelectElement>("#cond-show-op");
      const valInput = target.querySelector<HTMLInputElement>("#cond-show-val");

      expect(fieldInput).not.toBeNull();
      expect(opSelect).not.toBeNull();
      expect(valInput).not.toBeNull();

      await typeText(fieldInput, "is_promotional");
      await select(opSelect, "equals");
      await typeText(valInput, "true");

      await click(target.querySelector('[data-testid="widget-field-apply"]'));
      expect(close).toHaveBeenCalledTimes(1);
      const saved = close.mock.calls[0][0];

      expect(saved.showIf).toEqual({
        field: "is_promotional",
        operator: "equals",
        value: "true",
      });
    } finally {
      cleanup();
    }
  });

  it("configures requiredIf condition and cleans up when toggled off", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(Form, {
      value: {
        widget: { key: "Input", Name: "Input" },
        label: "Tax ID",
        db_fieldName: "tax_id",
        requiredIf: {
          field: "is_business",
          operator: "equals",
          value: "true",
        },
      },
      close,
    });

    try {
      await click(target.querySelector('[data-testid="tab-conditions"]'));

      // Should be pre-hydrated with requiredIf values
      const reqFieldInput = target.querySelector<HTMLInputElement>("#cond-req-field");
      expect(reqFieldInput?.value).toBe("is_business");

      // Toggle OFF requiredIf
      const reqToggle = target.querySelector(
        `button[aria-label="${widget_conditions_requirement_aria()}"]`,
      );
      expect(reqToggle).not.toBeNull();
      await click(reqToggle);

      await click(target.querySelector('[data-testid="widget-field-apply"]'));
      expect(close).toHaveBeenCalledTimes(1);
      const saved = close.mock.calls[0][0];
      expect(saved.requiredIf).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

describe("Collection Builder — Permissions Tab", () => {
  it("toggles field visibility, requireAuth, and role view/edit checkboxes", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(Form, {
      value: {
        widget: { key: "Input", Name: "Input" },
        label: "Internal Notes",
        db_fieldName: "internal_notes",
        permissions: {
          visibility: "public",
          requiredAuth: false,
          readRoles: [],
          writeRoles: [],
        },
      },
      roles: SAMPLE_ROLES,
      close,
    });

    try {
      await click(target.querySelector('[data-testid="tab-permissions"]'));

      // Toggle visibility from public to private
      const visButton = target.querySelector('button:has(iconify-icon[icon="mdi:eye"])');
      expect(visButton).not.toBeNull();
      await click(visButton);

      // Toggle requireAuth switch
      const authToggle = target.querySelector(
        `button[role="switch"][aria-label="${widget_form_require_auth_aria()}"]`,
      );
      expect(authToggle).not.toBeNull();
      await click(authToggle);

      // Toggle Editor View checkbox
      const editorViewInput = target.querySelector<HTMLInputElement>(
        `input[type="checkbox"][aria-label="${widget_form_role_view_aria({ role: "Editor" })}"]`,
      );
      expect(editorViewInput).not.toBeNull();
      await click(editorViewInput);

      // Toggle Editor Edit checkbox
      const editorEditInput = target.querySelector<HTMLInputElement>(
        `input[type="checkbox"][aria-label="${widget_form_role_edit_aria({ role: "Editor" })}"]`,
      );
      expect(editorEditInput).not.toBeNull();
      await click(editorEditInput);

      await click(target.querySelector('[data-testid="widget-field-apply"]'));
      expect(close).toHaveBeenCalledTimes(1);
      const saved = close.mock.calls[0][0];

      expect(saved.permissions).toMatchObject({
        visibility: "private",
        requiredAuth: true,
        readRoles: ["role_editor"],
        writeRoles: ["role_editor"],
      });
    } finally {
      cleanup();
    }
  });
});

describe("Collection Builder — Live Form Preview", () => {
  const PREVIEW_ITEMS = [
    {
      id: 1,
      _dragId: "drag-1",
      label: "Is On Sale",
      db_fieldName: "on_sale",
      widget: { key: "checkbox", Name: "Checkbox" },
      placeholder: "Mark as on sale",
    },
    {
      id: 2,
      _dragId: "drag-2",
      label: "Discount Percent",
      db_fieldName: "discount_percent",
      widget: { key: "input", Name: "Input" },
      showIf: {
        field: "on_sale",
        operator: "equals" as const,
        value: true,
      },
      requiredIf: {
        field: "on_sale",
        operator: "equals" as const,
        value: true,
      },
    },
  ];

  it("dynamically shows and hides conditional field based on preview checkbox state", async () => {
    const { target, cleanup } = renderComponent(Preview, {
      items: PREVIEW_ITEMS,
      collectionName: "Products",
    });

    try {
      // Initially on_sale is falsy, so discount_percent should be hidden
      expect(target.querySelector("#preview-on_sale")).not.toBeNull();
      expect(target.querySelector("#preview-discount_percent")).toBeNull();

      // Check on_sale
      const onSaleInput = target.querySelector<HTMLInputElement>("#preview-on_sale");
      await click(onSaleInput);
      await settle();

      // discount_percent should now be visible and flagged with requiredIf badge
      const discountInput = target.querySelector<HTMLInputElement>("#preview-discount_percent");
      expect(discountInput).not.toBeNull();
      expect(target.textContent).toContain(preview_required_if_badge());

      // Uncheck on_sale
      await click(onSaleInput);
      await settle();

      // discount_percent should hide again
      expect(target.querySelector("#preview-discount_percent")).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("switches viewport widths and populates sample data", async () => {
    const { target, cleanup } = renderComponent(Preview, {
      items: PREVIEW_ITEMS,
      collectionName: "Products",
    });

    try {
      // Find mobile viewport button
      const mobileBtn = target.querySelector(`button[aria-label="${preview_mobile_aria()}"]`);
      expect(mobileBtn).not.toBeNull();
      await click(mobileBtn);
      await settle();
      expect(target.querySelector(".max-w-\\[390px\\]")).not.toBeNull();

      // Switch to tablet viewport
      const tabletBtn = target.querySelector(`button[aria-label="${preview_tablet_aria()}"]`);
      expect(tabletBtn).not.toBeNull();
      await click(tabletBtn);
      await settle();
      expect(target.querySelector(".max-w-\\[768px\\]")).not.toBeNull();

      // Switch back to desktop viewport
      const desktopBtn = target.querySelector(`button[aria-label="${preview_desktop_aria()}"]`);
      expect(desktopBtn).not.toBeNull();
      await click(desktopBtn);
      await settle();
      expect(target.querySelector(".max-w-4xl")).not.toBeNull();

      // Fill sample data
      const fillBtn = target.querySelector('button:has(iconify-icon[icon="mdi:auto-fix"])');
      expect(fillBtn).not.toBeNull();
      await click(fillBtn);
      await settle();

      // on_sale checkbox was populated with true, so conditional field appears
      expect(target.querySelector("#preview-discount_percent")).not.toBeNull();

      // Clear sample data
      const clearBtn = target.querySelector('button:has(iconify-icon[icon="mdi:refresh"])');
      expect(clearBtn).not.toBeNull();
      await click(clearBtn);
      await settle();

      // on_sale cleared, discount_percent hides
      expect(target.querySelector("#preview-discount_percent")).toBeNull();
    } finally {
      cleanup();
    }
  });
});
