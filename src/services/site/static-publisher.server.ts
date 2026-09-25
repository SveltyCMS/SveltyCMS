/**
 * @file src/services/site/static-publisher.server.ts
 * @description Atomic Static Site Generator (SSG) & Publishing Pipeline.
 *
 * Pre-renders published `pages` into pure static HTML and swaps the result into
 * place with a single filesystem `rename`. Staging is a sibling of the live
 * target, so the swap stays on one filesystem (atomic, never `EXDEV`); the
 * previous build is moved aside rather than deleted and is restored if the swap
 * fails, so a failed publish can never leave a missing or half-written site.
 *
 * ### Features:
 * - Pre-renders all published `pages` with schema-aware HTML escaping + body sanitization
 * - Truly atomic, same-filesystem swap with backup/rollback of the previous build
 * - Preview (`dryRun`) mode returning a route manifest without touching the live site
 * - CSPRNG staging/backup directory names (no `Math.random()`)
 * - Path-traversal-safe slug handling
 * - EventBus notification (`site:static-publish`) for automation hooks
 */

import fs from "node:fs/promises";
import path from "node:path";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { logger } from "@utils/logger";
import { eventBus } from "@utils/event-bus";
import { nowISODateString } from "@utils/date";
import { sanitizeHtml } from "@utils/sanitize-html";
import type { DatabaseId } from "@src/databases/db-interface";
import type { SitePage } from "./types";

export interface StaticPublishOptions {
  tenantId?: DatabaseId;
  targetDir?: string;
  /** Render the site and report the route manifest without swapping the live directory. */
  dryRun?: boolean;
}

export interface StaticPublishedRoute {
  /** Root-relative URL path of the rendered document (e.g. `/`, `/about`). */
  path: string;
  /** UTF-8 byte length of the rendered HTML. */
  bytes: number;
}

export interface StaticPublishResult {
  success: boolean;
  /** True when nothing was swapped because the call was a preview (`dryRun`). */
  preview: boolean;
  pagesPublished: number;
  targetDir: string;
  durationMs: number;
  publishedAt: string;
  routes: StaticPublishedRoute[];
  error?: string;
}

const DEFAULT_PAGE_TITLE = "Page";

/** Escape a string for HTML text-node and quoted-attribute contexts. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Resolve a possibly i18n-keyed field to a single string, preferring `en`. */
function localized(value: string | Record<string, string> | undefined, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value.en ?? Object.values(value)[0] ?? fallback;
  }
  return fallback;
}

/**
 * Normalize a stored slug into traversal-proof path segments. `.`/`..`/empty
 * segments are dropped and every other segment is reduced to `[A-Za-z0-9_-]`, so
 * a hostile slug can never escape the staging directory.
 */
function safeSlugSegments(slug: string | undefined): string[] {
  if (!slug) return [];
  return slug
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .map((segment) => segment.replace(/[^A-Za-z0-9_-]/g, "-"))
    .filter((segment) => segment !== "");
}

/** Map a page to its route: root-relative URL path + staging-relative file path. */
function routeForPage(page: SitePage): { urlPath: string; fileRel: string } {
  const segments = safeSlugSegments(page.slug);
  if (segments.length === 0 || segments.join("/") === "home") {
    return { urlPath: "/", fileRel: "index.html" };
  }
  return {
    urlPath: `/${segments.join("/")}`,
    fileRel: `${segments.join("/")}/index.html`,
  };
}

/** Render a lightweight semantic HTML document for a given page. */
function renderStaticHtml(page: SitePage, allPages: SitePage[]): string {
  const title = localized(page.title, DEFAULT_PAGE_TITLE);
  const heroHeading = localized(page.heroHeading, title);
  const heroSubheading = localized(page.heroSubheading, "");
  // `body` is authored rich text: sanitize (never escape) it so legitimate
  // markup survives while script / event-handler payloads are stripped server-side.
  const body = sanitizeHtml(localized(page.body, ""));

  const navLinks = allPages
    .map((p) => {
      const { urlPath } = routeForPage(p);
      const label = localized(p.title, p.slug ?? DEFAULT_PAGE_TITLE);
      return `<li><a href="${escapeHtml(urlPath)}">${escapeHtml(label)}</a></li>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="generator" content="SveltyCMS Static Publisher">
  <style>
    :root { --font-sans: system-ui, -apple-system, sans-serif; --color-primary: #0284c7; }
    body { font-family: var(--font-sans); margin: 0; line-height: 1.6; color: #1e293b; background: #f8fafc; }
    header { background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
    nav ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 1.5rem; }
    nav a { text-decoration: none; color: #334155; font-weight: 500; }
    nav a:hover { color: var(--color-primary); }
    main { max-width: 900px; margin: 3rem auto; padding: 0 1.5rem; }
    h1 { font-size: 2.5rem; line-height: 1.2; margin-bottom: 0.5rem; color: #0f172a; }
    .subheading { font-size: 1.25rem; color: #64748b; margin-bottom: 2rem; }
    .content { font-size: 1.125rem; }
    footer { text-align: center; padding: 2rem; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 0.875rem; }
  </style>
</head>
<body>
  <header>
    <div class="logo"><strong>${escapeHtml(title)}</strong></div>
    <nav aria-label="Main Navigation">
      <ul>${navLinks}</ul>
    </nav>
  </header>
  <main>
    <article>
      <h1>${escapeHtml(heroHeading)}</h1>
      ${heroSubheading ? `<p class="subheading">${escapeHtml(heroSubheading)}</p>` : ""}
      <div class="content">
        ${body}
      </div>
    </article>
  </main>
  <footer>
    <p>Published with SveltyCMS · Fully portable static HTML</p>
  </footer>
</body>
</html>`;
}

/**
 * Move `stagingDir` into `targetDir`, keeping the previous build restorable.
 *
 * Both directories are siblings, so `rename` is same-filesystem and therefore
 * atomic. The live directory is only ever renamed *to* the new build — it is
 * moved aside first and renamed back if the swap fails, which is what makes the
 * "zero half-published states" guarantee hold even on a failed rename.
 */
async function swapIntoPlace(stagingDir: string, targetDir: string): Promise<void> {
  const backupDir = `${targetDir}.backup-${globalThis.crypto.randomUUID()}`;
  let movedPrevious = false;

  const existing = await fs.stat(targetDir).catch(() => null);
  if (existing?.isDirectory()) {
    await fs.rename(targetDir, backupDir);
    movedPrevious = true;
  }

  try {
    await fs.rename(stagingDir, targetDir);
  } catch (swapErr) {
    if (movedPrevious) {
      await fs.rename(backupDir, targetDir).catch((rollbackErr: unknown) => {
        logger.error(
          "[SSG] Rollback of the previous build failed — it remains at the backup path",
          {
            backupDir,
            error: rollbackErr,
          },
        );
      });
    }
    throw swapErr;
  }

  if (movedPrevious) {
    await fs.rm(backupDir, { recursive: true, force: true }).catch((cleanupErr: unknown) => {
      logger.debug("[SSG] Could not remove previous-build backup", cleanupErr);
    });
  }
}

/**
 * Publishes the site to static HTML files with an atomic staging swap.
 *
 * With `dryRun` the render still happens (so the caller gets a faithful route
 * manifest and byte sizes) but the staging build is discarded and the live
 * directory is never touched — the "preview before it goes live" step.
 */
export async function publishStaticSite(
  options: StaticPublishOptions = {},
): Promise<StaticPublishResult> {
  const startTime = Date.now();
  const tenantId = options.tenantId ?? null;
  const dryRun = options.dryRun === true;
  const targetDir = options.targetDir ?? path.resolve(process.cwd(), "build", "static-site");

  if (!dbAdapter) {
    throw new Error("Cannot publish static site: Database adapter not initialized");
  }

  const cms = new LocalCMS(dbAdapter, { tenantId: tenantId ?? undefined });

  // Staging lives beside the target so the final swap is a same-filesystem rename.
  const parentDir = path.dirname(targetDir);
  await fs.mkdir(parentDir, { recursive: true });
  const stagingDir = path.join(
    parentDir,
    `${path.basename(targetDir)}.staging-${globalThis.crypto.randomUUID()}`,
  );
  await fs.mkdir(stagingDir, { recursive: true });

  try {
    // 1. Fetch all published pages.
    const result = await cms.collections.find("pages", {
      tenantId,
      limit: 500,
      publicationFilter: "published",
    });

    const pages = (Array.isArray(result?.data) ? result.data : []) as SitePage[];
    if (pages.length === 0) {
      logger.warn("[SSG] No published pages found to export.");
    }

    // 2. Render each page to disk in the staging directory.
    const routes: StaticPublishedRoute[] = [];
    for (const page of pages) {
      const { urlPath, fileRel } = routeForPage(page);
      const html = renderStaticHtml(page, pages);
      const absolute = path.join(stagingDir, fileRel);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, html, "utf8");
      routes.push({ path: urlPath, bytes: Buffer.byteLength(html, "utf8") });
    }

    const durationMs = Date.now() - startTime;
    const publishedAt = nowISODateString();

    if (dryRun) {
      // Preview only — discard the staging build, never touch the live directory.
      await fs.rm(stagingDir, { recursive: true, force: true }).catch((cleanupErr: unknown) => {
        logger.debug("[SSG] Could not remove preview staging directory", cleanupErr);
      });
      logger.info(`[SSG] Preview built ${pages.length} page(s) in ${durationMs}ms (not published)`);
      return {
        success: true,
        preview: true,
        pagesPublished: pages.length,
        targetDir,
        durationMs,
        publishedAt,
        routes,
      };
    }

    // 3. Atomic swap: move the previous build aside, then rename staging into place.
    await swapIntoPlace(stagingDir, targetDir);

    logger.info(`[SSG] Published ${pages.length} static pages to ${targetDir} in ${durationMs}ms`);

    // 4. Emit event for automations.
    eventBus.emit("site:static-publish", {
      pagesPublished: pages.length,
      targetDir,
      durationMs,
      tenantId,
    });

    return {
      success: true,
      preview: false,
      pagesPublished: pages.length,
      targetDir,
      durationMs,
      publishedAt,
      routes,
    };
  } catch (err: unknown) {
    // Cleanup staging directory on error (the live build is restored by `swapIntoPlace`).
    await fs.rm(stagingDir, { recursive: true, force: true }).catch((cleanupErr: unknown) => {
      logger.debug("[SSG] Could not remove failed staging directory", cleanupErr);
    });

    logger.error("[SSG] Static publishing failed:", err);
    return {
      success: false,
      preview: dryRun,
      pagesPublished: 0,
      targetDir,
      durationMs: Date.now() - startTime,
      publishedAt: nowISODateString(),
      routes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
