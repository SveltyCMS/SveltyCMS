#!/usr/bin/env node
/** Copy vendored sveltednd dist/ into node_modules. GitHub source has no pre-built dist/. */
import { cpSync, existsSync } from "node:fs";
const SRC = "vendor/sveltednd-dist";
const DST = "node_modules/@thisux/sveltednd/dist";
if (existsSync(SRC) && !existsSync(DST + "/index.js")) {
  cpSync(SRC, DST, { recursive: true });
  console.log("[postinstall] Restored vendored sveltednd dist/");
}
