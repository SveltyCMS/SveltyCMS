/**
 * @file src/widgets/custom/mega-menu/tests/mega-menu.test.ts
 * @description Unit tests for the MegaMenu widget validation logic.
 */

import { describe, it, expect } from "bun:test";
import MegaMenuWidget, { validateMenuStructure } from "../index";
import { safeParse } from "valibot";

describe("MegaMenu Widget - Validation", () => {
  const validMenu = [
    {
      _id: "1",
      _fields: { title: "Home" },
      children: [],
    },
    {
      _id: "2",
      _fields: { title: "Services" },
      children: [
        {
          _id: "2.1",
          _fields: { title: "Web Design" },
          children: [],
        },
      ],
    },
  ];

  it("should validate a correct menu structure", () => {
    const field = MegaMenuWidget({ label: "Menu" });
    const schema = field.widget.validationSchema as any;

    const result = safeParse(schema, validMenu);
    expect(result.success).toBe(true);
  });

  it("should reject menu items with missing _id", () => {
    const field = MegaMenuWidget({ label: "Menu" });
    const schema = field.widget.validationSchema as any;

    const invalidMenu = [{ _fields: { title: "No ID" }, children: [] }];
    expect(safeParse(schema, invalidMenu).success).toBe(false);
  });

  it("should validate menu structure constraints using helper", () => {
    const config = { maxDepth: 1 };
    const deepMenu = [
      {
        _id: "1",
        _fields: { title: "Root" },
        children: [
          {
            _id: "1.1",
            _fields: { title: "Level 1" },
            children: [
              {
                _id: "1.1.1",
                _fields: { title: "Level 2" },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const result = validateMenuStructure(deepMenu, config as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("exceeds maximum depth");
  });
});
