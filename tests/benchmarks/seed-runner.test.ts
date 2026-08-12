/**
 * @file tests/benchmarks/seed-runner.test.ts
 * @description Matrix pre-seed runner.
 *
 * Executed via `bun test` (NOT plain `bun run`): importing CMS internals pulls
 * `.svelte.ts` rune files (`$derived`) and `$app` virtual modules that only the
 * SvelteKit/Vite toolchain compiles. The matrix orchestrator spawns this file
 * BEFORE starting the benchmark server so boot-time content initialization
 * sees a fully seeded state (roles + admin user + benchmark collections).
 *
 * Idempotent: safe to re-run after server restarts (same isolated DB).
 */
import { test } from "./modules/benchmark-utils";
import { seedBenchmarkState } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

test("matrix pre-seed (roles + admin + benchmark collections)", async () => {
  await seedBenchmarkState();
}, 180000);
