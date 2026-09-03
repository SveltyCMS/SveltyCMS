/**
 * @file tests/unit/scripts/slop-scanner.test.ts
 * @description Unit tests for slop-scanner rules — Svelte 5 SSR hydration safety,
 * unpinned date localization detection, and HTML sanitization guards.
 */

import { describe, it, expect } from "vitest";
import { scanSvelteContent } from "../../../scripts/slop-scanner";

describe("slop-scanner — Svelte 5 SSR hydration ID safety", () => {
  it("flags crypto.randomUUID() in $derived at render level", async () => {
    const code = [
      '<script lang="ts">',
      "  const contentId = $derived(`collapsible-${crypto.randomUUID()}`);",
      "</script>",
      "<div>{contentId}</div>",
    ].join("\n");

    const violations = await scanSvelteContent("src/components/ui/collapsible.svelte", code);
    expect(violations.some((v) => v.category === "ssr-hydration" && v.severity === "error")).toBe(
      true,
    );
  });

  it("flags crypto.randomUUID() in prop defaults", async () => {
    const code = [
      '<script lang="ts">',
      "  let { id = crypto.randomUUID() } = $props();",
      "</script>",
      "<div {id}>Test</div>",
    ].join("\n");

    const violations = await scanSvelteContent("src/components/ui/accordion-item.svelte", code);
    expect(violations.some((v) => v.category === "ssr-hydration" && v.severity === "error")).toBe(
      true,
    );
  });

  it("passes deterministic $props.id() rune usage", async () => {
    const code = [
      '<script lang="ts">',
      "  let { id = $props.id() } = $props();",
      "</script>",
      "<div {id}>Test</div>",
    ].join("\n");

    const violations = await scanSvelteContent("src/components/ui/accordion-item.svelte", code);
    expect(violations.some((v) => v.category === "ssr-hydration")).toBe(false);
  });
});

describe("slop-scanner — date & number localization pinning", () => {
  it("flags unpinned toLocaleDateString() in .svelte components", async () => {
    const code = [
      '<script lang="ts">',
      "  const d = new Date().toLocaleDateString();",
      "</script>",
      "<div>{d}</div>",
    ].join("\n");

    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(
      violations.some((v) => v.category === "date-localization" && v.severity === "warning"),
    ).toBe(true);
  });

  it("flags unpinned toLocaleString() without arguments", async () => {
    const code = [
      '<script lang="ts">',
      "  const count = 1000;",
      "</script>",
      "<span>{count.toLocaleString()}</span>",
    ].join("\n");

    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(
      violations.some((v) => v.category === "date-localization" && v.severity === "warning"),
    ).toBe(true);
  });

  it("passes formatNumber and formatDate from @utils/format-date", async () => {
    const code = [
      '<script lang="ts">',
      "  import { formatNumber, formatDate } from '@utils/format-date';",
      "  const count = formatNumber(1000);",
      "  const dateStr = formatDate(new Date());",
      "</script>",
      "<span>{count} - {dateStr}</span>",
    ].join("\n");

    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "date-localization")).toBe(false);
  });
});

describe("slop-scanner — HTML sanitization guards", () => {
  it("flags raw {@html} without sanitization helper", async () => {
    const code = "<div>{@html untrustedPayload}</div>";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "security" && v.severity === "error")).toBe(true);
  });

  it("passes {@html parseMarkdown(...)}", async () => {
    const code = "<div>{@html parseMarkdown(rawText)}</div>";
    const violations = await scanSvelteContent("src/widgets/markdown.svelte", code);
    expect(
      violations.some((v) => v.category === "security" && v.message.includes("Unsafe {@html}")),
    ).toBe(false);
  });

  it("passes {@html sanitizeHtml(...)}", async () => {
    const code = "<div>{@html sanitizeHtml(userContent)}</div>";
    const violations = await scanSvelteContent("src/components/content.svelte", code);
    expect(
      violations.some((v) => v.category === "security" && v.message.includes("Unsafe {@html}")),
    ).toBe(false);
  });
});
