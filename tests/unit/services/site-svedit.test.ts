import { describe, expect, it } from "vitest";
import {
  createDefaultHomeDocument,
  serializeSveditContent,
} from "@src/services/site/svedit/default-home-document";
import { isSveditDocument, parseSveditContent } from "@src/services/site/svedit/types";

describe("site svedit helpers", () => {
  it("creates a valid default homepage document", () => {
    const doc = createDefaultHomeDocument("Acme");
    expect(doc.document_id).toBe("page_home");
    expect(isSveditDocument(doc)).toBe(true);
    const nodes = doc.nodes as Record<string, Record<string, unknown>>;
    expect((nodes.page_home.body as { nodes: unknown[] }).nodes).toHaveLength(3);
    expect((nodes.hero_home.heading as { content: string }).content).toContain("Acme");
  });

  it("parses serialized svedit content from the pages field", () => {
    const doc = createDefaultHomeDocument();
    const parsed = parseSveditContent(serializeSveditContent(doc));
    expect(parsed?.document_id).toBe("page_home");
  });

  it("returns null for legacy block JSON", () => {
    const legacy = JSON.stringify({ blocks: [{ type: "hero", heading: "Hi" }] });
    expect(parseSveditContent(legacy)).toBeNull();
  });
});
