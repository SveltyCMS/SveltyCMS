import { describe, test, expect } from "vitest";
import { expandSyntheticEdges } from "../../../scripts/test-smart.ts";

describe("expandSyntheticEdges", () => {
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
