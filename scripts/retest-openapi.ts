/**
 * @file scripts/retest-openapi.ts
 * @description Performance retest script for OpenAPI enhancements.
 * Uses x-test-secret to bypass auth for reliable performance metrics.
 */

import { spawn, execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 4173;
const TEST_API_SECRET = "SVELTYCMS_TEST_SECRET_2026";

async function freePort(port: number) {
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${port},3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" },
      );
    }
  } catch {}
}

async function main() {
  console.log("🏢 Starting OpenAPI Performance Retest Suite...");
  await freePort(PORT);

  const env = {
    ...process.env,
    PORT: PORT.toString(),
    DB_TYPE: "sqlite",
    DB_NAME: "openapi_retest",
    TEST_MODE: "true",
    TEST_API_SECRET,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    ORIGIN: `http://127.0.0.1:${PORT}`,
  };

  console.log("🚀 Launching SveltyCMS...");
  const serverPath = existsSync(path.join(process.cwd(), "build/index.js"))
    ? "build/index.js"
    : ".svelte-kit/output/server/index.js";
  const server = spawn("bun", [serverPath], { env });

  // Wait for server to be ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/system/health`, {
        headers: { "x-test-secret": TEST_API_SECRET },
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!ready) {
    console.error("❌ Server failed to start.");
    server.kill();
    process.exit(1);
  }

  console.log("✅ Server Ready. Starting benchmarks...");

  const url = `http://127.0.0.1:${PORT}/api/openapi.json`;
  const fetchOpts = {
    headers: {
      "x-test-secret": TEST_API_SECRET,
      "x-admin-email": "admin@example.com",
    },
  };

  // 1. Initial Load (Miss)
  const s1 = performance.now();
  const res1 = await fetch(url, fetchOpts);
  const e1 = performance.now();
  const text = await res1.text();
  if (!res1.ok) {
    console.error(`❌ Fetch failed (${res1.status}): ${text}`);
    process.exit(1);
  }
  const size = Buffer.from(text).length;
  console.log(
    `⏱️  Initial Load (Miss): ${(e1 - s1).toFixed(2)}ms (Size: ${(size / 1024).toFixed(1)}KB)`,
  );

  // 2. Subsequent Loads (L1 Hit)
  const iterations = 10;
  let totalTime = 0;
  for (let i = 0; i < iterations; i++) {
    const s = performance.now();
    await fetch(url, fetchOpts);
    totalTime += performance.now() - s;
  }
  console.log(`⏱️  L1 Cache Hit (Avg of ${iterations}): ${(totalTime / iterations).toFixed(2)}ms`);

  // 3. Invalidation
  console.log("🔄 Triggering Invalidation...");
  await fetch(`http://127.0.0.1:${PORT}/api/testing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-secret": TEST_API_SECRET },
    body: JSON.stringify({ action: "reinitialize" }),
  });

  // 4. Post-Invalidation (Miss)
  const s2 = performance.now();
  await fetch(url, fetchOpts);
  const e2 = performance.now();
  console.log(`⏱️  Post-Invalidation Load (Miss): ${(e2 - s2).toFixed(2)}ms`);

  console.log("\n🏁 Retest Complete.");

  if (process.platform === "win32") {
    execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: "ignore" });
  } else {
    server.kill();
  }
}

main().catch(console.error);
