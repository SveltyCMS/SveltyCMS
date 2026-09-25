#!/usr/bin/env node
/**
 * @file scripts/create-app.js
 * @description Universal CLI to scaffold a new SveltyCMS project from the latest release.
 * Works seamlessly with both Node.js (npx) and Bun (bun create).
 *
 * Usage:
 *   bun create sveltycms my-project
 *   npx create-sveltycms my-project
 *
 * Features:
 * - Cross-platform git tag resolution (no unix pipe dependencies)
 * - Auto-detects Bun or npm package manager
 * - Clones the latest release from GitHub
 * - Initializes clean git repository
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = "https://github.com/SveltyCMS/SveltyCMS.git";
const args = process.argv.slice(2);

function help() {
  console.log(`
  🚀 SveltyCMS — Headless CMS powered by SvelteKit 3 + Svelte 5

  Usage:
    npx create-sveltycms <project-name> [options]
    bun create sveltycms <project-name> [options]

  Options:
    --template <name>   Starter template: blog, agency, saas, corporate, ecommerce (default: blog)
    --db <type>         Database: sqlite, postgresql, mariadb, mongodb (default: sqlite)
    --help              Show this help

  Examples:
    npx create-sveltycms my-cms
    npx create-sveltycms my-blog --template blog --db postgresql
  `);
}

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  help();
  process.exit(0);
}

const projectName = args[0];
const templateIndex = args.indexOf("--template");
const template = templateIndex !== -1 ? args[templateIndex + 1] : "blog";
const dbIndex = args.indexOf("--db");
const dbType = dbIndex !== -1 ? args[dbIndex + 1] : "sqlite";

const projectPath = path.resolve(process.cwd(), projectName);

async function main() {
  console.log(`\n🚀 Creating SveltyCMS project: ${projectName}\n`);

  // ── Step 1: Check destination ──
  if (fs.existsSync(projectPath)) {
    console.error(`❌ Directory already exists: ${projectPath}`);
    process.exit(1);
  }

  // ── Step 2: Clone latest release ──
  console.log("📦 Fetching latest SveltyCMS release...");
  try {
    // Cross-platform git tag discovery without piping to head/cut
    const remoteOutput = execSync(`git ls-remote --tags --sort=-v:refname ${REPO}`, {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();

    const firstLine = remoteOutput.split("\n")[0] || "";
    const tagMatch = firstLine.match(/refs\/tags\/(v[0-9A-Za-z.-]+)/);
    const tag = tagMatch ? tagMatch[1] : "";
    const ref = tag || "next";

    console.log(`   Using: ${ref === "next" ? "latest (next branch)" : ref}`);

    execSync(`git clone --depth 1 --branch ${ref} ${REPO} "${projectPath}"`, {
      stdio: "inherit",
    });
  } catch {
    // Fallback to next branch
    console.log("   Falling back to next branch...");
    execSync(`git clone --depth 1 ${REPO} "${projectPath}"`, {
      stdio: "inherit",
    });
  }

  // ── Step 3: Remove git history, start fresh ──
  const gitDir = path.join(projectPath, ".git");
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true });
  }

  // ── Step 4: Install dependencies ──
  console.log("\n📦 Installing dependencies...");
  const hasBun = (() => {
    try {
      execSync("bun --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  const installer = hasBun ? "bun install" : "npm install";
  console.log(`   Running: ${installer}`);
  execSync(installer, { cwd: projectPath, stdio: "inherit" });

  // ── Step 5: Initialize git ──
  console.log("\n📝 Initializing git repository...");
  execSync("git init", { cwd: projectPath, stdio: "pipe" });
  execSync("git add -A", { cwd: projectPath, stdio: "pipe" });
  execSync('git commit -m "chore: initial SveltyCMS project"', {
    cwd: projectPath,
    stdio: "pipe",
  });

  // ── Step 6: Print next steps ──
  const runCmd = hasBun ? "bun run dev" : "npm run dev";
  console.log(`
✅ SveltyCMS project created at: ${projectPath}

Next steps:

  cd ${projectName}
  ${runCmd}

The setup wizard will guide you through:
  • Database configuration (${dbType})
  • Admin account creation
  • Collection template selection (${template})
  • Security hardening — auto-generates secure keys (JWT, encryption, rate limiting)
  • Password policy — enforces PASSWORD_MIN_LENGTH: 8 by default

Templates available: blog, agency, saas, corporate, ecommerce

📚 Docs:    https://docs.sveltycms.com
💬 Discord: https://discord.gg/qKQRB6mP
⭐ GitHub:  https://github.com/SveltyCMS/SveltyCMS
`);
}

main().catch((err) => {
  console.error("❌ Scaffolding failed:", err.message);
  process.exit(1);
});
