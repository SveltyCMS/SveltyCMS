#!/usr/bin/env node
/** Restore vendored sveltednd dist/ — always up-to-date. */
import { cpSync, existsSync } from "node:fs";
const SRC = "vendor/sveltednd-dist";
const DST = "node_modules/@thisux/sveltednd/dist";
if (existsSync(SRC)) {
  cpSync(SRC, DST, { recursive: true });
}
