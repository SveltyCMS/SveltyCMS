/**
 * @file tests/unit/plugins/editable-website-protocol.test.ts
 * @description Unit tests for editable-website bidirectional preview protocol helpers.
 */

import { describe, expect, it } from "vitest";
import { isCmsInboundMessage, mergePreviewEdits } from "@src/plugins/editable-website/protocol";

describe("editable-website protocol", () => {
  it("recognizes inbound CMS messages", () => {
    expect(isCmsInboundMessage({ type: "svelty:init" })).toBe(true);
    expect(isCmsInboundMessage({ type: "svelty:save", collection: "pages", data: {} })).toBe(true);
    expect(
      isCmsInboundMessage({ type: "svelty:document:update", fieldName: "body", document: {} }),
    ).toBe(true);
    expect(isCmsInboundMessage({ type: "svelty:update" })).toBe(false);
    expect(isCmsInboundMessage(null)).toBe(false);
  });

  it("merges save messages into entry data", () => {
    const current = { title: "Old", slug: "home" };
    const merged = mergePreviewEdits(current, {
      type: "svelty:save",
      collection: "pages",
      data: { title: "New" },
    });
    expect(merged.title).toBe("New");
    expect(merged.slug).toBe("home");
  });

  it("merges document update messages by field name", () => {
    const current = { body: "<p>Old</p>" };
    const merged = mergePreviewEdits(current, {
      type: "svelty:document:update",
      collection: "pages",
      fieldName: "body",
      document: "<p>New</p>",
    });
    expect(merged.body).toBe("<p>New</p>");
  });
});
