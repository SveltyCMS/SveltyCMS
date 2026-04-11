/**
 * @file tests/unit/utils/cn.test.ts
 * @description Unit tests for cn utility
 */

import { describe, expect, it } from "vitest";
import { cn } from "@utils/cn";

describe("cn utility", () => {
  it("merges standard tailwind classes", () => {
    expect(cn("px-2 py-1", "bg-red-500")).toBe("px-2 py-1 bg-red-500");
  });

  it("overrides conflicting tailwind classes", () => {
    expect(cn("px-2 py-1 bg-blue-500", "bg-red-500")).toBe("px-2 py-1 bg-red-500");
    expect(cn("p-4", "px-2")).toBe("p-4 px-2"); // twMerge handles this correctly (px-2 wins for x-axis)
  });

  it("handles conditional classes via objects", () => {
    expect(cn("px-2", { "bg-red-500": true, "text-white": false })).toBe("px-2 bg-red-500");
  });

  it("handles conditional classes via logical operators", () => {
    const isTrue = true;
    const isFalse = false;
    expect(cn("px-2", isTrue && "bg-blue-500", isFalse && "text-white")).toBe("px-2 bg-blue-500");
  });

  it("handles arrays of classes", () => {
    expect(cn(["px-2", "py-1"], ["bg-red-500"])).toBe("px-2 py-1 bg-red-500");
  });

  it("ignores null and undefined", () => {
    expect(cn("px-2", null, undefined, "bg-red-500")).toBe("px-2 bg-red-500");
  });
});
