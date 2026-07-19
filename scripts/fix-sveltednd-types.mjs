#!/usr/bin/env node
/**
 * Fix @thisux/sveltednd after install.
 *
 * The package is sourced from GitHub (no pre-built dist/). This script:
 *   1. Builds dist/ if missing (CI needs this — local may have cached build)
 *   2. Patches two TS issues in dist/index.d.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const PKG_DIR = "node_modules/@thisux/sveltednd";
const DTS = `${PKG_DIR}/dist/index.d.ts`;

// Step 1: Build dist/ if missing (CI has no cached build)
const mainEntry = `${PKG_DIR}/dist/index.js`;
if (!existsSync(mainEntry)) {
  console.log("[postinstall] Building @thisux/sveltednd...");
  try {
    // Dependencies already installed by root bun install — just build
    execSync("bun run build", { cwd: PKG_DIR, stdio: "pipe" });
    console.log("[postinstall] Build succeeded");
  } catch (e) {
    console.warn("[postinstall] Build failed — skipping type fixes:", e.message?.slice(0, 120));
    process.exit(0);
  }
}

// Step 2: Fix type declaration issues (invalid .d.ts)
if (!existsSync(DTS)) {
  process.exit(0);
}

let content = readFileSync(DTS, "utf8");

content = content.replace(
  /^import.*dnd\.css.*\n?/gm,
  "// styles injected at runtime via svelte actions\n",
);

content = content.replace(
  "export type * from './types/index.js';",
  "export type { DragDropState, DragDropCallbacks, DragDropAttributes, DragDropOptions, DraggableOptions, DragInputMode, KeyboardOptions, KeyboardAnnouncementContext } from './types/index.js';",
);

if (content !== readFileSync(DTS, "utf8")) {
  writeFileSync(DTS, content, "utf8");
  console.log("[postinstall] Fixed @thisux/sveltednd type declarations");
}
