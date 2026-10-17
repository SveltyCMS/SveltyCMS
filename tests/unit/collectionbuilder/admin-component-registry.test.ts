/**
 * @file tests/unit/collectionbuilder/admin-component-registry.test.ts
 * @description Guards the Collection Builder Settings tab mapping: every widget identifier
 * used by widget GuiSchemas must resolve to an admin control, including legacy aliases.
 */

import { describe, expect, it } from "vitest";
import { resolveAdminComponent } from "@components/system/admin-component-registry";

describe("admin component registry", () => {
  it.each([
    "Input",
    "input",
    "Toggle",
    "Toggles",
    "Checkbox",
    "Select",
    "select",
    "Textarea",
    "textarea",
    "Json",
    "group",
    "Slug",
    "IconifyIconsPicker",
    "PermissionsSetting",
    "CollectionPicker",
    "FieldPicker",
  ])("resolves %s to a control", (widget) => {
    expect(resolveAdminComponent(widget)).toBeTruthy();
  });

  it("skips unknown identifiers instead of rendering an empty row", () => {
    expect(resolveAdminComponent(undefined)).toBeNull();
    expect(resolveAdminComponent("BlockBuilder")).toBeNull();
    expect(resolveAdminComponent({})).toBeNull();
  });
});
