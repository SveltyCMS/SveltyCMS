/**
 * @file tests/unit/scripts/slop-scanner.test.ts
 * @description Unit tests for slop-scanner rules — Svelte 5 SSR hydration safety,
 * unpinned date localization detection, HTML sanitization proofs, and suppression
 * path matching.
 */

import { describe, it, expect } from "vitest";
import {
  buildScannerJson,
  isExcludedPath,
  isSuppressed,
  scanSvelteContent,
  summarizeViolations,
  type Violation,
} from "../../../scripts/security/slop-scanner";

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
  const unsafeHtml = (violations: Violation[]) =>
    violations.some((v) => v.category === "security" && v.message.includes("Unsafe {@html}"));

  it("flags raw {@html} without sanitization helper", async () => {
    const code = "<div>{@html untrustedPayload}</div>";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(unsafeHtml(violations)).toBe(true);
  });

  it("flags {@html marked(x)} — marked emits HTML, it does not sanitize", async () => {
    const code = "<div>{@html marked(rawText)}</div>";
    const violations = await scanSvelteContent("src/widgets/markdown.svelte", code);
    expect(unsafeHtml(violations)).toBe(true);
  });

  it("flags {@html user + escape(id)} — one escaped operand leaves the rest raw", async () => {
    const code = "<div>{@html user + escape(id)}</div>";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(unsafeHtml(violations)).toBe(true);
  });

  it("flags a ternary whose branches are not both sanitizer calls", async () => {
    const code = "<div>{@html flag ? sanitizeHtml(a) : b}</div>";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(unsafeHtml(violations)).toBe(true);
  });

  it("passes a ternary with sanitizer calls on both branches", async () => {
    const code = "<div>{@html flag ? sanitizeHtml(a) : sanitizeHtml(b)}</div>";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(unsafeHtml(violations)).toBe(false);
  });

  it("passes {@html DOMPurify.sanitize(x)}", async () => {
    const code = "<div>{@html DOMPurify.sanitize(rawHtml)}</div>";
    const violations = await scanSvelteContent("src/components/content.svelte", code);
    expect(unsafeHtml(violations)).toBe(false);
  });

  it("passes {@html sanitizeSvg(x)}", async () => {
    const code = "<div>{@html sanitizeSvg(svgMarkup)}</div>";
    const violations = await scanSvelteContent("src/components/icon.svelte", code);
    expect(unsafeHtml(violations)).toBe(false);
  });

  it("passes {@html sanitizeHtml(...)}", async () => {
    const code = "<div>{@html sanitizeHtml(userContent)}</div>";
    const violations = await scanSvelteContent("src/components/content.svelte", code);
    expect(unsafeHtml(violations)).toBe(false);
  });

  it("brace-matches {@html} with nested objects (not broken by inner braces)", async () => {
    const code = "<div>{@html render(article, { inline: true })}</div>";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(violations.some((v) => v.category === "security")).toBe(true);
  });

  it("passes {@html sanitizeHtml(render(article, { inline: true }))} nested", async () => {
    const code = "<div>{@html sanitizeHtml(render(article, { inline: true }))}</div>";
    const violations = await scanSvelteContent("src/routes/page.svelte", code);
    expect(unsafeHtml(violations)).toBe(false);
  });

  it("passes a bare identifier the same file binds to a sanitizer result", async () => {
    const code = [
      '<script lang="ts">',
      "  let raw = '';",
      "  const clean = $derived(sanitizeHtml(raw));",
      "</script>",
      "<div>{@html clean}</div>",
    ].join("\n");
    const violations = await scanSvelteContent("src/components/content.svelte", code);
    expect(unsafeHtml(violations)).toBe(false);
  });

  it("flags a bare identifier bound to a pass-through, not a sanitizer", async () => {
    const code = [
      '<script lang="ts">',
      "  const passthrough = (raw: string) => raw;",
      "  let clean = $state('');",
      "  clean = passthrough(clean);",
      "</script>",
      "<div>{@html clean}</div>",
    ].join("\n");
    const violations = await scanSvelteContent("src/components/content.svelte", code);
    expect(unsafeHtml(violations)).toBe(true);
  });
});

describe("slop-scanner — suppression path matching", () => {
  const rule = (file: string) => [{ file, category: "security" }];

  it("does NOT silence a same-named file in a subdirectory", () => {
    expect(isSuppressed("src/databases/utils.ts", "security", rule("utils.ts"))).toBe(false);
  });

  it("silences an exact repo-relative path", () => {
    expect(isSuppressed("utils.ts", "security", rule("utils.ts"))).toBe(true);
    expect(isSuppressed("src/db/utils.ts", "security", rule("src/db/utils.ts"))).toBe(true);
  });

  it("silences descendants when the entry is written as a directory", () => {
    expect(isSuppressed("utils.ts/child.ts", "security", rule("utils.ts/"))).toBe(true);
    expect(isSuppressed("utils.ts/child.ts", "security", rule("utils.ts"))).toBe(true);
    expect(isSuppressed("utils.ts", "security", rule("utils.ts/"))).toBe(true);
  });

  it("normalises separators and a leading ./ on both sides", () => {
    expect(isSuppressed("src\\db\\utils.ts", "security", rule(".\\src/db/utils.ts"))).toBe(true);
    expect(isSuppressed("./utils.ts", "security", rule("utils.ts"))).toBe(true);
  });

  it("honours the category wildcard and rejects a mismatched category", () => {
    expect(isSuppressed("utils.ts", "security", [{ file: "utils.ts", category: "*" }])).toBe(true);
    expect(isSuppressed("utils.ts", "security", rule("utils.tsx"))).toBe(false);
    expect(isSuppressed("utils.ts.helper.ts", "security", rule("utils.ts"))).toBe(false);
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
    expect(isExcludedPath("src/components/system/builder/widget-builder.svelte")).toBe(false);
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

describe("slop-scanner — advisory inventory is not a finding", () => {
  const violation = (category: string, severity: Violation["severity"]): Violation => ({
    file: "src/example.ts",
    line: 1,
    category,
    message: category,
    severity,
  });

  it("keeps documented/test-only exports and duplicate names out of the info count", () => {
    const summary = summarizeViolations([
      violation("security", "error"),
      violation("export-surface", "info"),
      violation("duplicate-export-name", "info"),
      violation("unused-export", "info"),
    ]);

    expect(summary.errors).toHaveLength(1);
    expect(summary.warnings).toHaveLength(0);
    // Only the actionable dead-code candidate is an info; the two advisory
    // inventories are tracked separately.
    expect(summary.infos).toHaveLength(1);
    expect(summary.infos[0].category).toBe("unused-export");
    expect(summary.inventory).toHaveLength(2);
  });

  it("reports a clean tree as 0/0/0 even with inventory present", () => {
    const summary = summarizeViolations([
      violation("export-surface", "info"),
      violation("duplicate-export-name", "info"),
    ]);

    expect(summary.errors).toHaveLength(0);
    expect(summary.warnings).toHaveLength(0);
    expect(summary.infos).toHaveLength(0);
    expect(summary.inventory).toHaveLength(2);
  });
});

describe("slop-scanner — machine-readable output (--json)", () => {
  const violation = (
    category: string,
    severity: Violation["severity"],
    file = "src/example.ts",
  ): Violation => ({ file, line: 1, category, message: category, severity });

  it("counts severities, categories and inventory separately", () => {
    const report = buildScannerJson({
      findings: [
        violation("security", "error"),
        violation("a11y", "warning"),
        violation("a11y", "warning"),
        violation("unused-export", "info"),
      ],
      inventory: [violation("export-surface", "info"), violation("duplicate-export-name", "info")],
      filesScanned: 42,
      isStrict: true,
      autofixedFiles: 1,
    });

    expect(report.ok).toBe(false);
    expect(report.counts).toEqual({ errors: 1, warnings: 2, infos: 1, inventory: 2 });
    expect(report.categories).toEqual({ a11y: 2, security: 1, "unused-export": 1 });
    expect(report.inventoryCategories).toEqual({ "duplicate-export-name": 1, "export-surface": 1 });
    expect(report.filesScanned).toBe(42);
    expect(report.autofixedFiles).toBe(1);
    expect(report.violations).toHaveLength(4);
  });

  it("is ok only when there are no errors and no warnings", () => {
    const infoOnly = buildScannerJson({
      findings: [violation("unused-export", "info")],
      inventory: [],
      filesScanned: 1,
      isStrict: false,
      autofixedFiles: 0,
    });

    expect(infoOnly.ok).toBe(true);
    expect(infoOnly.counts.errors + infoOnly.counts.warnings).toBe(0);
  });
});

describe("slop-scanner — credential autofill hints", () => {
  const passwordMarkup = '<Input type="password" autocomplete="current-password" />';

  it("flags a login autofill hint on a service credential field", async () => {
    const violations = await scanSvelteContent(
      "src/routes/setup/email-config.svelte",
      passwordMarkup,
    );
    expect(violations.some((v) => v.category === "credential-autofill")).toBe(true);
  });

  it("flags a username hint outside the admin-account step", async () => {
    const violations = await scanSvelteContent(
      "src/routes/setup/database-config.svelte",
      '<Input autocomplete="username" />',
    );
    expect(violations.some((v) => v.category === "credential-autofill")).toBe(true);
  });

  it("allows the real user-password forms", async () => {
    for (const file of [
      "src/routes/login/components/sign-in.svelte",
      "src/routes/(app)/user/components/tab-security.svelte",
      "src/components/user/modal-edit-form.svelte",
    ]) {
      const violations = await scanSvelteContent(file, passwordMarkup);
      expect(
        violations.some((v) => v.category === "credential-autofill"),
        file,
      ).toBe(false);
    }
  });
});
