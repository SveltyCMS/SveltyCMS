/**
 * @file tests/integration/databases/adapter-test-env.ts
 * @description Shared gating + connection helpers for per-engine adapter suites.
 *
 * CI runs the full `tests/integration/` tree on every matrix job. Only the suite
 * matching `DB_TYPE` should execute; others must skip. Connection strings prefer
 * CI env (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) with Docker
 * Compose defaults as fallback.
 */

import {
  DOCKER_DEFAULT_DB_CREDENTIALS,
  getDefaultDbPort,
  getIntegrationDbName,
} from "../../../src/utils/test-db-credentials";
import { isDockerRunning } from "../helpers/docker";

export type AdapterEngine = "mongodb" | "mariadb" | "postgresql";

const DOCKER_HINT: Record<AdapterEngine, string> = {
  mongodb: "mongo",
  mariadb: "mariadb",
  postgresql: "postgres",
};

/** Normalize env DB_TYPE (matrix uses mongodb|mariadb|postgresql|sqlite). */
export function currentDbType(): string {
  return (process.env.DB_TYPE || process.env.db_type || "sqlite").toLowerCase().trim();
}

/**
 * Whether this adapter suite should run in the current process.
 * Requires: matching DB_TYPE + (local docker container OR CI, where CI always
 * has isDockerRunning=true and starts the profile for this matrix job).
 */
export function shouldRunAdapterSuite(engine: AdapterEngine): {
  run: boolean;
  reason: string;
} {
  const dbType = currentDbType();
  const dockerOk = isDockerRunning(DOCKER_HINT[engine]);
  const typeOk = dbType === engine;

  if (!typeOk) {
    return {
      run: false,
      reason: `DB_TYPE=${dbType || "none"} (need ${engine})`,
    };
  }
  if (!dockerOk && process.env.CI !== "true") {
    return {
      run: false,
      reason: `Docker container "${DOCKER_HINT[engine]}" not running`,
    };
  }
  return { run: true, reason: `DB_TYPE=${dbType} docker=${dockerOk}` };
}

export function adapterConnectionConfig(engine: AdapterEngine): {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  uri: string;
} {
  const creds = DOCKER_DEFAULT_DB_CREDENTIALS[engine] ?? { user: "", password: "" };
  const host = process.env.DB_HOST || "127.0.0.1";
  const port = process.env.DB_PORT || getDefaultDbPort(engine);
  const user = process.env.DB_USER || creds.user;
  const password = process.env.DB_PASSWORD || creds.password;
  const database = process.env.DB_NAME || getIntegrationDbName(engine);

  let uri: string;
  if (engine === "mongodb") {
    // Official mongo image: no auth by default
    uri =
      process.env.MONGO_URI || process.env.DATABASE_URL || `mongodb://${host}:${port}/${database}`;
  } else if (engine === "mariadb") {
    uri =
      process.env.DATABASE_URL ||
      `mariadb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  } else {
    uri =
      process.env.DATABASE_URL ||
      `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  return { host, port, user, password, database, uri };
}

/** Retry connect with clear errors (CI race: wait-on TCP before DB accepts auth). */
export async function connectWithRetry(
  engine: AdapterEngine,
  connect: (uri: string) => Promise<{ success: boolean; message?: string }>,
  options?: { attempts?: number; delayMs?: number },
): Promise<void> {
  const cfg = adapterConnectionConfig(engine);
  const attempts = options?.attempts ?? 8;
  const delayMs = options?.delayMs ?? 1500;
  let lastMsg = "unknown";

  for (let i = 1; i <= attempts; i++) {
    try {
      const result = await connect(cfg.uri);
      if (result?.success) return;
      lastMsg = result?.message || "connect returned success=false";
    } catch (err) {
      lastMsg = err instanceof Error ? err.message : String(err);
    }
    if (i < attempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new Error(
    [
      `${engine} adapter beforeAll failed after ${attempts} attempts`,
      `DB_TYPE=${currentDbType()}`,
      `host=${cfg.host}:${cfg.port}`,
      `database=${cfg.database}`,
      `user=${cfg.user || "(none)"}`,
      `uri=${cfg.uri.replace(/:[^:@/]+@/, ":***@")}`,
      `lastError=${lastMsg}`,
    ].join(" | "),
  );
}
