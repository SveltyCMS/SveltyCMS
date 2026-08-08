/**
 * @file tests/unit/components/smart-table-enhancements.test.ts
 * @description Unit tests for SmartTable Column Picker, In-Header Filters, and Saved Views Bar.
 */

import { describe, it, expect } from "vitest";
import {
  SmartTableColumnPicker,
  SmartTableHeaderFilter,
  SmartTableSavedViewsBar,
} from "@components/ui/smart-table";

describe("SmartTable Enhancements Module", () => {
  it("exports SmartTableColumnPicker component correctly", () => {
    expect(SmartTableColumnPicker).toBeDefined();
  });

  it("exports SmartTableHeaderFilter component correctly", () => {
    expect(SmartTableHeaderFilter).toBeDefined();
  });

  it("exports SmartTableSavedViewsBar component correctly", () => {
    expect(SmartTableSavedViewsBar).toBeDefined();
  });
});
