/**
 * Generates the paraglide i18n output when it is missing.
 *
 * WHY THIS EXISTS
 * Every unit/security suite imports `@src/paraglide/runtime`, but `src/paraglide/**\/*.js`
 * is gitignored (see .gitignore) and none of the `test:*` scripts generated it. CI only
 * passes because .github/workflows/ci.yml runs `bun run paraglide` as its own step before
 * the test jobs. A fresh clone or a new git worktree therefore failed all 12 security test
 * files with:
 *   Error: Cannot find package '@src/paraglide/runtime' imported from src/utils/format-date.ts
 * A suite that only passes when an unrelated manual step ran first is not reproducible.
 *
 * Cost: one stat() (~1 ms) when the output exists, ~0.7 s once when it is missing.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const OUTPUT = "src/paraglide/runtime.js";

if (!existsSync(OUTPUT)) {
  console.log(`[ensure-paraglide] ${OUTPUT} missing - compiling i18n output`);
  const r = spawnSync("bun", ["run", "paraglide"], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(
      "[ensure-paraglide] compile failed. Run `bun run paraglide` manually and read its output.",
    );
    process.exit(r.status ?? 1);
  }
  if (!existsSync(OUTPUT)) {
    console.error(
      `[ensure-paraglide] compile reported success but ${OUTPUT} still does not exist.`,
    );
    process.exit(1);
  }
}
