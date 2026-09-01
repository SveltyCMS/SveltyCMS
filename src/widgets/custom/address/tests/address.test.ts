/**
 * @file src/widgets/custom/address/tests/address.test.ts
 * @description Unit tests for the Address widget validation logic and configuration options.
 *
 * Tests:
 * - Valid address validation
 * - Missing required fields validation
 * - Invalid coordinates validation
 * - Country code constraints validation
 * - Default options resolution (MapLibre/OSM support)
 * - Translatable paths extraction
 */

import AddressWidget from "@widgets/custom/address";
import { safeParse } from "valibot";
import { describe, it, expect } from "vitest";

describe("Address Widget - Validation", () => {
  const validAddress = {
    street: "Main St",
    houseNumber: "123",
    postalCode: "12345",
    city: "Anytown",
    country: "DE",
    latitude: 51.34,
    longitude: 6.57,
  };

  it("should validate a correct address object", () => {
    const field = AddressWidget({ label: "Home" });
    const schema = (field.widget.validationSchema as any)(field);
    const result = safeParse(schema, validAddress);
    expect(result.success).toBe(true);
  });

  it("should reject missing required fields", () => {
    const field = AddressWidget({ label: "Home", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const invalidAddress = { ...validAddress, street: "" };
    expect(safeParse(schema, invalidAddress).success).toBe(false);

    const missingCity = { ...validAddress };
    (missingCity as any).city = undefined;
    expect(safeParse(schema, missingCity).success).toBe(false);
  });

  it("should reject invalid types", () => {
    const field = AddressWidget({ label: "Home" });
    const schema = (field.widget.validationSchema as any)(field);

    const invalidLat = { ...validAddress, latitude: "not-a-number" };
    expect(safeParse(schema, invalidLat).success).toBe(false);
  });

  it("should validate 2-letter country code min length", () => {
    const field = AddressWidget({ label: "Home" });
    const schema = (field.widget.validationSchema as any)(field);

    const shortCountry = { ...validAddress, country: "D" };
    expect(safeParse(schema, shortCountry).success).toBe(false);
  });
});

describe("Address Widget - Configuration & Defaults", () => {
  it("should initialize default options correctly", () => {
    const field = AddressWidget({ label: "Office Address" });
    // WidgetFactory flattens config.defaults properties directly onto the field instance
    expect(field.showMap).toBe(true);
    expect(field.enableGeocoding).toBe(true);
    expect(field.zoom).toBe(12);
    expect(field.defaultCountry).toBe("DE");
    expect(field.mapCenter).toEqual({ lat: 51.34, lng: 6.57 });

    // Also assert defaults exist in the widget's metadata
    expect(field.widget.defaults?.showMap).toBe(true);
    expect(field.widget.defaults?.enableGeocoding).toBe(true);
  });

  it("should support overrides in custom configurations", () => {
    const field = AddressWidget({
      label: "Custom Address",
      defaultCountry: "US",
      zoom: 15,
      mapCenter: { lat: 40.7128, lng: -74.006 },
    });
    expect(field.defaultCountry).toBe("US");
    expect(field.zoom).toBe(15);
    expect(field.mapCenter).toEqual({ lat: 40.7128, lng: -74.006 });
  });

  it("should extract correct translatable paths for multilingual fields", () => {
    const field = AddressWidget({ label: "Billing Address" });
    const translatablePaths = field.widget.getTranslatablePaths?.("billing");
    expect(translatablePaths).toEqual([
      "billing.street",
      "billing.postalCode",
      "billing.city",
      "billing.country",
    ]);
  });
});
