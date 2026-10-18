/**
 * @file src/utils/security/envelope.ts
 * @description Versioned at-rest envelope helpers with key IDs and a decrypt ring.
 *
 * ### Why
 * `v1` envelopes carry no key identifier, so a key rotation cannot be done
 * without re-encrypting every row and guessing which key applies. `v2`
 * envelopes carry a `<keyId>`; decryption selects exactly one key, and a
 * configured ring keeps old keys available during a rotation window.
 *
 * ### Formats
 * - Colon (collection fields): `v2:<keyId>:<iv>:<tag>:<ciphertext>` (base64url)
 *   v1 stays readable: `v1:<iv>:<tag>:<ciphertext>`
 * - Binary (plugin settings, TOTP): `[2][kidLen][kid][iv][tag][ciphertext]`
 *   v1 stays readable: `[1][iv][tag][ciphertext]`
 * - Backup: `"SCHB2"[kidLen][kid][iv][ciphertext][tag]`
 *   legacy stays readable: `[iv][ciphertext][tag]`
 *
 * v2 decryption is fail-closed: an unknown key ID returns no keys rather than
 * trying unrelated keys. v1 decryption tries the primary, the configured ring
 * and the legacy derivations, because it cannot identify the key.
 */

import { resolveStaticAesKey } from "./crypto";

/** Longest accepted key ID. IDs are operator-facing labels, not secrets. */
const MAX_KEY_ID_LENGTH = 64;
const KEY_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const BACKUP_MAGIC = Buffer.from("SCHB2", "ascii");

export interface KeyRingEntry {
  id: string;
  key: Buffer;
}

export interface ResolvedKeyRing {
  primaryId: string;
  primary: Buffer;
  /** Primary first, then configured ring entries (deduplicated by key bytes). */
  entries: KeyRingEntry[];
  /** Legacy derivations with no key ID — only valid for v1 decryption. */
  legacy: Buffer[];
}

interface KeyRingCrypto {
  hkdfSync: typeof import("node:crypto").hkdfSync;
  createHash: typeof import("node:crypto").createHash;
}

/** Stable, non-secret key ID derived from the key bytes (16 hex chars). */
export function deriveKeyId(
  key: Buffer,
  createHashFn: typeof import("node:crypto").createHash,
): string {
  return createHashFn("sha256").update(key).digest("hex").slice(0, 16);
}

function normalizeKeyId(candidate: string | undefined, fallback: string): string {
  const trimmed = candidate?.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return fallback;
  return KEY_ID_RE.test(trimmed) ? trimmed : fallback;
}

/**
 * Parse a `{ "<keyId>": "<raw key>" }` JSON map. Invalid entries are skipped
 * (the caller logs), never thrown — a bad ring entry must not take the app down.
 */
export function parseKeyRingJson(json: string | undefined): Array<{ id: string; raw: string }> {
  if (!json || !json.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const entries: Array<{ id: string; raw: string }> = [];
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string" || value.length === 0) continue;
    if (!KEY_ID_RE.test(id)) continue;
    entries.push({ id, raw: value });
  }
  return entries;
}

/**
 * Resolve the primary key plus an optional decrypt ring.
 *
 * @param keyId Explicit primary ID (`ENCRYPTION_KEY_ID` / `SECRET_ENCRYPTION_KEY_ID`).
 * @param ringJson Optional `{ "<keyId>": "<raw key>" }` JSON (`*_KEY_RING`).
 */
export function resolveKeyRing(
  cryptoMod: KeyRingCrypto,
  raw: string,
  info: string,
  options: { keyId?: string; ringJson?: string } = {},
): ResolvedKeyRing {
  const primary = resolveStaticAesKey(cryptoMod, raw, info);
  const primaryId = normalizeKeyId(
    options.keyId,
    deriveKeyId(primary.primary, cryptoMod.createHash),
  );

  const entries: KeyRingEntry[] = [{ id: primaryId, key: primary.primary }];
  const legacy: Buffer[] = [...primary.fallbacks];

  for (const candidate of parseKeyRingJson(options.ringJson)) {
    const resolved = resolveStaticAesKey(cryptoMod, candidate.raw, info);
    if (!entries.some((entry) => entry.key.equals(resolved.primary))) {
      entries.push({
        id: normalizeKeyId(candidate.id, deriveKeyId(resolved.primary, cryptoMod.createHash)),
        key: resolved.primary,
      });
    }
    legacy.push(...resolved.fallbacks);
  }

  return { primaryId, primary: primary.primary, entries, legacy };
}

// ─── Colon envelopes (collection fields) ────────────────────────────────────

export interface ParsedColonEnvelope {
  version: 1 | 2;
  keyId?: string;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

const COLON_V1_RE = /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]*$/;
const COLON_V2_RE = /^v2:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]*$/;

export function isColonEnvelope(value: unknown): value is string {
  return typeof value === "string" && (COLON_V1_RE.test(value) || COLON_V2_RE.test(value));
}

export function parseColonEnvelope(value: string): ParsedColonEnvelope | null {
  if (COLON_V2_RE.test(value)) {
    const [, keyId, iv, tag, ciphertext] = value.split(":");
    return {
      version: 2,
      keyId,
      iv: Buffer.from(iv, "base64url"),
      tag: Buffer.from(tag, "base64url"),
      ciphertext: Buffer.from(ciphertext, "base64url"),
    };
  }
  if (COLON_V1_RE.test(value)) {
    const [, iv, tag, ciphertext] = value.split(":");
    return {
      version: 1,
      iv: Buffer.from(iv, "base64url"),
      tag: Buffer.from(tag, "base64url"),
      ciphertext: Buffer.from(ciphertext, "base64url"),
    };
  }
  return null;
}

export function encodeColonEnvelope(
  iv: Buffer,
  tag: Buffer,
  ciphertext: Buffer,
  keyId: string,
): string {
  return `v2:${keyId}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

// ─── Binary envelopes (plugin settings, TOTP) ───────────────────────────────

export interface ParsedBinaryEnvelope {
  version: 1 | 2;
  keyId?: string;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

export function encodeBinaryEnvelope(
  iv: Buffer,
  tag: Buffer,
  ciphertext: Buffer,
  keyId: string,
): Buffer {
  const id = Buffer.from(keyId, "utf8");
  return Buffer.concat([Buffer.from([2, id.length]), id, iv, tag, ciphertext]);
}

export function parseBinaryEnvelope(
  combined: Buffer,
  ivLength: number,
  tagLength: number,
): ParsedBinaryEnvelope | null {
  if (combined.length < 1) return null;

  if (combined[0] === 2) {
    if (combined.length < 2) return null;
    const idLength = combined[1];
    if (idLength === 0 || idLength > MAX_KEY_ID_LENGTH) return null;
    const offset = 2 + idLength;
    if (combined.length < offset + ivLength + tagLength) return null;
    const keyId = combined.subarray(2, offset).toString("utf8");
    if (!KEY_ID_RE.test(keyId)) return null;
    return {
      version: 2,
      keyId,
      iv: combined.subarray(offset, offset + ivLength),
      tag: combined.subarray(offset + ivLength, offset + ivLength + tagLength),
      ciphertext: combined.subarray(offset + ivLength + tagLength),
    };
  }

  if (combined[0] === 1) {
    const offset = 1;
    if (combined.length < offset + ivLength + tagLength) return null;
    return {
      version: 1,
      iv: combined.subarray(offset, offset + ivLength),
      tag: combined.subarray(offset + ivLength, offset + ivLength + tagLength),
      ciphertext: combined.subarray(offset + ivLength + tagLength),
    };
  }

  return null;
}

// ─── Backup envelopes ───────────────────────────────────────────────────────

export interface ParsedBackupEnvelope {
  version: 1 | 2;
  keyId?: string;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

export function encodeBackupEnvelope(
  iv: Buffer,
  ciphertext: Buffer,
  tag: Buffer,
  keyId: string,
): Buffer {
  const id = Buffer.from(keyId, "utf8");
  return Buffer.concat([BACKUP_MAGIC, Buffer.from([id.length]), id, iv, ciphertext, tag]);
}

export function parseBackupEnvelope(
  combined: Buffer,
  ivLength: number,
  tagLength: number,
): ParsedBackupEnvelope | null {
  if (
    combined.length >= BACKUP_MAGIC.length &&
    combined.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)
  ) {
    if (combined.length < BACKUP_MAGIC.length + 1) return null;
    const idLength = combined[BACKUP_MAGIC.length];
    if (idLength === 0 || idLength > MAX_KEY_ID_LENGTH) return null;
    const offset = BACKUP_MAGIC.length + 1 + idLength;
    if (combined.length < offset + ivLength + tagLength) return null;
    const keyId = combined
      .subarray(BACKUP_MAGIC.length + 1, BACKUP_MAGIC.length + 1 + idLength)
      .toString("utf8");
    if (!KEY_ID_RE.test(keyId)) return null;
    return {
      version: 2,
      keyId,
      iv: combined.subarray(offset, offset + ivLength),
      ciphertext: combined.subarray(offset + ivLength, combined.length - tagLength),
      tag: combined.subarray(combined.length - tagLength),
    };
  }

  if (combined.length < ivLength + tagLength) return null;
  return {
    version: 1,
    iv: combined.subarray(0, ivLength),
    ciphertext: combined.subarray(ivLength, combined.length - tagLength),
    tag: combined.subarray(combined.length - tagLength),
  };
}

// ─── Key selection ──────────────────────────────────────────────────────────

export interface KeySelection {
  keys: Buffer[];
  unknownKeyId: boolean;
}

/**
 * Select decryption keys for an envelope. v2 is exact-match and fail-closed;
 * v1 tries the primary, the configured ring and the legacy derivations.
 */
export function keysForEnvelope(
  ring: ResolvedKeyRing,
  envelope: { version: 1 | 2; keyId?: string },
): KeySelection {
  if (envelope.version === 2) {
    const entry = ring.entries.find((candidate) => candidate.id === envelope.keyId);
    return entry ? { keys: [entry.key], unknownKeyId: false } : { keys: [], unknownKeyId: true };
  }
  return {
    keys: [...ring.entries.map((entry) => entry.key), ...ring.legacy],
    unknownKeyId: false,
  };
}
