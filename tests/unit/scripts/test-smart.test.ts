import { describe, test, expect, vi, beforeEach } from "vitest";

// Dynamic import after suppressing module-level main() call
(globalThis as any).__TEST_SMART_IMPORT = true;
const mod = await import("../../../scripts/test-smart.ts");
const { expandSyntheticEdges } = mod;

describe("expandSyntheticEdges", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  test("collection schema change pulls in generated types", () => {
    const result = expandSyntheticEdges(["config/collections/BlogPost.ts"]);
    expect(result).toContain("src/content/types.generated.ts");
    expect(result).toContain("src/content/types.ts");
  });

  test("leaves unrelated changes untouched", () => {
    const result = expandSyntheticEdges(["src/utils/slugify.ts"]);
    expect(result).toEqual(["src/utils/slugify.ts"]);
  });
});
