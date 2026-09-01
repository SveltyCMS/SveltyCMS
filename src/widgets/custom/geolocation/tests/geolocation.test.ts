/**
 * @file src/widgets/custom/geolocation/tests/geolocation.test.ts
 * @description Unit tests for the Geolocation widget validation logic.
 */

import { describe, it, expect } from "bun:test";
import GeolocationWidget from "../index";
import { safeParse } from "valibot";

describe("Geolocation Widget - Validation", () => {
  const validPoint = {
    type: "Point",
    coordinates: [13.405, 52.52], // [lng, lat]
  };

  it("should validate a correct GeoJSON Point", () => {
    const field = GeolocationWidget({ label: "Location", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const result = safeParse(schema, validPoint);
    expect(result.success).toBe(true);
  });

  it("should reject invalid type", () => {
    const field = GeolocationWidget({ label: "Location", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const invalidPoint = { ...validPoint, type: "Polygon" };
    expect(safeParse(schema, invalidPoint).success).toBe(false);
  });

  it("should reject invalid coordinates (not numbers)", () => {
    const field = GeolocationWidget({ label: "Location", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const invalidPoint = { ...validPoint, coordinates: ["13.405", 52.52] };
    expect(safeParse(schema, invalidPoint).success).toBe(false);
  });

  it("should handle required constraint", () => {
    const field = GeolocationWidget({ label: "Location", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(false);
  });

  it("should allow null if not required", () => {
    const field = GeolocationWidget({ label: "Location", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(true);
  });
});
