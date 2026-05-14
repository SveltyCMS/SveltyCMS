/**
 * @file tests/lint-docs.ts
 * @description Enhanced validator for SveltyCMS documentation suite.
 *
 * Features:
 * - Validates frontmatter schema (Valibot).
 * - Checks for broken internal links (including anchors/slugs).
 * - Checks for broken image references.
 * - Path Alignment Check (matches frontmatter path to filesystem).
 * - Auto-fix mode (--fix) for paths and dates.
 * - ANSI colorized output for readability.
 */

import fs from "node:fs";
import path from "node:path";
import {
  array,
  isoDate,
  minLength,
  number,
  object,
  optional,
  pipe,
  safeParse,
  string,
  union,
} from "valibot";

// --- CLI Arguments ---
const ARGS = process.argv.slice(2);
const IS_FIX_MODE = ARGS.includes("--fix");

// --- ANSI Colors ---
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

// --- Frontmatter Schema Definition ---
const isoDateString = pipe(string(), isoDate());

const frontmatterSchema = object({
  path: pipe(string(), minLength(1)),
  title: pipe(string(), minLength(3)),
  description: pipe(string(), minLength(10)),
  order: optional(union([number(), string()])),
  icon: optional(string()),
  author: pipe(string(), minLength(2)),
  created: isoDateString,
  updated: isoDateString,
  tags: pipe(array(pipe(string(), minLength(2))), minLength(1)),
});

// --- Utilities ---

/**
 * Generates a GitHub-style slug from a string (header).
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/**
 * Extract all slugs (anchors) from a markdown file.
 */
const headerCache = new Map<string, Set<string>>();
function getSlugsFromFile(file: string): Set<string> {
  if (headerCache.has(file)) return headerCache.get(file)!;

  if (!fs.existsSync(file)) return new Set();

  const content = fs.readFileSync(file, "utf-8");
  const slugs = new Set<string>();

  // Match headers: # Header, ## Header, etc.
  const headerRegex = /^#+\s+(.*)$/gm;
  let match;
  while ((match = headerRegex.exec(content)) !== null) {
    slugs.add(slugify(match[1]));
  }

  // Match explicit anchors: {#custom-id}
  const anchorRegex = /\{#([\w-]+)\}/g;
  while ((match = anchorRegex.exec(content)) !== null) {
    slugs.add(match[1]);
  }

  headerCache.set(file, slugs);
  return slugs;
}

// --- simple frontmatter parser ---
function parseFrontmatter(content: string): Record<string, unknown> {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("---", 3);
  if (end === -1) return {};

  const yaml = content.slice(3, end).trim();
  const lines = yaml.split(/\r?\n/);

  const data: Record<string, unknown> = {};
  let currentKey: string | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    if (currentKey && line.trim().startsWith("-")) {
      const val = line
        .trim()
        .replace(/^-/, "")
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      (data[currentKey] as unknown[]).push(val);
      continue;
    }

    const [key, ...rest] = line.split(":");
    const rawValue = rest.join(":").trim();
    currentKey = key.trim();

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      data[currentKey] = rawValue
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
    } else if (rawValue === "") {
      data[currentKey] = [];
    } else if (rawValue.startsWith("'") || rawValue.startsWith('"')) {
      data[currentKey] = rawValue.replace(/^['"]|['"]$/g, "");
    } else if (rawValue.match(/^\d+$/)) {
      data[currentKey] = Number(rawValue);
    } else {
      data[currentKey] = rawValue;
    }
  }
  return data;
}

// --- Validation Functions ---

function checkHeaderHierarchy(content: string): string[] {
  const issues: string[] = [];
  const headerRegex = /^(#+)\s+(.*)$/gm;
  let lastLevel = 0;
  let match;

  while ((match = headerRegex.exec(content)) !== null) {
    const level = match[1].length;
    if (level > lastLevel + 1 && lastLevel !== 0) {
      issues.push(`${c.yellow}Header jump:${c.reset} h${lastLevel} to h${level} ("${match[2]}")`);
    }
    lastLevel = level;
  }
  return issues;
}

function checkAlertSyntax(content: string): string[] {
  const issues: string[] = [];
  // Check for legacy Docusaurus/Legacy syntax :::note
  if (content.includes(":::note") || content.includes(":::tip") || content.includes(":::warning")) {
    issues.push(`${c.yellow}Legacy alert syntax:${c.reset} Use "> [!NOTE]" instead of ":::note"`);
  }
  return issues;
}

function checkInternalLinks(file: string, content: string): string[] {
  const fileIssues: string[] = [];
  const linkRegex = /\[.*?\]\((?!http|https|#|\/)(.*?)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const [linkPath, anchor] = match[1].split("#");
    if (!linkPath && anchor) {
      // Internal anchor in same file - optional check
      continue;
    }

    const absoluteLinkPath = path.resolve(path.dirname(file), linkPath || "");
    const possiblePaths = [absoluteLinkPath, absoluteLinkPath + ".mdx", absoluteLinkPath + ".md"];

    const actualPath = possiblePaths.find((p) => fs.existsSync(p));

    if (!actualPath) {
      const relativeToRoot = path.relative(process.cwd(), absoluteLinkPath);
      fileIssues.push(
        `${c.red}Broken link:${c.reset} "${linkPath}" (Resolved to: ${relativeToRoot})`,
      );
    } else if (anchor) {
      const slugs = getSlugsFromFile(actualPath);
      if (!slugs.has(anchor)) {
        fileIssues.push(
          `${c.yellow}Broken anchor:${c.reset} "#${anchor}" not found in ${path.basename(actualPath)}`,
        );
      }
    }
  }
  return fileIssues;
}

function checkImages(file: string, content: string): string[] {
  const fileIssues: string[] = [];
  const imgRegex = /!\[.*?\]\((.*?)\)/g;
  let match;

  while ((match = imgRegex.exec(content)) !== null) {
    const imgPath = match[1];
    if (imgPath.startsWith("http")) continue;

    let absoluteImgPath;
    if (imgPath.startsWith("/")) {
      // Root-relative (static folder)
      absoluteImgPath = path.join(process.cwd(), "static", imgPath);
    } else {
      // File-relative
      absoluteImgPath = path.resolve(path.dirname(file), imgPath);
    }

    if (!fs.existsSync(absoluteImgPath)) {
      fileIssues.push(`${c.red}Broken image:${c.reset} "${imgPath}"`);
    }
  }
  return fileIssues;
}

// --- walk docs recursively ---
function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (full.endsWith(".mdx") || full.endsWith(".md")) {
      yield full;
    }
  }
}

// --- Main execution ---
const SCAN_DIRS = [path.resolve("./src/widgets"), path.resolve("./docs")];
const PROJECT_ROOT = path.resolve(".");
let totalFiles = 0;
let validFiles = 0;
let invalidFiles = 0;
let fixedFiles = 0;
const mdFiles: string[] = [];
const errors: Array<{ file: string; issues: string[] }> = [];

console.log(`${c.bright}${c.cyan}${"━".repeat(80)}${c.reset}`);
console.log(`${c.bright}${c.cyan}🔍 SveltyCMS Documentation Audit Engine${c.reset}`);
console.log(`${c.dim}📅 ${new Date().toLocaleString()}${c.reset}`);
if (IS_FIX_MODE) console.log(`${c.yellow}🛠️  Running in AUTO-FIX mode${c.reset}`);
console.log(`${c.bright}${c.cyan}${"━".repeat(80)}${c.reset}\n`);

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    totalFiles++;
    const relativePath = path.relative(PROJECT_ROOT, file);

    if (file.endsWith(".md")) {
      mdFiles.push(file);
      continue;
    }

    let raw = fs.readFileSync(file, "utf-8");
    let data = parseFrontmatter(raw);
    const result = safeParse(frontmatterSchema, data);

    // Strip code blocks to avoid false positives for examples
    const contentWithoutCodeBlocks = raw.replace(/```[\s\S]*?```/g, "");

    const linkIssues = checkInternalLinks(file, contentWithoutCodeBlocks);
    const imageIssues = checkImages(file, contentWithoutCodeBlocks);
    const hierarchyIssues = checkHeaderHierarchy(contentWithoutCodeBlocks);
    const alertIssues = checkAlertSyntax(contentWithoutCodeBlocks);

    const filesystemPath = path.relative(PROJECT_ROOT, file).replace(/\\/g, "/");
    const frontmatterPath = (data.path as string)?.replace(/\\/g, "/");
    const pathMismatch = frontmatterPath && frontmatterPath !== filesystemPath;

    const fileIssues: string[] = [];

    // Auto-fix logic
    if (IS_FIX_MODE && (pathMismatch || !result.success)) {
      let updatedRaw = raw;
      let changed = false;

      if (pathMismatch) {
        updatedRaw = updatedRaw.replace(/path:\s*['"].*?['"]/, `path: "${filesystemPath}"`);
        changed = true;
      }

      // Update 'updated' date to today if schema is valid or was fixed
      const today = new Date().toISOString().split("T")[0];
      if (data.updated !== today) {
        updatedRaw = updatedRaw.replace(/updated:\s*['"].*?['"]/, `updated: "${today}"`);
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(file, updatedRaw);
        fixedFiles++;
        // Re-read and re-parse to verify fix
        raw = updatedRaw;
        data = parseFrontmatter(raw);
      }
    }

    if (!result.success) {
      for (const issue of result.issues) {
        const field = issue.path?.map((p: any) => p.key).join(".") || "root";
        fileIssues.push(`${c.red}Schema error:${c.reset} [${field}] ${issue.message}`);
      }
    }

    if (pathMismatch) {
      fileIssues.push(
        `${c.red}Path mismatch:${c.reset} Expected "${filesystemPath}" but found "${frontmatterPath}"`,
      );
    }

    fileIssues.push(...linkIssues, ...imageIssues, ...hierarchyIssues, ...alertIssues);

    if (fileIssues.length === 0) {
      validFiles++;
    } else {
      invalidFiles++;
      errors.push({ file, issues: fileIssues });

      console.log(`${c.red}❌ ${relativePath}${c.reset}`);
      fileIssues.forEach((issue) => console.log(`   • ${issue}`));
      console.log("");
    }
  }
}

// Summary
console.log(`${c.bright}${c.cyan}${"━".repeat(80)}${c.reset}`);
console.log(`${c.bright}${c.cyan}📊 Audit Summary${c.reset}`);
console.log(`${c.bright}${c.cyan}${"━".repeat(80)}${c.reset}`);
console.log(`Total Files:     ${totalFiles}`);
console.log(`Valid:           ${c.green}${validFiles}${c.reset}`);
console.log(`Invalid:         ${invalidFiles > 0 ? c.red : c.green}${invalidFiles}${c.reset}`);
if (fixedFiles > 0) console.log(`Fixed:           ${c.yellow}${fixedFiles}${c.reset}`);
if (mdFiles.length > 0) console.log(`Legacy (.md):   ${c.yellow}${mdFiles.length}${c.reset}`);
console.log(`${c.bright}${c.cyan}${"━".repeat(80)}${c.reset}\n`);

if (invalidFiles > 0 || mdFiles.length > 0) {
  process.exit(1);
} else {
  console.log(`${c.green}✨ Documentation is 100% compliant!${c.reset}\n`);
}
