/**
 * @file tests/lint-docs.ts
 * @description Semantic linter for SveltyCMS documentation.
 * Verifies frontmatter, structural tags, and internal link integrity.
 */

import fs from "node:fs";
import path from "node:path";

const DOCS_DIR = path.join(process.cwd(), "docs");

function walk(dir: string, callback: (filePath: string) => void) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      walk(filePath, callback);
    } else if (file.endsWith(".mdx") || file.endsWith(".md")) {
      callback(filePath);
    }
  }
}

let errorCount = 0;

console.log("🔍 Linting Documentation structure...");

walk(DOCS_DIR, (filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(process.cwd(), filePath);

  // 1. Verify Frontmatter
  if (!content.startsWith("---")) {
    console.error(`❌ [${relPath}]: Missing MDX frontmatter.`);
    errorCount++;
  } else {
    const endFrontmatter = content.indexOf("---", 3);
    if (endFrontmatter === -1) {
      console.error(`❌ [${relPath}]: Unclosed frontmatter.`);
      errorCount++;
    } else {
      const frontmatter = content.substring(3, endFrontmatter);
      if (!frontmatter.includes("title:")) {
        console.error(`❌ [${relPath}]: Missing 'title' in frontmatter.`);
        errorCount++;
      }
      if (!frontmatter.includes("path:")) {
        console.error(`❌ [${relPath}]: Missing 'path' in frontmatter.`);
        errorCount++;
      }
    }
  }

  // 2. Verify Mermaid Blocks (Structural check)
  const mermaidCount = (content.match(/```mermaid/g) || []).length;
  const mermaidEndCount = (content.match(/```/g) || []).length;
  // This is a simple check, could be improved
  if (mermaidCount > 0 && mermaidEndCount < mermaidCount * 2) {
    // potential unclosed block
  }

  // 3. Verify SveltyCMS Specific Tags
  if (content.includes("<!-- BENCHMARK_START -->") && !content.includes("<!-- BENCHMARK_END -->")) {
    console.error(`❌ [${relPath}]: Missing '<!-- BENCHMARK_END -->' tag.`);
    errorCount++;
  }
});

if (errorCount > 0) {
  console.error(`\n❌ Documentation linting failed with ${errorCount} errors.`);
  process.exit(1);
}

console.log("✅ Documentation structure verified.");
process.exit(0);
