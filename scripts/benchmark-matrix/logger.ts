/**
 * @file scripts\benchmark-matrix\logger.ts
 * @description Logger utility for the benchmark matrix tool.
 */

import { DB_METADATA } from "./config";

export const log = {
  header: (msg: string) => console.log(`\n\x1b[1m\x1b[38;5;208m🏢 ${msg}\x1b[0m`),
  info: (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    console.log(`\x1b[90m[${ts}]\x1b[0m \x1b[36mℹ ${msg}\x1b[0m`);
  },
  success: (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    console.log(`\x1b[90m[${ts}]\x1b[0m \x1b[32m✅ ${msg}\x1b[0m`);
  },
  error: (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    console.log(`\x1b[90m[${ts}]\x1b[0m \x1b[31m❌ ${msg}\x1b[0m`);
  },
  warn: (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    console.log(`\x1b[90m[${ts}]\x1b[0m \x1b[33m⚠ ${msg}\x1b[0m`);
  },
  db: (db: string, msg: string) => {
    const meta = (DB_METADATA as any)[db.toLowerCase()] ?? { color: "\x1b[37m" };
    const ts = new Date().toLocaleTimeString();
    console.log(`\x1b[90m[${ts}]\x1b[0m ${meta.color}[${db.toUpperCase()}]\x1b[0m ${msg}`);
  },
};
