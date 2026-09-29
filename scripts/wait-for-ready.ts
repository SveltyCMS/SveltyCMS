#!/usr/bin/env bun
/**
 * @file scripts/wait-for-ready.ts
 * @description Zero-dependency readiness gate for CI/local servers and DB ports.
 * Replaces the `wait-on` CLI (transitively pulls axios/joi/lodash/minimist/rxjs)
 * with a probe that can also wait for a real HTTP response and fail fast when
 * the watched process exits mid-wait.
 *
 * Features:
 * - `tcp:host:port` — resolves on TCP accept (database containers)
 * - `http(s)://…` — resolves on any response < 500 (proves the app serves HTTP)
 * - `--pid=<pid>` — abort immediately when the watched process is gone
 * - `--timeout=<ms>` / `--interval=<ms>` — bounded polls, elapsed-time log
 *
 * Usage:
 *   bun run scripts/wait-for-ready.ts tcp:127.0.0.1:5432 --timeout=90000 --interval=2000
 *   bun run scripts/wait-for-ready.ts http://127.0.0.1:4173/api/system/health --pid=1234
 */

import { connect } from "node:net";

type Target = { kind: "tcp"; host: string; port: number } | { kind: "http"; url: string };

function parseArgs(argv: string[]): { target: string; flags: Map<string, string> } {
  const flags = new Map<string, string>();
  let target = "";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      target ||= arg;
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 2) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(arg.slice(2), next);
        i++;
      } else {
        flags.set(arg.slice(2), "");
      }
    }
  }
  return { target, flags };
}

function parseTarget(raw: string): Target {
  if (raw.startsWith("http://") || raw.startsWith("https://")) return { kind: "http", url: raw };
  const tcp = /^tcp:(.+):(\d+)$/.exec(raw) ?? /^(.+):(\d+)$/.exec(raw);
  if (tcp) return { kind: "tcp", host: tcp[1], port: Number(tcp[2]) };
  throw new Error(`unsupported target "${raw}" — use tcp:host:port or http(s)://url`);
}

function parseNumber(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`--${name} must be a positive number, got "${value}"`);
  return n;
}

/** TCP accept probe with a bounded per-attempt timeout. Returns null on success, else the error. */
function probeTcp(host: string, port: number, attemptMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let settled = false;
    const done = (error: string | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(error);
    };
    socket.setTimeout(attemptMs, () => done("timeout"));
    socket.once("connect", () => done(null));
    socket.once("error", (error: Error) => done(error.message));
  });
}

/** HTTP probe: any response < 500 proves the server answers HTTP. Returns null on success. */
async function probeHttp(url: string, attemptMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(attemptMs),
      headers: { "user-agent": "sveltycms-wait-for-ready" },
    });
    await res.body?.cancel();
    return res.status < 500 ? null : `HTTP ${res.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const { target: rawTarget, flags } = parseArgs(process.argv.slice(2));
  const target = parseTarget(rawTarget);
  const timeoutMs = parseNumber(flags.get("timeout"), 120_000, "timeout");
  const intervalMs = parseNumber(flags.get("interval"), 500, "interval");
  const pidRaw = flags.get("pid");
  const pid = pidRaw === undefined || pidRaw === "" ? null : Number(pidRaw);
  if (pid !== null && !Number.isInteger(pid))
    throw new Error(`--pid must be an integer, got "${pidRaw}"`);

  const label = target.kind === "tcp" ? `tcp:${target.host}:${target.port}` : target.url;
  const attemptMs = Math.max(250, Math.min(intervalMs, 5000));
  const started = Date.now();
  console.log(
    `⏳ wait-for-ready: ${label} (timeout ${timeoutMs}ms, interval ${intervalMs}ms${pid === null ? "" : `, pid ${pid}`})`,
  );

  let lastError = "no attempt completed";
  for (;;) {
    if (pid !== null && !isProcessAlive(pid)) {
      throw new Error(`${label} not ready — watched process ${pid} exited`);
    }
    lastError =
      (target.kind === "tcp"
        ? await probeTcp(target.host, target.port, attemptMs)
        : await probeHttp(target.url, attemptMs)) ?? "";
    if (lastError === "") {
      console.log(`✅ wait-for-ready: ${label} ready after ${Date.now() - started}ms`);
      return;
    }
    const elapsed = Date.now() - started;
    if (elapsed >= timeoutMs) {
      throw new Error(`${label} not ready after ${timeoutMs}ms — last error: ${lastError}`);
    }
    await sleep(Math.min(intervalMs, timeoutMs - elapsed));
  }
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(`❌ wait-for-ready: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
