#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DTS = "node_modules/@thisux/sveltednd/dist/index.d.ts";

if (!existsSync(DTS)) {
  process.exit(0);
}

let content = readFileSync(DTS, "utf8");

// Fix 1: Remove CSS import
content = content.replace(
  /^import.*dnd\\.css.*\n?/gm,
  "// styles injected at runtime via svelte actions\n",
);

// Fix 2: Replace export type * with explicit re-exports
content = content.replace(
  "export type * from './types/index.js';",
  "export type { DragDropState, DragDropCallbacks, DragDropAttributes, DragDropOptions, DraggableOptions, DragInputMode, KeyboardOptions, KeyboardAnnouncementContext } from './types/index.js';",
);

if (content !== readFileSync(DTS, "utf8")) {
  writeFileSync(DTS, content, "utf8");
  console.log("[postinstall] Fixed @thisux/sveltednd type declarations");
}
