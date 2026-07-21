/**
 * @file tests/unit/stores/screen-size.test.ts
 * @description Tests for screen size detection and responsive state management
 *
 * Tests:
 * - Screen size detection
 * - Breakpoint boundaries
 * - Common device sizes
 * - Edge cases
 * - Tailwind CSS alignment
 * - Enum values
 */

import { getScreenSize, ScreenSize } from "@src/utils/screen-size";

describe("Screen Size Store - Size Detection", () => {
  it("should detect extra small screens (XS)", () => {
    expect(getScreenSize(0)).toBe(ScreenSize.XS);
    expect(getScreenSize(360)).toBe(ScreenSize.XS);
    expect(getScreenSize(639)).toBe(ScreenSize.XS);
  });

  it("should detect small screens (SM)", () => {
    expect(getScreenSize(640)).toBe(ScreenSize.SM);
    expect(getScreenSize(767)).toBe(ScreenSize.SM);
    expect(getScreenSize(700)).toBe(ScreenSize.SM);
  });

  it("should detect medium screens (MD)", () => {
    expect(getScreenSize(768)).toBe(ScreenSize.MD);
    expect(getScreenSize(900)).toBe(ScreenSize.MD);
    expect(getScreenSize(1023)).toBe(ScreenSize.MD);
  });

  it("should detect large screens (LG)", () => {
    expect(getScreenSize(1024)).toBe(ScreenSize.LG);
    expect(getScreenSize(1100)).toBe(ScreenSize.LG);
    expect(getScreenSize(1279)).toBe(ScreenSize.LG);
  });

  it("should detect extra large screens (XL)", () => {
    expect(getScreenSize(1280)).toBe(ScreenSize.XL);
    expect(getScreenSize(1400)).toBe(ScreenSize.XL);
    expect(getScreenSize(1535)).toBe(ScreenSize.XL);
  });

  it("should detect extra extra large screens (XXL)", () => {
    expect(getScreenSize(1536)).toBe(ScreenSize.XXL);
    expect(getScreenSize(1920)).toBe(ScreenSize.XXL);
    expect(getScreenSize(2560)).toBe(ScreenSize.XXL);
  });
});

describe("Screen Size Store - Breakpoint Boundaries", () => {
  it("should correctly handle breakpoint boundaries", () => {
    expect(getScreenSize(639)).toBe(ScreenSize.XS);
    expect(getScreenSize(640)).toBe(ScreenSize.SM);
    expect(getScreenSize(767)).toBe(ScreenSize.SM);
    expect(getScreenSize(768)).toBe(ScreenSize.MD);
    expect(getScreenSize(1023)).toBe(ScreenSize.MD);
    expect(getScreenSize(1024)).toBe(ScreenSize.LG);
    expect(getScreenSize(1279)).toBe(ScreenSize.LG);
    expect(getScreenSize(1280)).toBe(ScreenSize.XL);
    expect(getScreenSize(1535)).toBe(ScreenSize.XL);
    expect(getScreenSize(1536)).toBe(ScreenSize.XXL);
  });

  it("should handle zero width", () => {
    expect(getScreenSize(0)).toBe(ScreenSize.XS);
  });

  it("should handle negative width as XS", () => {
    expect(getScreenSize(-1)).toBe(ScreenSize.XS);
  });
});

describe("Screen Size Store - Common Device Sizes", () => {
  it("should match common mobile sizes", () => {
    expect(getScreenSize(320)).toBe(ScreenSize.XS);
    expect(getScreenSize(375)).toBe(ScreenSize.XS);
    expect(getScreenSize(414)).toBe(ScreenSize.XS);
  });

  it("should match common tablet sizes", () => {
    expect(getScreenSize(768)).toBe(ScreenSize.MD);
    expect(getScreenSize(1024)).toBe(ScreenSize.LG);
  });

  it("should match common desktop sizes", () => {
    expect(getScreenSize(1280)).toBe(ScreenSize.XL);
    expect(getScreenSize(1366)).toBe(ScreenSize.XL);
    expect(getScreenSize(1440)).toBe(ScreenSize.XL);
    expect(getScreenSize(1920)).toBe(ScreenSize.XXL);
  });
});

describe("Screen Size Store - Tailwind CSS Alignment", () => {
  it("should align with Tailwind breakpoints", () => {
    // Tailwind sm: 640px
    expect(getScreenSize(639)).toBe(ScreenSize.XS);
    expect(getScreenSize(640)).toBe(ScreenSize.SM);
    // Tailwind md: 768px
    expect(getScreenSize(767)).toBe(ScreenSize.SM);
    expect(getScreenSize(768)).toBe(ScreenSize.MD);
    // Tailwind lg: 1024px
    expect(getScreenSize(1023)).toBe(ScreenSize.MD);
    expect(getScreenSize(1024)).toBe(ScreenSize.LG);
    // Tailwind xl: 1280px
    expect(getScreenSize(1279)).toBe(ScreenSize.LG);
    expect(getScreenSize(1280)).toBe(ScreenSize.XL);
    // Tailwind 2xl: 1536px
    expect(getScreenSize(1535)).toBe(ScreenSize.XL);
    expect(getScreenSize(1536)).toBe(ScreenSize.XXL);
  });
});

describe("Screen Size Store - Enum Values", () => {
  it("should have unique string values", () => {
    const values = Object.values(ScreenSize);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("should have correct string constants", () => {
    expect(ScreenSize.XS === "xs").toBe(true);
    expect(ScreenSize.SM === "sm").toBe(true);
    expect(ScreenSize.MD === "md").toBe(true);
    expect(ScreenSize.LG === "lg").toBe(true);
    expect(ScreenSize.XL === "xl").toBe(true);
    expect(ScreenSize.XXL === "2xl").toBe(true);
  });

  it("should return valid enum values for all widths", () => {
    const testWidths = [0, 320, 640, 768, 1024, 1280, 1536, 2560];
    const validSizes = Object.values(ScreenSize);

    testWidths.forEach((width) => {
      const size = getScreenSize(width);
      expect(validSizes).toContain(size);
    });
  });
});
