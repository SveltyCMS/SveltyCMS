/**
 * @file tests/e2e/start-server.mjs
 * @description E2E test server starter — sets critical env vars before starting the server
 * to work around Playwright's webServer.env not passing vars on Windows
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const PORT = process.env.PORT || "4173";
const SERVER = process.env.SERVER || "ready";
const HOST = "127.0.0.1";

const TEST_JWT_SECRET = "e2e-test-jwt-secret-key-min-32-chars!!";
const TEST_ENCRYPTION_KEY = "e2e-test-encryption-key-min-32-chars!!";
const TEST_API_SECRET = process.env.TEST_API_SECRET || randomUUID();
const JWT_SECRET = process.env.E2E_JWT_SECRET || TEST_JWT_SECRET;
const ENCRYPTION_KEY = process.env.E2E_ENCRYPTION_KEY || TEST_ENCRYPTION_KEY;
const USE_GOOGLE_OAUTH = process.env.E2E_USE_GOOGLE_OAUTH || "true";
const GOOGLE_CLIENT_ID = process.env.E2E_GOOGLE_CLIENT_ID || "e2e-test-google-client-id";
const GOOGLE_CLIENT_SECRET =
  process.env.E2E_GOOGLE_CLIENT_SECRET || "e2e-test-google-client-secret";
const GITHUB_CLIENT_ID = process.env.E2E_GITHUB_CLIENT_ID || "e2e-test-github-client-id";
const GITHUB_CLIENT_SECRET =
  process.env.E2E_GITHUB_CLIENT_SECRET || "e2e-test-github-client-secret";

const env = {
  ...process.env,
  HOST,
  PORT,
  NODE_ENV: "test",
  TEST_MODE: "true",
  STRICT_SETUP_CHECK: SERVER === "setup" ? "true" : "false",
  DB_TYPE: "sqlite",
  DB_HOST: "localhost",
  DB_NAME: SERVER === "setup" ? "sveltycms_e2e_setup.db" : "sveltycms_e2e_ready.db",
  JWT_SECRET_KEY: JWT_SECRET,
  ENCRYPTION_KEY,
  TEST_API_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  USE_GOOGLE_OAUTH,
  MULTI_TENANT: "true",
  DEMO: "true",
};

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const PID = process.pid;
const MARKER = join(process.cwd(), `tests/e2e/.server-started-${SERVER}.marker`);
try {
  writeFileSync(MARKER, `pid=${PID} port=${PORT} server=${SERVER}`);
} catch {}

console.log(`[start-server] STARTED pid=${PID} server=${SERVER} port=${PORT}`);
console.log(`[start-server]   NODE_ENV=${env.NODE_ENV} TEST_MODE=${env.TEST_MODE}`);
console.log(
  `[start-server]   DB_TYPE=${env.DB_TYPE} DB_HOST=${env.DB_HOST} DB_NAME=${env.DB_NAME}`,
);
console.log(`[start-server]   JWT_SECRET_KEY=${JWT_SECRET ? "ok" : "MISSING"}`);
console.log(`[start-server]   ENCRYPTION_KEY=${ENCRYPTION_KEY ? "ok" : "MISSING"}`);

// Diagnostic: write env snapshot for verification
try {
  const snapshot = {
    NODE_ENV: env.NODE_ENV,
    TEST_MODE: env.TEST_MODE,
    DB_TYPE: env.DB_TYPE,
    DB_HOST: env.DB_HOST,
    DB_NAME: env.DB_NAME,
    JWT_SECRET_KEY: env.JWT_SECRET_KEY ? "ok" : "MISSING",
    ENCRYPTION_KEY: env.ENCRYPTION_KEY ? "ok" : "MISSING",
  };
  writeFileSync(
    join(process.cwd(), `tests/e2e/.env-snapshot-${SERVER}.json`),
    JSON.stringify(snapshot, null, 2),
  );
} catch {}

const child = spawn("node", ["build/index.js"], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  shell: false,
});

child.stdout.on("data", (d) => process.stdout.write(d));
child.stderr.on("data", (d) => process.stderr.write(d));

child.on("error", (err) => {
  console.error("[start-server] Failed to start server:", err);
  process.exit(1);
});

child.on("exit", (code) => {
  console.log(`[start-server] Server exited with code ${code}`);
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
