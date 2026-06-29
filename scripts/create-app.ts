#!/usr/bin/env bun
/**
 * @file scripts/create-app.ts
 * @description CLI to scaffold a new SveltyCMS project from the latest release.
 *
 * Usage:
 *   bun create sveltycms my-project
 *   npx create-sveltycms my-project
 *
 * ### Features:
 * - Clones the latest release from GitHub
 * - Installs dependencies
 * - Initializes git repository
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = "https://github.com/SveltyCMS/SveltyCMS.git";
const args = process.argv.slice(2);

function help() {
  console.log(`
  🚀 SveltyCMS — Headless CMS powered by SvelteKit 2 + Svelte 5

  Usage:
    npx create-sveltycms <project-name> [options]

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
    // Get latest tag
    const tag = execSync(
      "git ls-remote --tags --sort=-v:refname " + REPO + " | head -1 | cut -d/ -f3",
      {
        encoding: "utf-8",
        stdio: "pipe",
      },
    ).trim();

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
  const installer = process.platform === "win32" ? "npm install" : "bun install";
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
  console.log(`
✅ SveltyCMS project created at: ${projectPath}

Next steps:

  cd ${projectName}
  bun run dev

The setup wizard will guide you through:
  • Database configuration (${dbType})
  • Admin account creation
  • Collection template selection (${template})

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
