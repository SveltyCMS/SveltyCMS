#!/usr/bin/env bun
/**
 * @file scripts/quality-gate.ts
 * @description Pre-push quality gate — thin wrapper around scripts/precheck.ts (push tier).
 *
 * Invoked by: .githooks/pre-push
 * Manual run: bun run gate  |  bun run verify:push
 */

import { runPrecheckCli } from "./precheck.ts";

runPrecheckCli({ tier: "push" })
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Quality gate crashed:", err);
    process.exit(1);
  });
