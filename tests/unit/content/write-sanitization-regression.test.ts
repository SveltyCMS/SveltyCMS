/**
 * @file tests/unit/content/write-sanitization-regression.test.ts
 * @description Regression tests for write-path field sanitization and XSS prevention.
 */

import { describe, it, expect } from "vitest";
import { prepareWritePayload } from "@src/services/sdk/namespaces/collections/write-pipeline";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import type { Schema } from "@src/content/types";

describe("Write-Path Sanitization & XSS Defense Regression", () => {
  const articleSchema: Schema = {
    _id: "articles",
    name: "articles",
    label: "Articles",
    fields: [
      {
        db_fieldName: "title",
        label: "Title",
        type: "text",
        widget: { Name: "Text" },
      },
      {
        db_fieldName: "content",
        label: "Content",
        type: "richtext",
        widget: { Name: "RichText" },
      },
      {
        db_fieldName: "notes",
        label: "Notes",
        type: "markdown",
        widget: { Name: "Markdown" },
      },
      {
        db_fieldName: "views",
        label: "Views",
        type: "number",
        widget: { Name: "Number" },
      },
    ],
  };

  it("strips malicious script tags from richtext and markdown fields", () => {
    const hot = ensureSchemaHotFlags(articleSchema);
    expect(hot._hasSanitizableFields).toBe(true);

    const rawPayload = {
      title: "Clean Title <script>alert('xss')</script>",
      content: "<p>Safe text</p><script>evil()</script><img src=x onerror=alert(1)>",
      notes: "## Header\n[Link](javascript:alert(1))",
      views: 100,
    };

    const prepared = prepareWritePayload(rawPayload, articleSchema, hot, {
      operation: "create",
      tenantId: "tenant-xss",
      system: true,
    });

    // Plain text should strip HTML tags
    expect(prepared.title).toBe("Clean Title alert('xss')");
    // Richtext should remove <script> and malicious event handlers
    expect(prepared.content).not.toContain("<script>");
    expect(prepared.content).not.toContain("onerror=");
    expect(prepared.content).toContain("<p>Safe text</p>");
    // Numeric and metadata preserved
    expect(prepared.views).toBe(100);
    expect(prepared.tenantId).toBe("tenant-xss");
  });

  it("handles clean payloads without unnecessary mutation", () => {
    const hot = ensureSchemaHotFlags(articleSchema);
    const cleanPayload = {
      title: "Hello World",
      content: "<p>Standard body content</p>",
      views: 5,
    };

    const prepared = prepareWritePayload(cleanPayload, articleSchema, hot, {
      operation: "update",
      tenantId: "tenant-clean",
      system: true,
      entryId: "art-1",
    });

    expect(prepared.title).toBe("Hello World");
    expect(prepared.content).toBe("<p>Standard body content</p>");
    expect(prepared.updatedBy).toBe("system");
  });

  it("handles undeclared/extra fields and preserves schema-defined perimeter", () => {
    const hot = ensureSchemaHotFlags(articleSchema);
    const payloadWithExtra = {
      title: "Legitimate Post",
      content: "<p>Body</p>",
      __unknownPayload: "<script>alert('extra')</script>",
      meta: { nestedDesc: "<img src=x onerror=alert(1)>" },
    };

    const prepared = prepareWritePayload(payloadWithExtra, articleSchema, hot, {
      operation: "create",
      tenantId: "tenant-extra",
      system: true,
    });

    // Declared fields are sanitized
    expect(prepared.title).toBe("Legitimate Post");
    expect(prepared.content).toBe("<p>Body</p>");
    // Undeclared / extra fields are sanitized to prevent stored XSS in data JSON column
    expect(prepared.__unknownPayload).not.toContain("<script>");
    expect(prepared.meta.nestedDesc).not.toContain("onerror=");
    expect(prepared.tenantId).toBe("tenant-extra");
    expect(prepared.createdAt).toBeDefined();
  });
});
