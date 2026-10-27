/**
 * @file index.cjs
 * @description Passenger / Plesk / Docker entry point for SveltyCMS.
 * Loads the SvelteKit adapter-node built application.
 *
 * Features:
 * - CommonJS loader for environments requiring a CJS entry (Plesk / Phusion Passenger)
 * - Container-aware startup defaults (PORT, HOST, BODY_SIZE_LIMIT)
 * - Container-aware V8 heap cap: V8 sizes its default old-space against the HOST's
 *   RAM and ignores cgroups, so inside a container it never feels pressure and RSS
 *   balloons. Node exposes no in-process API to change it (`v8.setHeapLimits` is
 *   absent, and `v8.setFlagsFromString('--max-old-space-size=…')` does not move
 *   `heap_size_limit` — both verified), so the cap is applied by re-executing with
 *   the flag, forwarding signals, and exiting with the child's status.
 * - Applies `UV_THREADPOOL_SIZE` before the loop starts (libuv reads it once, so a
 *   runtime assignment is a no-op — measured)
 * - Direct execution of the compiled SvelteKit production server
 */

const os = require("node:os");

/* ─────────────────────── effective-memory detection ───────────────────────
 * The memory the OS actually allows THIS process. `process.constrainedMemory()`
 * reports 0 when unconstrained under Node but the HOST TOTAL under Bun, so a
 * limit at/above the host total is not treated as a constraint. Returns 0 when
 * unconstrained — every rule below then leaves the historical defaults alone,
 * because capping a 64 GB box at a container's budget would be a regression.
 */
function effectiveMemoryMb() {
  const explicit = Number(process.env.HARDWARE_MEM_LIMIT_MB);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const constrained =
    typeof process.constrainedMemory === "function" ? process.constrainedMemory() : 0;
  const hostTotal = os.totalmem();
  if (constrained > 0 && constrained < hostTotal * 0.95) return constrained / 1048576;
  return 0;
}

const limitMb = effectiveMemoryMb();

/**
 * V8 old-space cap. Rule: 0.5 × the effective limit, clamped [128, 4096] MB — the
 * SAME ratio the hardware profile derives (`NODE_HEAP_RATIO` in
 * `src/utils/hardware-profile.ts`; the unit suite pins the six documented values
 * so the two cannot drift). `NODE_HEAP_MB` overrides.
 */
function desiredHeapMb() {
  const explicit = Number(process.env.NODE_HEAP_MB);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (!limitMb) return 0;
  return Math.min(4096, Math.max(128, Math.round(limitMb * 0.5)));
}

/**
 * adapter-node request-body ceiling. Rule: 1/32 of the effective limit, floored
 * at 16 MB (10 MB multipart uploads must keep working, and the app's own API gate
 * is ≥ 15 MB) and capped at the historical 100 MB default. The machine-blind 100 MB
 * is an OOM vector on a 256 MB box. `BODY_SIZE_LIMIT` (bytes) overrides.
 */
function desiredBodyLimitBytes() {
  if (!limitMb) return 100 * 1024 * 1024;
  return Math.min(100, Math.max(16, Math.round(limitMb / 32))) * 1024 * 1024;
}

// Set environment defaults before importing adapter-node
process.env.BODY_SIZE_LIMIT = process.env.BODY_SIZE_LIMIT || String(desiredBodyLimitBytes());
process.env.PORT = process.env.PORT || "4173";
process.env.HOST = process.env.HOST || "0.0.0.0";

// libuv reads UV_THREADPOOL_SIZE BEFORE the loop starts, so a runtime assignment
// (the boot hook used to do one) has no effect — measured: blocking pbkdf2 n=8/n=4
// ratio 1.69 with a runtime set vs 1.25 pre-set, 1.78 at the default 4. Clamped
// like the profile's `threadPoolSize` (4–32) so a big host does not oversubscribe
// blocking-I/O threads; an operator-set value always wins.
if (!process.env.UV_THREADPOOL_SIZE) {
  const cpus =
    typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  process.env.UV_THREADPOOL_SIZE = String(Math.min(32, Math.max(4, cpus || 4)));
}

// Load SveltyCMS's compiled SvelteKit production server
function startServer() {
  import("./build/index.js").catch((err) => {
    console.error("[SveltyCMS] CRITICAL: Failed to start server:", err);
    process.exit(1);
  });
}

/* ───────────────────────── container-aware heap cap ─────────────────────────
 * Deliberately skipped when:
 *  - the operator already set a heap flag (`NODE_OPTIONS` or `execArgv`),
 *  - `SVELTY_NO_HEAP_CAP=1`,
 *  - the process is UNCONSTRAINED (bare metal: V8's default is right),
 *  - we are running under Phusion Passenger, which owns the process lifecycle and
 *    does not expect an exec'd child,
 *  - we already re-executed (loop guard).
 */
const heapMb = limitMb ? desiredHeapMb() : 0;
const hasHeapFlag =
  /--max[-_]old[-_]space[-_]size/.test(process.env.NODE_OPTIONS || "") ||
  process.execArgv.some((arg) => arg.startsWith("--max-old-space-size"));
const underPassenger = Object.keys(process.env).some((key) => key.startsWith("PASSENGER_"));
const optedOut = process.env.SVELTY_NO_HEAP_CAP === "1";
const alreadyReexec = process.env.SVELTY_HEAP_REEXEC === "1";

if (heapMb > 0 && !hasHeapFlag && !underPassenger && !optedOut && !alreadyReexec) {
  const semiSpaceMb = Math.max(2, Math.round(heapMb / 8));
  const childArgs = [
    `--max-old-space-size=${heapMb}`,
    `--max-semi-space-size=${semiSpaceMb}`,
    ...process.execArgv,
    __filename,
  ];
  console.error(
    `[SveltyCMS] Container heap cap: re-exec with --max-old-space-size=${heapMb} --max-semi-space-size=${semiSpaceMb} ` +
      `(limit ${Math.round(limitMb)}MB, body ceiling ${Math.round(desiredBodyLimitBytes() / 1048576)}MB). ` +
      `Set NODE_HEAP_MB or SVELTY_NO_HEAP_CAP=1 to override.`,
  );

  // POSIX: REPLACE this process instead of supervising a child. `spawn` keeps a
  // second Node isolate alive for the whole deployment (~45 MB RSS) solely to
  // forward signals; execve carries the same argv/env/stdio with no supervisor.
  // Windows has no execve — the spawn fallback below stays for it.
  if (process.platform !== "win32" && typeof process.execve === "function") {
    try {
      process.execve(process.execPath, childArgs, { ...process.env, SVELTY_HEAP_REEXEC: "1" });
    } catch (err) {
      console.error("[SveltyCMS] execve re-exec failed, falling back to a supervised child:", err);
    }
  }

  const { spawn } = require("node:child_process");
  const child = spawn(process.execPath, childArgs, {
    stdio: "inherit",
    env: { ...process.env, SVELTY_HEAP_REEXEC: "1" },
  });
  // Forward termination signals so `docker stop` / Ctrl+C reach the server.
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      try {
        child.kill(signal);
      } catch {
        /* child already gone */
      }
    });
  }
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code === null ? 1 : code);
  });
  child.on("error", (err) => {
    console.error("[SveltyCMS] CRITICAL: heap-cap re-exec failed, starting in-process:", err);
    startServer();
  });
} else {
  startServer();
}
