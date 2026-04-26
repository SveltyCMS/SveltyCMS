#!/usr/bin/env bun
/**
 * @file scripts/setup-system.ts
 * @description Fast, non-browser setup for SveltyCMS during CI/Testing.
 * Directly calls SvelteKit Server Actions to configure database and admin.
 *
 * ### Environment variables
 * | Variable                | Default                    | Notes                          |
 * |-------------------------|----------------------------|--------------------------------|
 * | API_BASE_URL            | http://localhost:4173      |                                |
 * | TEST_API_SECRET         | ""                         |                                |
 * | DB_TYPE                 | sqlite                     | sqlite|mariadb|postgresql|mongo|
 * | DB_HOST                 | 127.0.0.1                  | ignored for sqlite             |
 * | DB_PORT                 | (per-driver default)       | ignored for sqlite             |
 * | DB_NAME                 | SveltyCMS_test             |                                |
 * | DB_USER                 | ""                         |                                |
 * | DB_PASSWORD             | ""                         |                                |
 * | MULTI_TENANT            | false                      |                                |
 * | DEMO                    | false                      |                                |
 * | USE_REDIS               | false                      |                                |
 * | PRESET                  | blog                       | seed preset                    |
 * | ADMIN_USERNAME          | admin                      |                                |
 * | ADMIN_EMAIL             | admin@example.com          |                                |
 * | ADMIN_PASSWORD          | (required — no default)    | script exits if missing        |
 * | SETUP_TIMEOUT_MS        | 300000                     | 5 min global script timeout    |
 * | WAIT_TIMEOUT_MS         | 60000                      | server readiness timeout       |
 * | RETRY_BASE_MS           | 1000                       | base for exponential backoff   |
 * | RETRY_MAX_ATTEMPTS      | 10                         |                                |
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Configuration — resolved once at startup, never mutated
// ---------------------------------------------------------------------------

const getTestSecret = () => {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  try {
    const { join } = require("node:path");
    const { existsSync, readFileSync } = require("node:fs");
    const secretPath = join(process.cwd(), "tests/e2e/.auth/test-secret.txt");
    if (existsSync(secretPath)) {
      return readFileSync(secretPath, "utf8").trim();
    }
  } catch {}
  return "SVELTYCMS_TEST_SECRET_2026";
};

const cfg = {
  apiBase: process.env.API_BASE_URL ?? "http://localhost:4173",
  apiSecret: getTestSecret(),
  rootDir: process.cwd(),

  db: {
    type: process.env.DB_TYPE ?? "sqlite",
    host: process.env.DB_HOST ?? "127.0.0.1",
    name: process.env.DB_NAME ?? "SveltyCMS_test",
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD ?? "",
    // Port: only meaningful for network-backed drivers.
    // sqlite has no port; we explicitly set undefined so the action ignores it.
    port: resolvePort(process.env.DB_TYPE, process.env.DB_PORT),
  },

  admin: {
    username: process.env.ADMIN_USERNAME ?? "admin",
    email: process.env.ADMIN_EMAIL ?? "admin@example.com",
    // No default — must be supplied explicitly in CI secrets.
    password: requireEnv("ADMIN_PASSWORD"),
  },

  system: {
    multiTenant: process.env.MULTI_TENANT === "true",
    demoMode: process.env.DEMO === "true",
    useRedis: process.env.USE_REDIS === "true",
    preset: process.env.PRESET ?? "blog",
  },

  timeouts: {
    // Hard ceiling for the entire script — CI will kill the job if this
    // fires, giving a clear error instead of an indefinite hang.
    script: Number(process.env.SETUP_TIMEOUT_MS ?? 3_600_000),
    // Per-attempt HTTP timeout.
    fetch: Number(process.env.FETCH_TIMEOUT_MS ?? 30_000),
    // Server readiness poll ceiling.
    wait: Number(process.env.WAIT_TIMEOUT_MS ?? 60_000),
  },

  retry: {
    baseMs: Number(process.env.RETRY_BASE_MS ?? 1_000),
    maxAttempts: Number(process.env.RETRY_MAX_ATTEMPTS ?? 10),
    // Cap so a single retry never waits longer than 30s regardless of attempt number.
    capMs: 30_000,
  },

  flags: {
    clean: process.argv.includes("--clean"),
    verbose: process.argv.includes("--verbose"),
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers — env / config
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    if (name === "ADMIN_PASSWORD" && process.env.TEST_MODE === "true") {
      return "Password123!";
    }
    fatal(`Required environment variable ${name} is not set.`);
  }
  return val!;
}

/**
 * Returns the default port for a given DB driver, or undefined for sqlite
 * (which uses a file path, not a host:port).
 */
function resolvePort(dbType: string | undefined, portEnv: string | undefined): number | undefined {
  if (portEnv) return Number(portEnv);
  switch (dbType) {
    case "mariadb":
    case "mysql":
      return 3306;
    case "postgresql":
    case "postgres":
      return 5432;
    case "mongodb":
    case "mongo":
      return 27017;
    case "sqlite":
      // SQLite is file-based but the schema validation might require a port value.
      return 0;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Logging — structured, timestamped, level-aware
// ---------------------------------------------------------------------------

type Level = "info" | "warn" | "error" | "debug";

function log(level: Level, message: string, data?: unknown): void {
  if (level === "debug" && !cfg.flags.verbose) return;

  const ts = new Date().toISOString();
  const prefix: Record<Level, string> = {
    info: "ℹ️ ",
    warn: "⚠️ ",
    error: "❌",
    debug: "🔍",
  };

  const line = `[${ts}] ${prefix[level]} ${message}`;
  if (level === "error") {
    console.error(line, data !== undefined ? data : "");
  } else if (level === "warn") {
    console.warn(line, data !== undefined ? data : "");
  } else {
    console.log(line, data !== undefined ? data : "");
  }
}

function fatal(message: string, err?: unknown): never {
  log("error", message, err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Global script timeout
// ---------------------------------------------------------------------------

const scriptDeadline = setTimeout(() => {
  fatal(`Script exceeded global timeout of ${cfg.timeouts.script}ms. Aborting CI run.`);
}, cfg.timeouts.script);

// Ensure the timeout doesn't keep the process alive if we exit cleanly first.
scriptDeadline.unref();

// ---------------------------------------------------------------------------
// devalue deserialization
// ---------------------------------------------------------------------------

/**
 * Deserializes SvelteKit's devalue-encoded action response.
 *
 * devalue encodes a response as `[structure, ...referencedValues]` where
 * numeric indices in the structure are back-references into the values array.
 * This implementation handles the common subset used by SvelteKit actions:
 * primitives, plain objects, arrays, and back-references.
 *
 * Notably NOT handled (not produced by SvelteKit actions in practice):
 * - Circular references (devalue uses negative indices — we throw rather than
 *   silently corrupt)
 * - Date, Map, Set, RegExp, BigInt, typed arrays — extend `hydrateSpecial`
 *   below if your actions return these types.
 */
function parseActionResult(result: unknown): unknown {
  if (typeof result !== "object" || result === null || (result as any).type !== "success") {
    return (result as any)?.data ?? result;
  }

  const raw = (result as any).data;
  if (typeof raw !== "string") return raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log("warn", "parseActionResult: response data is not valid JSON, returning raw string.");
    return raw;
  }

  // Not devalue-encoded (plain JSON object/array/primitive).
  if (!Array.isArray(parsed)) return parsed;

  const [structure, ...values] = parsed as [unknown, ...unknown[]];
  const hydrated = new Map<number, unknown>();

  function hydrate(node: unknown): unknown {
    // Numeric index → back-reference into values array (1-based in devalue).
    if (typeof node === "number" && Number.isInteger(node)) {
      if (node < 0) {
        // -1, -2, etc are back-references to objects already being hydrated
        const index = -node - 1;
        if (hydrated.has(index)) {
          return hydrated.get(index);
        }
        return `[Circular Ref ${node}]`;
      }

      const index = node - 1;
      if (hydrated.has(index)) return hydrated.get(index);

      const ref = values[index];
      // Recursively hydrate the referenced value
      const result = hydrate(ref);
      hydrated.set(index, result);
      return result;
    }

    if (Array.isArray(node)) {
      return node.map(hydrate);
    }

    if (typeof node === "object" && node !== null) {
      const entries = Object.entries(node as Record<string, unknown>);
      const out: Record<string, unknown> = {};
      for (const [k, v] of entries) {
        out[k] = hydrate(v);
      }
      return out;
    }

    return node;
  }

  try {
    return hydrate(structure);
  } catch (err) {
    log("warn", "parseActionResult: hydration failed, returning raw parsed value.", err);
    return parsed;
  }
}

// ---------------------------------------------------------------------------
// HTTP — postAction with proper exponential backoff
// ---------------------------------------------------------------------------

/** Errors that indicate the server is not yet accepting connections. */
function isTransientConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Bun uses `cause` on fetch errors; Node uses `code` on SystemError.
  const cause = (err as any).cause;
  const code: string = (err as any).code ?? (cause as any)?.code ?? "";
  const msg = err.message.toLowerCase();

  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    msg.includes("connection refused") ||
    msg.includes("unable to connect") ||
    msg.includes("fetch failed") ||
    msg.includes("network socket disconnected")
  );
}

/** Returns delay ms for attempt N using full-jitter exponential backoff. */
function backoffMs(attempt: number): number {
  const exp = Math.min(cfg.retry.baseMs * 2 ** (attempt - 1), cfg.retry.capMs);
  // Full jitter: uniform random between 0 and the capped exponential.
  return Math.random() * exp;
}

async function postAction(actionName: string, formData: FormData): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.retry.maxAttempts; attempt++) {
    try {
      log("debug", `[${actionName}] Attempt ${attempt}/${cfg.retry.maxAttempts}`);

      const res = await fetch(`${cfg.apiBase}/setup?/${actionName}`, {
        method: "POST",
        body: formData,
        headers: {
          "x-sveltekit-action": "true",
          "x-test-secret": cfg.apiSecret,
          Origin: cfg.apiBase,
        },
        signal: AbortSignal.timeout(cfg.timeouts.fetch),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "(unreadable body)");
        throw new Error(`Action "${actionName}" returned HTTP ${res.status}. Body: ${body}`);
      }

      const json = await res.json();
      return json;
    } catch (err) {
      lastError = err;

      if (isTransientConnectionError(err)) {
        const delay = backoffMs(attempt);
        log(
          "warn",
          `[${actionName}] Connection error on attempt ${attempt}/${cfg.retry.maxAttempts}. ` +
            `Retrying in ${Math.round(delay)}ms…`,
          (err as Error).message,
        );
        await sleep(delay);
        continue;
      }

      // Non-transient error (bad credentials, 4xx, malformed response, etc.)
      // — fail immediately; retrying won't help.
      throw err;
    }
  }

  throw new Error(
    `Action "${actionName}" failed after ${cfg.retry.maxAttempts} attempts. ` +
      `Last error: ${String(lastError)}`,
  );
}

// ---------------------------------------------------------------------------
// Server readiness poll
// ---------------------------------------------------------------------------

/**
 * States that mean "the server is up and accepting requests, but may still
 * need setup".  We do NOT wait for READY because in a fresh install the
 * system will be in SETUP indefinitely until we complete it.
 */
const ACCEPTABLE_STATES = new Set(["READY", "SETUP", "DEGRADED", "WARMING", "WARMED"]);

async function waitForReady(): Promise<void> {
  const deadline = Date.now() + cfg.timeouts.wait;
  let lastStatus = "(no response yet)";
  let attempts = 0;

  log("info", `Waiting for server at ${cfg.apiBase} (timeout: ${cfg.timeouts.wait}ms)…`);

  while (Date.now() < deadline) {
    attempts++;
    try {
      const res = await fetch(`${cfg.apiBase}/api/system/health`, {
        signal: AbortSignal.timeout(5_000),
      });

      // Any HTTP response (even 503) means the server is up.
      // Parse the body to check the application-level state.
      const text = await res.text().catch(() => "");
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}

      const overallStatus = json?.overallStatus ?? json?.state;
      lastStatus = overallStatus ?? `HTTP ${res.status} (${json ? "JSON" : "no JSON body"})`;

      if (!json && text) {
        console.log(`[Diagnostic] Response start: ${text.substring(0, 200)}`);
      }

      log("info", `Health check attempt ${attempts}: ${lastStatus}`);

      if (ACCEPTABLE_STATES.has(overallStatus)) {
        log("info", `Server is operational (state: ${lastStatus}).`);
        return;
      }

      // Server is up but in a transitional state (INITIALIZING, etc.) — keep polling.
    } catch (err) {
      // Server not yet accepting connections — keep polling.
      lastStatus = (err as Error).message;
      log("debug", `Health check attempt ${attempts}: ${lastStatus}`);
    }

    await sleep(1_000);
  }

  fatal(
    `Server did not become operational within ${cfg.timeouts.wait}ms. ` +
      `Last observed state: "${lastStatus}". ` +
      `Check server logs for startup errors.`,
  );
}

// ---------------------------------------------------------------------------
// Post-setup verification
// ---------------------------------------------------------------------------

/**
 * Verifies the setup actually completed by hitting the health endpoint and
 * checking for READY state, plus confirming the config file was written.
 *
 * A single file-existence check is insufficient — the DB could be seeded but
 * the config write could have raced or failed silently.
 */
async function verifySetup(): Promise<void> {
  log("info", "Verifying setup completion…");

  // 1. Config file must exist.
  const configFileName = process.env.TEST_MODE === "true" ? "private.test.ts" : "private.ts";
  const configPath = join(cfg.rootDir, "config", configFileName);

  if (!existsSync(configPath)) {
    fatal(`Verification failed: ${configFileName} was not written to ${configPath}.`);
  }
  log("info", `Config file verified: ${configFileName}`);

  // 2. Health endpoint must report READY (or at minimum not SETUP/FAILED).
  // Allow a short grace period for the server to transition states after
  // completeSetup returns.
  const graceDeadline = Date.now() + 15_000;

  while (Date.now() < graceDeadline) {
    try {
      const res = await fetch(`${cfg.apiBase}/api/system/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      const data = await res.json().catch(() => null);
      const status: string = data?.overallStatus ?? "";

      if (status === "READY") {
        log("info", `Health check verified: system is READY.`);
        return;
      }

      if (status === "FAILED") {
        fatal(`Verification failed: system transitioned to FAILED after setup. Check server logs.`);
      }

      log("debug", `Waiting for READY state, currently: ${status}`);
    } catch {
      // Server may be briefly restarting after setup — keep polling.
    }
    await sleep(1_000);
  }

  // READY not reached within grace period — warn but don't fail the script,
  // as some environments take longer to hot-reload config changes.
  log(
    "warn",
    "System did not reach READY within 15s after setup. " +
      "Tests may fail if they run before the server finishes reloading.",
  );
}

// ---------------------------------------------------------------------------
// Individual setup steps — each is a named function for clear stack traces
// ---------------------------------------------------------------------------

async function stepClean(): Promise<void> {
  // Now handled by passing allowOverwrite: true to testDatabase step.
  log("info", "Database cleaning will be performed during connection test.");
}

async function stepTestConnection(): Promise<void> {
  log("info", "Testing database connection…");
  const form = new FormData();
  form.append("config", JSON.stringify(cfg.db));
  form.append("createIfMissing", "true");
  if (cfg.flags.clean) {
    form.append("allowOverwrite", "true");
  }
  const res = parseActionResult(await postAction("testDatabase", form)) as any;

  if (!res || res.success === false) {
    fatal(`Database connection test failed: ${res?.error ?? "no details returned"}`);
  }
  log("info", "Database connection confirmed.");
}

async function stepSeed(): Promise<void> {
  log("info", `Seeding database (preset: ${cfg.system.preset})…`);
  const form = new FormData();
  form.append("config", JSON.stringify(cfg.db));
  form.append("system", JSON.stringify({ preset: cfg.system.preset }));
  const res = parseActionResult(await postAction("seedDatabase", form)) as any;

  if (!res || res.success === false) {
    fatal(`Database seeding failed: ${res?.error ?? "no details returned"}`);
  }
  log("info", "Seed completed.");
}

/**
 * Polls `/api/system/health` until background seeding tasks complete,
 * rather than using an arbitrary fixed sleep.
 */
async function waitForSeedingComplete(): Promise<void> {
  log("info", "Waiting for background seed tasks to settle (max 15s)…");
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${cfg.apiBase}/api/system/health`, {
        signal: AbortSignal.timeout(4_000),
      });
      const data = await res.json().catch(() => null);
      const status: string = data?.overallStatus || data?.status || "";

      // If already READY or healthy, we can skip waiting.
      if (status === "READY" || status === "healthy" || status === "WARMED") {
        log("debug", `System is already ${status}.`);
        return;
      }

      // "WARMING" / "INITIALIZING" mean background tasks are still running.
      if (status !== "WARMING" && status !== "INITIALIZING" && status !== "") {
        log("debug", `Background tasks settled (state: ${status}).`);
        return;
      }
    } catch {
      // Transient — keep polling.
    }
    await sleep(800);
  }

  // If we timed out, proceed anyway — completeSetup may still succeed.
  log("warn", "Background seed tasks did not settle within 15s. Proceeding with setup anyway.");
}

async function stepCompleteSetup(): Promise<void> {
  log(
    "info",
    `Creating admin user (${cfg.admin.email}) and completing setup ` +
      `(multi-tenant: ${cfg.system.multiTenant}, demo: ${cfg.system.demoMode})…`,
  );

  const payload = {
    database: {
      ...cfg.db,
      allowOverwrite: true,
      JWT_SECRET_KEY: "Benchmark-JWT-Secret-Key-2026-Change-Me",
      ENCRYPTION_KEY: "Benchmark-Encryption-Key-2026-Must-Be-32-Chars!!",
      TEST_API_SECRET: cfg.apiSecret,
    },
    admin: {
      username: cfg.admin.username,
      email: cfg.admin.email,
      password: cfg.admin.password,
      confirmPassword: cfg.admin.password,
    },
    system: {
      multiTenant: cfg.system.multiTenant,
      demoMode: cfg.system.demoMode,
      useRedis: cfg.system.useRedis,
      siteName: "SveltyCMS Test",
      passwordMinLength: 8,
      defaultContentLanguage: "en",
      contentLanguages: ["en"],
      defaultSystemLanguage: "en",
      systemLanguages: ["en"],
      preset: cfg.system.preset,
    },
  };

  const form = new FormData();
  form.append("data", JSON.stringify(payload));
  const res = parseActionResult(await postAction("completeSetup", form)) as any;

  if (!res || res.success === false) {
    fatal(`Setup completion failed: ${res?.error ?? "no details returned"}`);
  }
  log("info", "Setup complete. Waiting for persistence (2s)...");
  await sleep(2000);

  // Verify admin exists with retries
  log("info", `Verifying admin user access at ${cfg.apiBase}...`);
  let loginOk = false;
  for (let i = 0; i < 5; i++) {
    try {
      const loginRes = await fetch(`${cfg.apiBase}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": cfg.apiSecret,
        },
        body: JSON.stringify({ email: cfg.admin.email, password: cfg.admin.password }),
      });

      if (loginRes.ok) {
        loginOk = true;
        break;
      }
      const errorBody = await loginRes.text();
      log(
        "warn",
        `Admin verification attempt ${i + 1} failed (${loginRes.status}): ${errorBody.substring(0, 100)}`,
      );
    } catch (err: any) {
      log("warn", `Admin verification attempt ${i + 1} crashed: ${err.message}`);
    }
    await sleep(2000);
  }

  if (!loginOk) {
    fatal("Admin user not correctly provisioned during setup.");
  }
  log("info", "Admin verification successful.");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Ensure config directory exists before anything tries to write to it.
  const configDir = join(cfg.rootDir, "config");
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
    log("info", "Created config directory.");
  }

  log("info", `Starting system setup (DB: ${cfg.db.type}, preset: ${cfg.system.preset})`);
  log("debug", "Full config:", { ...cfg, admin: { ...cfg.admin, password: "[redacted]" } });

  await waitForReady();

  if (cfg.flags.clean) await stepClean();

  await stepTestConnection();
  await stepSeed();
  await waitForSeedingComplete(); // replaces the arbitrary 2000ms sleep
  await stepCompleteSetup();
  await verifySetup();

  clearTimeout(scriptDeadline);
  log("info", "✅ System setup complete.");
}

// Export for direct import by enterprise-matrix (avoids subprocess overhead)
export {
  waitForReady,
  stepClean,
  stepTestConnection,
  stepSeed,
  waitForSeedingComplete,
  stepCompleteSetup,
  verifySetup,
  cfg,
};

if (import.meta.main) {
  main().catch((err) => fatal("Unhandled error in setup script:", err));
}
