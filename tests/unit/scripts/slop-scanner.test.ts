/**
 * @file tests/unit/scripts/slop-scanner.test.ts
 * @description Unit tests for slop-scanner rules — Svelte 5 SSR hydration safety,
 * unpinned date localization detection, and HTML sanitization guards.
 */

import { describe, it, expect } from "vitest";
import { isExcludedPath, scanSvelteContent } from "../../../scripts/slop-scanner";

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

  it("brace-matches {@html} with nested objects (not broken by inner braces)", async () => {
    const code = "<div>{@html render(article, { inline: true })}</div>";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "security")).toBe(true);
  });

  it("passes {@html sanitizeHtml(render(article, { inline: true }))} nested", async () => {
    const code = "<div>{@html sanitizeHtml(render(article, { inline: true }))}</div>";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(
      violations.some((v) => v.category === "security" && v.message.includes("Unsafe {@html}")),
    ).toBe(false);
  });
});

describe("slop-scanner — Svelte 5 {#each} key detection", () => {
  it("flags unkeyed {#each items as item}", async () => {
    const code = "{#each items as item}<p>{item}</p>{/each}";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(
      violations.some((v) => v.category === "svelte-quality" && v.message.includes("key context")),
    ).toBe(true);
  });

  it("flags unkeyed {#each items as { id, name }} (destructuring is not a key)", async () => {
    const code = "{#each items as { id, name }}<p>{id}</p>{/each}";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(
      violations.some((v) => v.category === "svelte-quality" && v.message.includes("key context")),
    ).toBe(true);
  });

  it("passes keyed {#each items as { id, name } (id)}", async () => {
    const code = "{#each items as { id, name } (id)}<p>{id}</p>{/each}";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(
      violations.some((v) => v.category === "svelte-quality" && v.message.includes("key context")),
    ).toBe(false);
  });

  it("passes keyed {#each getItems() as item (item.id)} (trailing paren group is the key)", async () => {
    const code = "{#each getItems() as item (item.id)}<p>{item}</p>{/each}";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(
      violations.some((v) => v.category === "svelte-quality" && v.message.includes("key context")),
    ).toBe(false);
  });
});

describe("slop-scanner — Svelte 5 legacy APIs in script blocks", () => {
  it("flags export let in script (should be $props())", async () => {
    const code = [
      '<script lang="ts">',
      "  export let title: string;",
      "</script>",
      "<h1>{title}</h1>",
    ].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "svelte5-legacy" && v.severity === "error")).toBe(
      true,
    );
  });

  it("flags createEventDispatcher (should be callback props)", async () => {
    const code = [
      '<script lang="ts">',
      "  import { createEventDispatcher } from 'svelte';",
      "  const dispatch = createEventDispatcher();",
      "</script>",
    ].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "svelte5-legacy" && v.severity === "error")).toBe(
      true,
    );
  });

  it("flags $app/stores import (should be $app/state)", async () => {
    const code = ['<script lang="ts">', "  import { page } from '$app/stores';", "</script>"].join(
      "\n",
    );
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "svelte5-legacy" && v.severity === "error")).toBe(
      true,
    );
  });
});

describe("slop-scanner — accessibility naming rules", () => {
  it("id= alone is NOT an accessible name (input without label is flagged)", async () => {
    const code = '<input id="email" type="text" />';
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(
      violations.some((v) => v.category === "accessibility" && v.message.includes("input")),
    ).toBe(true);
  });

  it("passes input with a wrapping <label for> association", async () => {
    const code = ['<label for="email">E-Mail</label>', '<input id="email" type="text" />'].join(
      "\n",
    );
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "accessibility")).toBe(false);
  });

  it("passes aria-hidden decorative elements", async () => {
    const code = '<button aria-hidden="true" type="button"><svg /></button>';
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "accessibility")).toBe(false);
  });

  it("passes role=presentation elements", async () => {
    const code = '<a href="/x" role="presentation"><svg /></a>';
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "accessibility")).toBe(false);
  });

  it("passes multi-line anchor with visible text on a later line", async () => {
    const code = [
      "<a",
      '  href="/login"',
      '  class="btn">',
      "  <svg />",
      "  Back to Sign In",
      "</a>",
    ].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "accessibility")).toBe(false);
  });

  it("flags icon-only anchor without any name", async () => {
    const code = ['<a href="/">', "  <svg />", "</a>"].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "accessibility")).toBe(true);
  });

  it("comment mentions of crypto.randomUUID() are not flagged", async () => {
    const code = [
      "<!--",
      "  docs: crypto.randomUUID() for IDs",
      "-->",
      '<script lang="ts">',
      "  const id = generateId('input');",
      "</script>",
      "<div {id} />",
    ].join("\n");
    const violations = await scanSvelteContent("src/components/input.svelte", code);
    expect(violations.some((v) => v.category === "ssr-hydration")).toBe(false);
  });

  it("event-scoped crypto.randomUUID() inside a handler function is not flagged", async () => {
    const code = [
      '<script lang="ts">',
      "  function addItem() {",
      "    items = [...items, { _id: crypto.randomUUID() }];",
      "  }",
      "</script>",
    ].join("\n");
    const violations = await scanSvelteContent("src/components/list.svelte", code);
    expect(violations.some((v) => v.category === "ssr-hydration")).toBe(false);
  });
});

describe("slop-scanner — goto() preloading rule", () => {
  it("flags bare goto() navigation in script", async () => {
    const code = [
      '<script lang="ts">',
      "  import { goto } from '$app/navigation';",
      "  function openSettings() {",
      "    goto('/settings');",
      "  }",
      "</script>",
    ].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "preloading" && v.severity === "warning")).toBe(
      true,
    );
  });

  it("passes post-action goto() after await (redirect)", async () => {
    const code = [
      '<script lang="ts">',
      "  import { goto } from '$app/navigation';",
      "  async function save() {",
      "    await api.save();",
      "    goto('/settings');",
      "  }",
      "</script>",
    ].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "preloading")).toBe(false);
  });

  it("passes URL-sync goto() with options (filter/pagination escape hatch)", async () => {
    const code = [
      '<script lang="ts">',
      "  import { goto } from '$app/navigation';",
      "  const url = new URL('/x');",
      "  goto(`${url.pathname}?${url.searchParams.toString()}`, { reset: false });",
      "</script>",
    ].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "preloading")).toBe(false);
  });

  it("passes inline slop:suppress escape hatch", async () => {
    const code = [
      '<script lang="ts">',
      "  import { goto } from '$app/navigation';",
      "  function onUploadComplete() {",
      "    // slop:suppress — post-action redirect",
      "    goto('/media');",
      "  }",
      "</script>",
    ].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "preloading")).toBe(false);
  });
});

describe("slop-scanner — exclusion predicate matches path segments, not substrings", () => {
  it("does NOT exclude feature dirs/files whose names merely contain 'build'", () => {
    expect(isExcludedPath("src/routes/(app)/config/collectionbuilder/+page.svelte")).toBe(false);
    expect(
      isExcludedPath("src/routes/(app)/config/collectionbuilder/nested-content/x.svelte"),
    ).toBe(false);
    expect(isExcludedPath("src/routes/(app)/config/workflows/workflow-builder.svelte")).toBe(false);
    expect(isExcludedPath("src/components/system/builder/logic-builder.svelte")).toBe(false);
    expect(isExcludedPath("src/databases/core/sql-query-builder.ts")).toBe(false);
  });

  it("does NOT exclude names that merely contain 'dist'/'paraglide' as a substring", () => {
    expect(isExcludedPath("src/utils/distribution.ts")).toBe(false);
  });

  it("still excludes generated/dependency directories as whole segments", () => {
    for (const p of [
      "node_modules/pkg/index.js",
      ".svelte-kit/generated/server.js",
      "src/paraglide/messages.js",
      "dist/app.js",
      "build/server/index.js",
    ]) {
      expect(isExcludedPath(p)).toBe(true);
    }
  });

  it("handles Windows separators and nested build/dist dirs", () => {
    expect(isExcludedPath("src\\routes\\build\\page.ts")).toBe(true);
    expect(isExcludedPath("dist/chunks/build.js")).toBe(true);
    expect(isExcludedPath("src/rebuild/page.svelte")).toBe(false);
  });
});

describe("slop-scanner — crypto.randomUUID() scope detection", () => {
  it("exempts an ID generated inside a long event handler body", async () => {
    const filler = Array.from({ length: 30 }, (_, i) => `  const v${i} = ${i};`).join("\n");
    const code = [
      '<script lang="ts">',
      "  function duplicateNode(node: { _id?: string }) {",
      filler,
      "    const newId = crypto.randomUUID();",
      "    return { ...node, _id: newId };",
      "  }",
      "</script>",
      "<div />",
    ].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "ssr-hydration")).toBe(false);
  });

  it("stays quiet for an ID in a destructuring-arrow handler (`}) => {`)", async () => {
    const code = [
      '<script lang="ts">',
      "  const save = async ({ name }: { name: string }) => {",
      "    if (!name) return;",
      "    const id = crypto.randomUUID();",
      "    return id;",
      "  };",
      "</script>",
    ].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "ssr-hydration")).toBe(false);
  });

  it("still flags an ID at render scope after a closed sibling function", async () => {
    const code = [
      '<script lang="ts">',
      "  function makeId() {",
      "    return crypto.randomUUID();",
      "  }",
      "  const contentId = crypto.randomUUID();",
      "</script>",
    ].join("\n");
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "ssr-hydration" && v.severity === "error")).toBe(
      true,
    );
  });
});

describe("slop-scanner — isolation (no shared violation state)", () => {
  it("returns only its own violations on repeated calls", async () => {
    const clean = await scanSvelteContent("src/routes/a.svelte", "<p>hello</p>");
    const dirty = await scanSvelteContent("src/routes/b.svelte", "<div>{@html evil}</div>");
    expect(clean).toHaveLength(0);
    expect(dirty.some((v) => v.category === "security")).toBe(true);
  });
});
