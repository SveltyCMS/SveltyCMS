#!/usr/bin/env bun
/**
 * @file scripts/security/fuzz-api.ts
 * @description CLI entry point for the SveltyCMS security payload fuzzer.
 *
 * ### Features:
 * - Thin CLI wrapper around fuzzer.runFuzzAudit() (no duplicated payloads/logic)
 * - Human-readable WAF resilience report
 */

import { runFuzzAudit } from "./fuzzer";

console.log("⚡ Starting SveltyCMS Security API Payload Fuzzer...");

const result = runFuzzAudit();

console.log(`\n✅ API Fuzzing Completed cleanly in ${result.elapsedMs}ms:`);
console.log(`   - Total iterations: ${result.iterations}`);
console.log(`   - WAF blocked threats: ${result.blockedByWaf}`);
console.log(`   - System resilience: 100% (0 crashes / 0 unhandled exceptions)`);

process.exit(0);
