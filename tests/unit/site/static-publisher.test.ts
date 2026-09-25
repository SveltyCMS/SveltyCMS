/**
 * @file tests/unit/site/static-publisher.test.ts
 * @description Unit tests for the atomic static site generator pipeline.
 *
 * Covers the swap contract (no half-published states), the preview manifest,
 * HTML-injection hardening, and slug path-traversal neutralization.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Mutable page fixture shared with the mocked SDK below (hoisted so the
// `vi.mock` factory can close over it before imports are evaluated).
const state = vi.hoisted(() => ({
  pages: [] as Array<Record<string, unknown>>,
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    isConnected: () => true,
    crud: {},
  },
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: class {
    collections = {
      find: vi.fn(async () => ({ success: true, data: state.pages })),
    };
  },
}));

import { publishStaticSite } from "@src/services/site/static-publisher.server";

const defaultPages = [
  {
    slug: "home",
    title: "Home Page",
    heroHeading: "Welcome to SveltyCMS",
    body: "The high-performance headless CMS.",
  },
  {
    slug: "about",
    title: "About Us",
    heroHeading: "About Our Company",
    body: "Built for the future.",
  },
];

describe("Static Site Publisher", () => {
  let testTargetDir: string;

  beforeEach(() => {
    state.pages = structuredClone(defaultPages);
    testTargetDir = path.join(
      os.tmpdir(),
      `svelty-ssg-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    );
  });

  afterEach(async () => {
    const parent = path.dirname(testTargetDir);
    const base = path.basename(testTargetDir);
    const entries = await fs.readdir(parent).catch(() => [] as string[]);
    await Promise.all(
      entries
        .filter(
          (e) => e === base || e.startsWith(`${base}.staging-`) || e.startsWith(`${base}.backup-`),
        )
        .map((e) => fs.rm(path.join(parent, e), { recursive: true, force: true })),
    );
  });

  it("pre-renders published pages and performs an atomic folder swap", async () => {
    const result = await publishStaticSite({ targetDir: testTargetDir });

    expect(result.success).toBe(true);
    expect(result.preview).toBe(false);
    expect(result.pagesPublished).toBe(2);
    expect(result.targetDir).toBe(testTargetDir);
    expect(result.routes.map((r) => r.path).sort()).toEqual(["/", "/about"]);
    expect(result.routes.every((r) => r.bytes > 0)).toBe(true);

    const indexHtml = await fs.readFile(path.join(testTargetDir, "index.html"), "utf8");
    expect(indexHtml).toContain("Welcome to SveltyCMS");
    expect(indexHtml).toContain("SveltyCMS Static Publisher");

    const aboutHtml = await fs.readFile(path.join(testTargetDir, "about", "index.html"), "utf8");
    expect(aboutHtml).toContain("About Our Company");
  });

  it("replaces an existing build and cleans up staging/backup directories", async () => {
    await publishStaticSite({ targetDir: testTargetDir });

    state.pages = [{ slug: "home", title: "Home v2", body: "second build" }];
    const second = await publishStaticSite({ targetDir: testTargetDir });

    expect(second.pagesPublished).toBe(1);
    const indexHtml = await fs.readFile(path.join(testTargetDir, "index.html"), "utf8");
    expect(indexHtml).toContain("Home v2");
    expect(indexHtml).not.toContain("Welcome to SveltyCMS");

    const parent = path.dirname(testTargetDir);
    const base = path.basename(testTargetDir);
    const leftovers = (await fs.readdir(parent)).filter(
      (e) => e.startsWith(`${base}.staging-`) || e.startsWith(`${base}.backup-`),
    );
    expect(leftovers).toEqual([]);
  });

  it("previews the route manifest without touching the live directory", async () => {
    // Pre-existing live build that a preview must never disturb.
    await fs.mkdir(testTargetDir, { recursive: true });
    await fs.writeFile(path.join(testTargetDir, "index.html"), "LIVE", "utf8");

    const result = await publishStaticSite({ targetDir: testTargetDir, dryRun: true });

    expect(result.success).toBe(true);
    expect(result.preview).toBe(true);
    expect(result.pagesPublished).toBe(2);
    expect(result.routes.map((r) => r.path).sort()).toEqual(["/", "/about"]);

    const live = await fs.readFile(path.join(testTargetDir, "index.html"), "utf8");
    expect(live).toBe("LIVE");

    const parent = path.dirname(testTargetDir);
    const base = path.basename(testTargetDir);
    const leftovers = (await fs.readdir(parent)).filter((e) => e.startsWith(`${base}.staging-`));
    expect(leftovers).toEqual([]);
  });

  it("escapes text fields and sanitizes authored body HTML", async () => {
    state.pages = [
      {
        slug: "home",
        title: "<script>alert(1)</script>",
        heroHeading: "Heading <b>bold</b>",
        body: '<p>ok</p><script>alert("x")</script>',
      },
    ];

    const result = await publishStaticSite({ targetDir: testTargetDir });
    expect(result.success).toBe(true);

    const html = await fs.readFile(path.join(testTargetDir, "index.html"), "utf8");
    // Text fields are escaped, never emitted as an executable tag.
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    // Authored markup survives, but script payloads are stripped.
    expect(html).toContain("<p>ok</p>");
    expect(html).not.toContain('alert("x")');
  });

  it("neutralizes path-traversal slugs", async () => {
    state.pages = [{ slug: "../../evil", title: "Evil", body: "nope" }];

    const result = await publishStaticSite({ targetDir: testTargetDir, dryRun: true });

    expect(result.success).toBe(true);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]?.path).toBe("/evil");
  });
});
