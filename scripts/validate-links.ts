#!/usr/bin/env bun
/**
 * @file scripts/validate-links.ts
 * @description CLI entry point for build-time internal link validation.
 *
 * Run: bun run scripts/validate-links.ts
 *
 * Scans all Svelte components for internal <a href> links and reports:
 * - Broken links (routes that don't exist)
 * - Links with close-match suggestions
 * - Collection entry links missing data-preload attributes
 */
import { validateLinks } from "@utils/link-validator";

const { issues, ok } = validateLinks();

if (ok && issues.length === 0) {
  console.log("✅ All internal links are valid.\n");
  process.exit(0);
}

if (!ok) {
  console.log("❌ Link validation failed. Fix broken links above.\n");
  process.exit(1);
}

process.exit(0);
