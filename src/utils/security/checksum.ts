/**
 * @file src/utils/security/checksum.ts
 * @description Optional SHA-384/SHA-512 checksum profile for new artifacts.
 *
 * Features:
 * - Env-driven algorithm selection (`CHECKSUM_ALGORITHM`, default `sha256`)
 * - SHA-256 output stays bare lowercase hex (compatible with stored values)
 * - SHA-384/SHA-512 output carries an `algorithm:` prefix for self-description
 * - Constant-time verification with a legacy bare-hex fallback
 *
 * @remarks
 * The serialization matches `createChecksum()` in `src/utils/security/crypto.ts`
 * (`JSON.stringify(data)`) so values remain comparable across both helpers.
 *
 * Existing append-only SHA-256 chains (audit ledger, already-written manifests)
 * MUST NOT be switched to another algorithm mid-chain: a verifier replaying the
 * chain recomputes every historical link with SHA-256. This profile is for new
 * artifacts only — new manifests, snapshots, or exports created after opting in.
 * Old bare-hex checksums keep verifying as SHA-256.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { logger } from "@utils/logger";

// --- Types & Constants ---

export type ChecksumAlgorithm = "sha256" | "sha384" | "sha512";

const DEFAULT_CHECKSUM_ALGORITHM: ChecksumAlgorithm = "sha256";

/** Expected lowercase-hex digest length per algorithm. */
const HEX_LENGTH_BY_ALGORITHM: Readonly<Record<ChecksumAlgorithm, number>> = {
  sha256: 64,
  sha384: 96,
  sha512: 128,
};

const KNOWN_ALGORITHMS: ReadonlySet<string> = new Set<ChecksumAlgorithm>([
  "sha256",
  "sha384",
  "sha512",
]);

// Only SHA-384/SHA-512 are emitted with a prefix; SHA-256 stays bare for
// backward compatibility with every checksum stored before this profile.
const PREFIXED_CHECKSUM_RE = /^(sha384|sha512):([0-9a-f]+)$/i;
const BARE_SHA256_RE = /^[0-9a-f]{64}$/i;

type ParsedChecksum = {
  algorithm: ChecksumAlgorithm;
  hex: string;
};

// --- Helpers ---

function hexLengthMatches(algorithm: ChecksumAlgorithm, hex: string): boolean {
  return hex.length === HEX_LENGTH_BY_ALGORITHM[algorithm];
}

function parseChecksum(value: string): ParsedChecksum | null {
  const prefixed = PREFIXED_CHECKSUM_RE.exec(value);
  if (prefixed) {
    const algorithm = prefixed[1].toLowerCase() as ChecksumAlgorithm;
    const hex = prefixed[2].toLowerCase();
    return hexLengthMatches(algorithm, hex) ? { algorithm, hex } : null;
  }

  // No recognized prefix: a bare digest can only be a legacy SHA-256 value.
  if (BARE_SHA256_RE.test(value)) {
    return { algorithm: "sha256", hex: value.toLowerCase() };
  }

  return null;
}

/**
 * Resolves the checksum algorithm for newly created artifacts.
 *
 * Reads `CHECKSUM_ALGORITHM` case-insensitively. Missing, empty, or unknown
 * values fall back to `sha256`; unknown values are logged at debug level.
 */
export function resolveChecksumAlgorithm(
  env: Record<string, string | undefined> = process.env,
): ChecksumAlgorithm {
  const raw = env.CHECKSUM_ALGORITHM;
  if (raw === undefined || raw === null) return DEFAULT_CHECKSUM_ALGORITHM;

  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return DEFAULT_CHECKSUM_ALGORITHM;

  if (KNOWN_ALGORITHMS.has(normalized)) {
    return normalized as ChecksumAlgorithm;
  }

  logger.debug(
    `[Checksum] Unknown CHECKSUM_ALGORITHM "${raw}" — falling back to ${DEFAULT_CHECKSUM_ALGORITHM}`,
  );
  return DEFAULT_CHECKSUM_ALGORITHM;
}

/**
 * Creates a checksum using the same `JSON.stringify(data)` serialization as
 * `createChecksum()` in `src/utils/security/crypto.ts`.
 *
 * - `sha256` → bare lowercase hex (64 chars), identical to legacy values.
 * - `sha384` / `sha512` → `<algorithm>:<hex>` so a verifier can identify the
 *   algorithm without out-of-band metadata.
 */
export function createChecksum(
  data: unknown,
  algorithm: ChecksumAlgorithm = resolveChecksumAlgorithm(),
): string {
  const hex = createHash(algorithm).update(JSON.stringify(data)).digest("hex");
  return algorithm === "sha256" ? hex : `${algorithm}:${hex}`;
}

/**
 * Verifies a checksum against freshly serialized data.
 *
 * Accepts prefixed SHA-384/SHA-512 values and legacy bare SHA-256 hex.
 * Comparison uses `timingSafeEqual`; malformed or unknown input fails closed.
 */
export function verifyChecksum(expected: string, data: unknown): boolean {
  if (typeof expected !== "string" || expected.length === 0) return false;

  const parsed = parseChecksum(expected);
  if (!parsed) return false;

  let actual: Buffer;
  try {
    actual = createHash(parsed.algorithm).update(JSON.stringify(data)).digest();
  } catch (err) {
    // Unserializable data (e.g. `undefined`) must never verify.
    logger.debug("[Checksum] Failed to serialize data for verification", {
      error: err instanceof Error ? err.message : String(err),
      algorithm: parsed.algorithm,
    });
    return false;
  }

  const expectedBytes = Buffer.from(parsed.hex, "hex");
  if (actual.length !== expectedBytes.length) return false;
  return timingSafeEqual(actual, expectedBytes);
}

/**
 * Reports whether a value is a well-formed prefixed checksum
 * (`sha384:` / `sha512:` followed by a correctly sized hex digest).
 * Bare legacy SHA-256 values return `false`.
 */
export function isPrefixedChecksum(value: string): boolean {
  if (typeof value !== "string") return false;
  const prefixed = PREFIXED_CHECKSUM_RE.exec(value);
  if (!prefixed) return false;
  const algorithm = prefixed[1].toLowerCase() as ChecksumAlgorithm;
  return hexLengthMatches(algorithm, prefixed[2]);
}
