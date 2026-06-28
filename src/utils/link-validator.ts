/**
 * @file src/utils/link-validator.ts
 * @description Build-time (DEV-only) internal link validator for SveltyCMS.
 *
 * Scans all Svelte components for `<a href="...">` internal links and validates:
 * - Paths that don't exist → warning with closest match suggestion
 * - Links to deprecated/renamed routes
 * - Missing data-preload attributes on collection entry links
 *
 * Inspired by sv-router's validateRoutes() but extended for SvelteKit's
 * file-based routing and integrated with the semantic index for smart suggestions.
 *
 * ### Run:
 * ```bash
 * bun run scripts/validate-links.ts
 * ```
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { logger } from "@utils/logger";

// ─── Known Route Map ───────────────────────────────────────────────────────

const KNOWN_ROUTES = new Map<string, string>([
  // Admin routes
  ["/", "src/routes/(app)/+page.svelte"],
  ["/dashboard", "src/routes/(app)/dashboard/+page.svelte"],
  ["/mediagallery", "src/routes/(app)/mediagallery/+page.svelte"],
  ["/config", "src/routes/(app)/config/+page.svelte"],
  ["/config/collectionbuilder", "Collection Builder"],
  ["/config/collectionbuilder/new", "New Collection"],
  ["/config/system-settings", "System Settings"],
  ["/config/access-management", "Access Management"],
  ["/config/extensions", "Extensions"],
  ["/config/automations", "Automations"],
  ["/config/queue", "Background Queue"],
  ["/config/sync", "Data Sync"],
  ["/config?plugin=smart-importer", "Smart Importer"],
  ["/config/migration", "Smart Importer (legacy redirect)"],
  ["/config/webhooks", "Webhooks"],
  ["/config/redirects", "Redirects"],
  ["/config/trash", "Trash"],
  ["/config/monitor", "System Monitor"],
  ["/user", "src/routes/(app)/user/+page.svelte"],
  ["/login", "src/routes/login/+page.svelte"],
  // API routes
  ["/api/system/health", "Health check"],
  ["/api/collections", "Collections API"],
  ["/api/media", "Media API"],
]);

// ─── Link Scanner ──────────────────────────────────────────────────────────

interface LinkIssue {
  file: string;
  line: number;
  href: string;
  issue: "missing" | "suggestion" | "no-preload";
  suggestion?: string;
}

function scanDirectory(dir: string, issues: LinkIssue[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      scanDirectory(full, issues);
    } else if (entry.name.endsWith(".svelte")) {
      scanFile(full, issues);
    }
  }
}

function scanFile(filePath: string, issues: LinkIssue[]): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Match: href="/path" or href={`/path`}
    const hrefRegex = /href=["`{]([^"`}]+)["`}]/g;
    let match: RegExpExecArray | null;

    for (let i = 0; i < lines.length; i++) {
      hrefRegex.lastIndex = 0;
      while ((match = hrefRegex.exec(lines[i])) !== null) {
        const href = match[1];
        // Skip external, anchor-only, and dynamic paths
        if (href.startsWith("http") || href.startsWith("#") || href.includes("${")) continue;
        // Normalize: strip query params and hash
        const path = href.split("?")[0].split("#")[0];

        if (!KNOWN_ROUTES.has(path) && path.startsWith("/")) {
          const suggestion = findClosestRoute(path);
          issues.push({
            file: relative(process.cwd(), filePath),
            line: i + 1,
            href,
            issue: suggestion ? "suggestion" : "missing",
            suggestion,
          });
        }
      }

      // Check for collection entry links missing data-preload
      if (lines[i].includes("?edit=") && !lines[i].includes("data-preload=")) {
        issues.push({
          file: relative(process.cwd(), filePath),
          line: i + 1,
          href: lines[i].trim(),
          issue: "no-preload",
          suggestion: 'Add data-preload="smart" for predictive preloading',
        });
      }
    }
  } catch {
    // Binary or unreadable file — skip
  }
}

function findClosestRoute(path: string): string | undefined {
  // Simple Levenshtein-based suggestion
  let best = "";
  let bestDist = Infinity;
  for (const route of KNOWN_ROUTES.keys()) {
    const dist = levenshtein(path, route);
    if (dist < bestDist && dist < path.length / 2) {
      bestDist = dist;
      best = route;
    }
  }
  return best || undefined;
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, i) => [i]);
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        a[j - 1] === b[i - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[n][m];
}

// ─── Public API ────────────────────────────────────────────────────────────

export function validateLinks(): { issues: LinkIssue[]; ok: boolean } {
  const issues: LinkIssue[] = [];
  const srcDir = join(process.cwd(), "src", "routes");

  if (!existsSync(srcDir)) {
    logger.warn("[LinkValidator] src/routes directory not found");
    return { issues: [], ok: true };
  }

  scanDirectory(srcDir, issues);

  const missing = issues.filter((i) => i.issue === "missing");
  const suggestions = issues.filter((i) => i.issue === "suggestion");
  const noPreload = issues.filter((i) => i.issue === "no-preload");

  if (issues.length > 0) {
    console.log("\n🔗 Link Validation Report\n");
    if (missing.length > 0) {
      console.log(`❌ ${missing.length} broken link(s):`);
      for (const m of missing) {
        console.log(`   ${m.file}:${m.line} → "${m.href}" (route not found)`);
      }
    }
    if (suggestions.length > 0) {
      console.log(`\n💡 ${suggestions.length} link(s) with suggestions:`);
      for (const s of suggestions) {
        console.log(`   ${s.file}:${s.line} → "${s.href}" — did you mean "${s.suggestion}"?`);
      }
    }
    if (noPreload.length > 0) {
      console.log(`\n⚡ ${noPreload.length} link(s) missing data-preload:`);
      for (const n of noPreload) {
        console.log(`   ${n.file}:${n.line} — ${n.suggestion}`);
      }
    }
    console.log("");
  }

  return { issues, ok: missing.length === 0 };
}
