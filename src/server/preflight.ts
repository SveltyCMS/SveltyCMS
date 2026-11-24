/**
 * @file src/server/preflight.ts
 * @description Production boot preflight checks enforcing fail-closed secret and session configuration.
 *
 * Features:
 * - Validates JWT_SECRET_KEY and ENCRYPTION_KEY presence and minimum 32-byte entropy
 * - Enforces distinct RATE_LIMIT_SECRET in production
 * - Validates ORIGIN when running under Node adapter
 * - Requires explicit opt-in for unbounded sessions (SESSION_MAX_PER_USER=0)
 */

export interface PreflightEnv {
  NODE_ENV?: string;
  ADAPTER?: string;
  ORIGIN?: string;
  JWT_SECRET_KEY?: string;
  ENCRYPTION_KEY?: string;
  RATE_LIMIT_SECRET?: string;
  SESSION_MAX_PER_USER?: string;
  ALLOW_UNBOUNDED_SESSIONS?: string;
  TEST_MODE?: string;
  PLAYWRIGHT_TEST?: string;
  BENCHMARK?: string;
  SVELTY_STRICT_PREFLIGHT?: string;
}

export interface PreflightOptions {
  /**
   * When false (e.g., first-boot production install before the Setup Wizard
   * writes `config/private.ts`), skip secret-presence checks.
   * Defaults to true for standalone callers.
   */
  setupComplete?: boolean;
  /**
   * When true, secrets live in `config/private.ts` and are hydrated lazily
   * after module load, so missing env vars are allowed unless explicitly set
   * weak or `SVELTY_STRICT_PREFLIGHT="true"`.
   */
  allowConfigFileSecrets?: boolean;
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
}

const MIN_SECRET_BYTES = 32;

function hasSufficientEntropy(secret: string | undefined): boolean {
  if (!secret) return false;
  return Buffer.byteLength(secret, "utf8") >= MIN_SECRET_BYTES;
}

/**
 * Evaluates production boot invariants against the provided environment map.
 */
export function checkProductionPreflight(
  env: PreflightEnv = process.env,
  options: PreflightOptions = {},
): PreflightResult {
  if (
    env.NODE_ENV !== "production" ||
    env.TEST_MODE === "true" ||
    env.PLAYWRIGHT_TEST === "true" ||
    env.BENCHMARK === "true"
  ) {
    return { ok: true, errors: [] };
  }

  const errors: string[] = [];
  const setupComplete = options.setupComplete ?? true;
  const requireEnvSecrets =
    setupComplete && (!options.allowConfigFileSecrets || env.SVELTY_STRICT_PREFLIGHT === "true");

  if (requireEnvSecrets || env.JWT_SECRET_KEY !== undefined) {
    if (!hasSufficientEntropy(env.JWT_SECRET_KEY)) {
      errors.push("JWT_SECRET_KEY must be set and at least 32 bytes in production.");
    }
  }

  if (requireEnvSecrets || env.ENCRYPTION_KEY !== undefined) {
    if (!hasSufficientEntropy(env.ENCRYPTION_KEY)) {
      errors.push("ENCRYPTION_KEY must be set and at least 32 bytes in production.");
    }
  }

  if (requireEnvSecrets || env.RATE_LIMIT_SECRET !== undefined) {
    if (!hasSufficientEntropy(env.RATE_LIMIT_SECRET)) {
      errors.push("RATE_LIMIT_SECRET must be set and at least 32 bytes in production.");
    } else if (env.RATE_LIMIT_SECRET === env.JWT_SECRET_KEY) {
      errors.push("RATE_LIMIT_SECRET must be distinct from JWT_SECRET_KEY in production.");
    }
  }

  if (env.ADAPTER === "node" && !env.ORIGIN) {
    errors.push("ORIGIN must be set when running with ADAPTER=node in production.");
  }

  if (env.SESSION_MAX_PER_USER === "0" && env.ALLOW_UNBOUNDED_SESSIONS !== "true") {
    errors.push(
      "SESSION_MAX_PER_USER=0 (unbounded sessions) requires explicit ALLOW_UNBOUNDED_SESSIONS=true in production.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Runs production preflight checks and throws an Error if any invariant fails.
 */
export function assertProductionPreflight(
  env: PreflightEnv = process.env,
  options: PreflightOptions = {},
): void {
  const result = checkProductionPreflight(env, options);
  if (!result.ok) {
    throw new Error(`[Preflight] Production boot aborted:\n- ${result.errors.join("\n- ")}`);
  }
}
