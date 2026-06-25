/**
 * @file tests/unit/widgets/core/media-upload.test.ts
 * @description Unit tests for the MediaUpload widget
 */

import { describe, it, expect } from "vitest";
import MediaWidget from "@widgets/core/media-upload";
import { safeParse } from "valibot";

describe("MediaUpload Widget", () => {
  it("should validate a single media ID string", () => {
    const field = MediaWidget({ label: "Avatar", multiupload: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "media-123").success).toBe(true);
  });

  it("should validate an array of IDs when multiupload is enabled", () => {
    const field = MediaWidget({ label: "Gallery", multiupload: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, ["media-1", "media-2"]).success).toBe(true);
    expect(safeParse(schema, []).success).toBe(true); // Optional by default
  });

  it("should reject empty array when required and multiupload enabled", () => {
    const field = MediaWidget({
      label: "Gallery",
      multiupload: true,
      required: true,
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, []).success).toBe(false);
    expect(safeParse(schema, ["media-1"]).success).toBe(true);
  });

  it("should handle single ID required constraint", () => {
    const field = MediaWidget({
      label: "Avatar",
      multiupload: false,
      required: true,
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(false);
    expect(safeParse(schema, "").success).toBe(false);
    expect(safeParse(schema, "media-123").success).toBe(true);
  });
});
